import { getOrCreateDeviceKeypair } from '@/lib/e2ee';
import { registerPushToken } from '@/lib/notifications/push';
import { clearSignupSession, consumeSignupMetadata, finalizeSignupPhoneVerification, getSignupPhoneState, getSignupSessionId, updateSignupEventForUser } from '@/lib/signup-tracking';
import { supabase } from '@/lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Profile = {
  id: string;
  user_id: string;
  full_name: string;
  age: number;
  gender: string;
  bio: string;
  region: string;
  tribe: string;
  religion: string;
  avatar_url: string | null;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_precision?: string | null;
  location_updated_at?: string | null;
  superlikes_left?: number | null;
  min_age_interest: number;
  max_age_interest: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Photo upload and profile editing fields
  occupation?: string;
  education?: string;
  height?: string;
  looking_for?: string;
  photos?: string[];
  // HIGH PRIORITY lifestyle fields
  exercise_frequency?: string;
  smoking?: string;
  drinking?: string;
  // HIGH PRIORITY family fields
  has_children?: string;
  wants_children?: string;
  // HIGH PRIORITY personality fields
  personality_type?: string;
  love_language?: string;
  // HIGH PRIORITY living situation fields
  living_situation?: string;
  pets?: string;
  // HIGH PRIORITY languages field
  languages_spoken?: string[];
  // DIASPORA fields
  current_country?: string;
  diaspora_status?: 'LOCAL' | 'DIASPORA' | 'VISITING';
  willing_long_distance?: boolean;
  verification_level?: number;
  years_in_diaspora?: number;
  last_ghana_visit?: string;
  future_ghana_plans?: string;
  public_key?: string | null;
  phone_verified?: boolean;
  phone_number?: string | null;
  profile_completed?: boolean;
};

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
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: Error | null }>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const PHONE_VERIFIED_CACHE_KEY_PREFIX = "phone_verified_cache_v1:";
const PHONE_VERIFIED_CACHE_TTL_MS = 60_000;
const PROFILE_DIAG_TIMEOUT_MS = 8000;
const PROFILE_CACHE_TTL_MS = 60_000;

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
    const res = await fetch(url, {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken || anonKey}`,
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<Profile>;
    return data?.[0] ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const fetchVerifiedPhoneViaRest = async (userId: string, accessToken?: string | null) => {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROFILE_DIAG_TIMEOUT_MS);
  const url = `${supabaseUrl}/rest/v1/phone_verifications?select=phone_number,status,is_verified,verified_at&user_id=eq.${userId}&status=eq.verified&limit=1`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken || anonKey}`,
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      phone_number?: string | null;
      status?: string | null;
      is_verified?: boolean | null;
      verified_at?: string | null;
    }>;
    return data?.[0] ?? null;
  } catch {
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
  const phoneRefreshInFlightRef = useRef(false);
  const profileCacheRef = useRef<{ userId: string; profile: Profile | null; fetchedAt: number } | null>(null);

  // Computed states
  const isAuthenticated = !!session && !!user;
  const hasProfile = !!profile && profile.profile_completed === true;
  const isEmailVerified = !!user?.email_confirmed_at;

  // Initialize auth state
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
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          const profileData = await fetchProfile(session.user.id);
          const metadata = await consumeSignupMetadata();
          await updateSignupEventForUser(session.user.id, metadata);
          if (profileData) {
            await refreshPhoneState();
            const { verified } = await getSignupPhoneState();
            if (verified) {
              await finalizeSignupPhoneVerification();
              await clearSignupSession();
            }
          }
        } else {
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

      const accessToken = session?.access_token;
      const restProfile = await fetchProfileViaRest(userId, accessToken);
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

      if (!knownVerified) {
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
            }
          }
        } catch {
          // ignore cache errors
        }
      }

      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[auth] refreshPhoneState: profile lookup start");
      }
      const accessToken = session?.access_token;
      const restProfile = await fetchProfileViaRest(user.id, accessToken);
      let effectiveRow = restProfile
        ? { phone_verified: restProfile.phone_verified, phone_number: restProfile.phone_number }
        : null;
      if (restProfile) {
        profileCacheRef.current = { userId: user.id, profile: restProfile, fetchedAt: Date.now() };
        setProfile(restProfile);
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth] refreshPhoneState: rest ok");
        }
      } else if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[auth] refreshPhoneState: rest fetch failed");
      }

      if (effectiveRow) {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth] refreshPhoneState: profile row", effectiveRow);
        }
        if (effectiveRow.phone_verified === true) {
          setPhoneVerified(true);
          try {
            await AsyncStorage.setItem(
              getPhoneVerifiedCacheKey(user.id),
              JSON.stringify({ verified: true, expiresAt: Date.now() + PHONE_VERIFIED_CACHE_TTL_MS })
            );
          } catch {
            // ignore cache errors
          }
          await refreshProfile();
          if (typeof __DEV__ !== "undefined" && __DEV__) {
            console.log("[auth] refreshPhoneState: profile verified");
          }
          return true;
        }
        if (effectiveRow.phone_verified === false) {
          setPhoneVerified(false);
          try {
            await AsyncStorage.setItem(
              getPhoneVerifiedCacheKey(user.id),
              JSON.stringify({ verified: false, expiresAt: Date.now() + PHONE_VERIFIED_CACHE_TTL_MS })
            );
          } catch {
            // ignore cache errors
          }
          if (typeof __DEV__ !== "undefined" && __DEV__) {
            console.log("[auth] refreshPhoneState: profile verified=false");
          }
          return false;
        }
      }

      const verifiedRow = await fetchVerifiedPhoneViaRest(user.id, accessToken);
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

      // If signup verified happened before user auth attached, link it now.
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[auth] refreshPhoneState: signup session lookup");
      }
      const signupSessionId = await getSignupSessionId();
      if (signupSessionId) {
        try {
          await supabase.rpc("rpc_link_phone_verification", {
            p_signup_session_id: signupSessionId,
          });
        } catch {
          // ignore link errors; RPC status check below is source of truth
        }
      }

      const { data: phoneStatus, error: phoneStatusError } = await Promise.race([
        supabase.rpc("rpc_get_phone_verification_status"),
        new Promise<{ data: null; error: Error }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: new Error("phone_status_timeout") }), 6000)
        ),
      ]);
      if (phoneStatusError && typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[auth] refreshPhoneState: phone status rpc error", phoneStatusError);
      }
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[auth] refreshPhoneState: phone status rpc", phoneStatus);
      }
      if ((phoneStatus as { verified?: boolean } | null)?.verified === true) {
        setPhoneVerified(true);
        try {
          await AsyncStorage.setItem(
            getPhoneVerifiedCacheKey(user.id),
            JSON.stringify({ verified: true, expiresAt: Date.now() + PHONE_VERIFIED_CACHE_TTL_MS })
          );
        } catch {
          // ignore cache errors
        }
        await refreshProfile();
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth] refreshPhoneState: verified via rpc");
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

  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;
    const setOnline = () => mounted && void updatePresence(true);
    const setOffline = () => mounted && void updatePresence(false);

    setOnline();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setOnline();
      else setOffline();
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

  const updateProfile = async (updates: Partial<Profile>) => {
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
