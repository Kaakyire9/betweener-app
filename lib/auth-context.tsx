import { getOrCreateDeviceKeypair } from '@/lib/e2ee';
import { registerPushToken } from '@/lib/notifications/push';
import { clearSignupSession, consumeSignupMetadata, finalizeSignupPhoneVerification, getSignupPhoneState, updateSignupEventForUser } from '@/lib/signup-tracking';
import { supabase } from '@/lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from '@/supabase/types/database';
import { setSentryUser } from '@/lib/telemetry/sentry';

type Profile = Database['public']['Tables']['profiles']['Row'];

// Only allow writing actual DB columns (compile-time enforced). Also prevent callers
// from setting identity/system columns; those are controlled in auth-context.
type ProfileUpdateInput = Omit<
  Database['public']['Tables']['profiles']['Update'],
  'id' | 'user_id' | 'created_at' | 'updated_at'
>;

type AuthContextType = {
  // Auth State
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  
  // Loading States
  isLoading: boolean;
  isAuthenticating: boolean;
  
  // Auth Status
  isAuthenticated: boolean;
  hasProfile: boolean;
  isEmailVerified: boolean;
  phoneVerified: boolean;
  
  // Auth Actions
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshPhoneState: () => Promise<boolean>;
  
  // Profile Actions
  updateProfile: (updates: ProfileUpdateInput) => Promise<{ error: Error | null }>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const PHONE_VERIFIED_CACHE_KEY_PREFIX = "phone_verified_cache_v1:";
const PHONE_VERIFIED_CACHE_TTL_MS = 60_000;
const PROFILE_DIAG_TIMEOUT_MS = 8000;
const PROFILE_CACHE_TTL_MS = 60_000;
const RESUME_REFRESH_THROTTLE_MS = 10_000;
const RESUME_REFRESH_TIMEOUT_MS = 6_000;

const getPhoneVerifiedCacheKey = (userId: string) =>
  `${PHONE_VERIFIED_CACHE_KEY_PREFIX}${userId}`;

const diagnoseProfileFetch = async (userId: string) => {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    console.log("[auth] diagnoseProfileFetch: missing env");
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROFILE_DIAG_TIMEOUT_MS);
  const url = `${supabaseUrl}/rest/v1/profiles?select=id,profile_completed,phone_verified&user_id=eq.${userId}&limit=1`;
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      signal: controller.signal,
    });
    const ms = Date.now() - startedAt;
    console.log("[auth] diagnoseProfileFetch: rest", {
      status: res.status,
      ok: res.ok,
      ms,
    });
  } catch (error) {
    const ms = Date.now() - startedAt;
    console.log("[auth] diagnoseProfileFetch: error", { ms, error });
  } finally {
    clearTimeout(timeout);
  }
};

const fetchProfileViaRest = async (userId: string, accessToken?: string | null) => {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROFILE_DIAG_TIMEOUT_MS);
  const url = `${supabaseUrl}/rest/v1/profiles?select=*&user_id=eq.${userId}&limit=1`;
  try {
    const res = (await Promise.race([
      fetch(url, {
        method: "GET",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken || anonKey}`,
        },
        signal: controller.signal,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("profile_rest_timeout")), PROFILE_DIAG_TIMEOUT_MS + 200)
      ),
    ])) as Response;
    if (!res.ok) {
      let bodyText = "";
      try {
        bodyText = await res.text();
      } catch {
        bodyText = "<unreadable body>";
      }
      console.warn("[auth] fetchProfileViaRest: http error", { status: res.status, body: bodyText });
      return null;
    }
    const data = (await res.json()) as Array<Profile>;
    return data?.[0] ?? null;
  } catch (error) {
    console.warn("[auth] fetchProfileViaRest: fetch error", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const fetchProfilePhoneFlagsViaRest = async (
  userId: string,
  accessToken?: string | null,
  timeoutMs: number = 2500
) => {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${supabaseUrl}/rest/v1/profiles?select=phone_verified,phone_number&user_id=eq.${userId}&limit=1`;

  try {
    const res = (await Promise.race([
      fetch(url, {
        method: "GET",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken || anonKey}`,
        },
        signal: controller.signal,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("profile_flags_rest_timeout")), timeoutMs + 200)
      ),
    ])) as Response;

    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ phone_verified?: boolean | null; phone_number?: string | null }>;
    return data?.[0] ?? null;
  } catch (error) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.warn("[auth] fetchProfilePhoneFlagsViaRest: fetch error", error);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const ensureProfileExists = async (userId: string) => {
  try {
    const { error } = await supabase
      .from('profiles')
      .upsert({ user_id: userId }, { onConflict: 'user_id' });
    if (error) {
      console.warn('[auth] ensureProfileExists error', error);
    }
  } catch (error) {
    console.warn('[auth] ensureProfileExists exception', error);
  }
};

const fetchVerifiedPhoneViaRest = async (
  userId: string,
  accessToken?: string | null,
  timeoutMs: number = PROFILE_DIAG_TIMEOUT_MS
) => {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${supabaseUrl}/rest/v1/phone_verifications?select=phone_number,status,is_verified,verified_at&user_id=eq.${userId}&status=eq.verified&limit=1`;
  try {
    const res = (await Promise.race([
      fetch(url, {
        method: "GET",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken || anonKey}`,
        },
        signal: controller.signal,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("phone_rest_timeout")), timeoutMs + 200)
      ),
    ])) as Response;
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      phone_number?: string | null;
      status?: string | null;
      is_verified?: boolean | null;
      verified_at?: string | null;
    }>;
    return data?.[0] ?? null;
  } catch (error) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.warn("[auth] fetchVerifiedPhoneViaRest: fetch error", error);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const presenceUpdateAtRef = useRef(0);
  const resumeRefreshAtRef = useRef(0);
  const phoneRefreshInFlightRef = useRef(false);
  const profileCacheRef = useRef<{ userId: string; profile: Profile | null; fetchedAt: number } | null>(null);
  const accessTokenRef = useRef<string | null>(null);

  // Computed states
  const isAuthenticated = !!session && !!user;
  const hasProfile = !!profile && profile.profile_completed === true;
  const isEmailVerified = !!user?.email_confirmed_at;

  // Attach user id to crash/error reports (no PII beyond user id).
  useEffect(() => {
    setSentryUser(user?.id ?? null);
  }, [user?.id]);

  // Initialize auth state
  const getAccessToken = async () => {
    if (accessTokenRef.current) return accessTokenRef.current;
    if (session?.access_token) {
      accessTokenRef.current = session.access_token;
      return session.access_token;
    }
    try {
      const { data } = await Promise.race([
        supabase.auth.getSession(),
        new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 1500)
        ),
      ]);
      const token = data?.session?.access_token ?? null;
      accessTokenRef.current = token;
      return token;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[auth] initial session", {
          hasSession: !!session,
          hasUser: !!session?.user,
        });
      }
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth] onAuthStateChange", {
            event: _event,
            hasSession: !!session,
            hasUser: !!session?.user,
          });
        }
        accessTokenRef.current = session?.access_token ?? null;
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          await ensureProfileExists(session.user.id);
          const profileData = await fetchProfile(session.user.id);
          const metadata = await consumeSignupMetadata();
          await updateSignupEventForUser(session.user.id, metadata);

          await refreshPhoneState();
          const { verified } = await getSignupPhoneState();
          if (verified) {
            const ok = await finalizeSignupPhoneVerification();
            if (ok) {
              await clearSignupSession();
            } else if (typeof __DEV__ !== "undefined" && __DEV__) {
              console.log("[auth] finalize-signup failed; keeping signup session for retry");
            }
          }

          // refresh profile one more time if first fetch failed
          if (!profileData) {
            await fetchProfile(session.user.id);
          }
        } else {
          accessTokenRef.current = null;
          setProfile(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Fetch user profile
  const fetchProfile = async (userId: string) => {
    try {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[auth] fetchProfile: start", { userId });
      }
      const cached = profileCacheRef.current;
      if (cached && cached.userId === userId && Date.now() - cached.fetchedAt < PROFILE_CACHE_TTL_MS) {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth] fetchProfile: cache hit");
        }
        setProfile(cached.profile);
        return cached.profile;
      }

      const accessToken = await getAccessToken();
      let restProfile = await fetchProfileViaRest(userId, accessToken);
      if (!restProfile) {
        // create minimal row then retry once
        await ensureProfileExists(userId);
        restProfile = await fetchProfileViaRest(userId, accessToken);
      }
      if (!restProfile) {
        void diagnoseProfileFetch(userId);
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth] fetchProfile: rest fetch failed");
        }
        return null;
      }

      profileCacheRef.current = { userId, profile: restProfile, fetchedAt: Date.now() };
      setProfile(restProfile);
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[auth] fetchProfile: rest ok");
      }
      return restProfile;
    } catch (error) {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[auth] fetchProfile: error", error);
      }
      return null;
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  const refreshPhoneState = async (): Promise<boolean> => {
    if (phoneRefreshInFlightRef.current) return phoneVerified;
    phoneRefreshInFlightRef.current = true;
    let knownVerified = phoneVerified || profile?.phone_verified === true;
    try {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[auth] refreshPhoneState: start", {
          hasUser: !!user?.id,
          profilePhoneVerified: profile?.phone_verified ?? null,
          knownVerified,
        });
      }
      if (!user?.id) {
        setPhoneVerified(false);
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth] refreshPhoneState: no user -> false");
        }
        return false;
      }

      // Fast-path: if profile already says verified, treat it as source of truth.
      if (knownVerified) {
        setPhoneVerified(true);
        try {
          await AsyncStorage.setItem(
            getPhoneVerifiedCacheKey(user.id),
            JSON.stringify({ verified: true, expiresAt: Date.now() + PHONE_VERIFIED_CACHE_TTL_MS })
          );
        } catch {
          // ignore cache errors
        }
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth] refreshPhoneState: profile verified fast-path");
        }
        return true;
      }

      try {
        const cachedRaw = await AsyncStorage.getItem(getPhoneVerifiedCacheKey(user.id));
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw) as { verified?: boolean; expiresAt?: number };
          const isFresh = typeof cached.expiresAt === "number" && cached.expiresAt > Date.now();
          if (!isFresh) {
            await AsyncStorage.removeItem(getPhoneVerifiedCacheKey(user.id));
          } else if (cached.verified === true) {
            knownVerified = true;
            setPhoneVerified(true);
            if (typeof __DEV__ !== "undefined" && __DEV__) {
              console.log("[auth] refreshPhoneState: using cached verified");
            }
            return true;
          } else if (cached.verified === false) {
            // Cache can be used to avoid repeated network calls, but don't treat it as authoritative
            // if we later learn otherwise from profile/phone_verifications.
            if (typeof __DEV__ !== "undefined" && __DEV__) {
              console.log("[auth] refreshPhoneState: using cached unverified");
            }
          }
        }
      } catch {
        // ignore cache errors
      }

      // Primary check: profiles.phone_verified (abortable REST).
      const accessToken = await getAccessToken();
      const flags = await fetchProfilePhoneFlagsViaRest(user.id, accessToken, 2500);
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[auth] refreshPhoneState: profile flags", {
          phone_verified: flags?.phone_verified ?? null,
          has_phone_number: !!flags?.phone_number,
        });
      }

      if (flags?.phone_verified === true) {
        setPhoneVerified(true);
        try {
          await AsyncStorage.setItem(
            getPhoneVerifiedCacheKey(user.id),
            JSON.stringify({ verified: true, expiresAt: Date.now() + PHONE_VERIFIED_CACHE_TTL_MS })
          );
        } catch {
          // ignore cache errors
        }
        return true;
      }

      if (flags?.phone_verified === false) {
        setPhoneVerified(false);
        try {
          await AsyncStorage.setItem(
            getPhoneVerifiedCacheKey(user.id),
            JSON.stringify({ verified: false, expiresAt: Date.now() + PHONE_VERIFIED_CACHE_TTL_MS })
          );
        } catch {
          // ignore cache errors
        }
        return false;
      }

      const verifiedRow = await fetchVerifiedPhoneViaRest(user.id, accessToken, 2500);
      if (verifiedRow?.status === "verified" || verifiedRow?.is_verified === true) {
        setPhoneVerified(true);
        try {
          await AsyncStorage.setItem(
            getPhoneVerifiedCacheKey(user.id),
            JSON.stringify({ verified: true, expiresAt: Date.now() + PHONE_VERIFIED_CACHE_TTL_MS })
          );
        } catch {
          // ignore cache errors
        }
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth] refreshPhoneState: verified via phone_verifications rest");
        }
        return true;
      }
    } catch (error) {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[auth] refreshPhoneState: error", error);
      }
    } finally {
      phoneRefreshInFlightRef.current = false;
    }
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("[auth] refreshPhoneState: fallback known", { knownVerified });
    }
    return knownVerified;
  };

  const updatePresence = async (nextOnline: boolean) => {
    if (!user?.id) return;
    const now = Date.now();
    if (now - presenceUpdateAtRef.current < 5_000) return;
    presenceUpdateAtRef.current = now;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          online: nextOnline,
          last_active: new Date().toISOString(),
        })
        .eq('user_id', user.id);
      if (error) {
        console.error('[presence] update error', error);
      } else if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.log('[presence] set', { online: nextOnline });
      }
    } catch (error) {
      console.error('[presence] update error', error);
    }
  };

  const refreshSessionOnResume = async () => {
    if (!user?.id) return;
    const now = Date.now();
    if (now - resumeRefreshAtRef.current < RESUME_REFRESH_THROTTLE_MS) return;
    resumeRefreshAtRef.current = now;

    try {
      const { data, error } = await Promise.race([
        supabase.auth.refreshSession(),
        new Promise<{
          data: { session: Session | null };
          error: Error | null;
        }>((resolve) => setTimeout(() => resolve({ data: { session: null }, error: null }), RESUME_REFRESH_TIMEOUT_MS)),
      ]);

      if (error) {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth] refreshSessionOnResume: refresh error", error);
        }
        return;
      }

      if (data?.session) {
        accessTokenRef.current = data.session.access_token ?? null;
        setSession(data.session);
        setUser(data.session.user ?? null);
      }

      // Rehydrate critical app state to avoid "stuck" screens after background/network changes.
      await Promise.race([refreshProfile(), new Promise<void>((resolve) => setTimeout(resolve, 2500))]);
      await Promise.race([refreshPhoneState(), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2500))]);
    } catch (error) {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[auth] refreshSessionOnResume: exception", error);
      }
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;
    const setOnline = () => mounted && void updatePresence(true);
    const setOffline = () => mounted && void updatePresence(false);

    setOnline();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setOnline();
        // Fire-and-forget: don't block UI thread on resume.
        void refreshSessionOnResume();
      } else {
        setOffline();
      }
    });

    return () => {
      mounted = false;
      subscription.remove();
      void updatePresence(false);
    };
  }, [user?.id]);

  useEffect(() => {
    void refreshPhoneState();
  }, [user?.id, profile?.phone_verified]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const keypair = await getOrCreateDeviceKeypair();
        if (cancelled) return;
        const { data, error } = await supabase
          .from('profiles')
          .select('public_key')
          .eq('user_id', user.id)
          .maybeSingle();
        if (error) {
          console.error('[e2ee] fetch public key error', error);
          return;
        }
        if (!data?.public_key || data.public_key !== keypair.publicKeyB64) {
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ public_key: keypair.publicKeyB64 })
            .eq('user_id', user.id);
          if (updateError) {
            console.error('[e2ee] update public key error', updateError);
          }
        }
        await registerPushToken(user.id);
      } catch (error) {
        console.error('[e2ee] ensure identity error', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const signIn = async (email: string, password: string) => {
    setIsAuthenticating(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error };
    } finally {
      setIsAuthenticating(false);
    }
  };

  const signUp = async (email: string, password: string) => {
    setIsAuthenticating(true);
    try {
      // Use custom scheme for deep linking
      const redirectUrl = 'https://getbetweener.com/auth/callback';
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });
      return { error };
    } finally {
      setIsAuthenticating(false);
    }
  };

  const signOut = async () => {
    if (user?.id) {
      await updatePresence(false);
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error);
    }
  };

  const updateProfile = async (updates: ProfileUpdateInput) => {
    if (!user) return { error: new Error('No user found') };

    try {
      // Use upsert for profile creation/updates to handle both scenarios
      const { error } = await supabase
        .from('profiles')
        .upsert({
          ...updates,
          user_id: user.id,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        });

      if (!error) {
        await refreshProfile();
      }

      return { error };
    } catch (error) {
      console.error('Profile update error:', error);
      return { error: error as Error };
    }
  };

  const value: AuthContextType = {
    // State
    session,
    user,
    profile,
    isLoading,
    isAuthenticating,
    
    // Computed
    isAuthenticated,
    hasProfile,
    isEmailVerified,
    phoneVerified,
    
    // Actions
    signIn,
    signUp,
    signOut,
    refreshProfile,
    refreshPhoneState,
    updateProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Auth guard hook for protected routes
export function useAuthGuard() {
  const { isAuthenticated, isLoading, isEmailVerified, hasProfile, phoneVerified } = useAuth();
  
  return {
    isLoading,
    needsAuth: !isAuthenticated,
    needsEmailVerification: isAuthenticated && !isEmailVerified,
    needsPhoneVerification: isAuthenticated && isEmailVerified && !phoneVerified,
    needsProfileSetup: isAuthenticated && isEmailVerified && phoneVerified && !hasProfile,
    canAccessApp: isAuthenticated && isEmailVerified && phoneVerified && hasProfile,
  };
}
