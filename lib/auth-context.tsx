import { getOrCreateDeviceKeypair } from '@/lib/e2ee';
import { clearAppIconBadgeCount } from '@/lib/notifications/app-badge';
import { registerPushToken } from '@/lib/notifications/push';
import { clearSignupSession, consumeSignupMetadata, finalizeSignupPhoneVerification, getSignupPhoneState, updateSignupEventForUser } from '@/lib/signup-tracking';
import { persistSessionExpiredReason } from '@/lib/auth-session-reason';
import { resetChatDbForUserSignOut } from '@/lib/chat/local/chat-db';
import { clearChatBootCacheForUser } from '@/lib/chat/local/chat-boot-cache';
import { clearChatAttachmentPreviewsForOwner } from '@/lib/chat/attachments/chat-attachment-preview';
import { ChatUploadTransport } from '@/lib/chat/transfer/chat-upload-transport';
import { clearOfflineAttachmentsForOwner } from '@/lib/offline/attachment-file-store';
import { clearStagedOfflineChatUploadsForOwner } from '@/lib/offline/chat-store';
import { clearOfflineImagesForOwner } from '@/lib/offline/image-store';
import { clearOfflineVideosForOwner } from '@/lib/offline/video-store';
import {
  ensureFreshSession,
  initSupabaseAuthLifecycle,
  recoverSupabaseConnectivity,
  supabase,
} from '@/lib/supabase';
import { isLikelyNetworkError } from '@/lib/network';
import { isNetworkConnectionAvailable } from '@/lib/network-state';
import { enqueueProfileUpdateMutation } from '@/lib/offline/mutation-queue';
import { prepareProfileGuardInvocation } from '@/lib/profile-guard/write-payload';
import { fetchUserPresence, overlayPresence, setCurrentUserPresence } from '@/lib/user-presence';
import { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addEventListener as addNetInfoListener, fetch as fetchNetInfo } from '@react-native-community/netinfo';
import type { Database } from '@/supabase/types/database';
import { addBreadcrumb, setSentryUser } from '@/lib/telemetry/sentry';
import { isSupabaseAccessTokenUsable } from '@/lib/auth/session-token';
import { createPresenceWriteCoordinator } from '@/lib/presence-write-coordinator';

type Profile = Database['public']['Tables']['profiles']['Row'];
type FetchProfileOptions = { force?: boolean };
type PersistedAuthSnapshot = {
  session: Session;
  profile: Profile | null;
  phoneVerified: boolean;
  cachedAt: number;
};

export type AuthStatus =
  | 'offline_authenticated'
  | 'reconnecting_session'
  | 'session_refreshing'
  | 'authenticated'
  | 'session_expired'
  | 'unauthenticated';

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
  authStatus: AuthStatus;
  
  // Loading States
  isLoading: boolean;
  isAuthenticating: boolean;
  
  // Auth Status
  isAuthenticated: boolean;
  hasProfile: boolean;
  isEmailVerified: boolean;
  phoneVerified: boolean;
  authRecoveryPending: boolean;
  hadStableAppAccess: boolean;
  usingPersistedSessionFallback: boolean;
  isSessionRecoveryActive: boolean;
  canPerformAuthenticatedWrites: boolean;
  
  // Auth Actions
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<Profile | null>;
  refreshPhoneState: () => Promise<boolean>;
  retrySessionRecovery: (reason?: string) => Promise<boolean>;
  
  // Profile Actions
  updateProfile: (updates: ProfileUpdateInput) => Promise<{ error: Error | null; queued?: boolean }>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const PHONE_VERIFIED_CACHE_KEY_PREFIX = "phone_verified_cache_v1:";
const AUTH_SNAPSHOT_KEY = "auth_snapshot_v1";
const EXPLICIT_SIGN_OUT_KEY = "auth_explicit_sign_out_v1";
const PHONE_VERIFIED_CACHE_TTL_MS = 60_000;
const PROFILE_DIAG_TIMEOUT_MS = 8000;
const PROFILE_CACHE_TTL_MS = 60_000;
const RESUME_REFRESH_THROTTLE_MS = 10_000;
const AUTH_SNAPSHOT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const NETINFO_TIMEOUT_MS = 1200;
const UNREQUESTED_SIGNED_OUT_THROTTLE_MS = 15_000;
const RECOVERABLE_SESSION_RETRY_BACKOFF_MS = 60_000;
const PRESENCE_HEARTBEAT_MS = 60_000;

const isExpiredJwtError = (error: unknown) => {
  const code = String((error as any)?.code || '');
  const message = String((error as any)?.message || '').toLowerCase();
  return code === 'PGRST303' || message.includes('jwt expired');
};

const logAuthRecoveryEvent = (event: string, data?: Record<string, unknown>) => {
  addBreadcrumb(`[auth] ${event}`, data);
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[auth-recovery]', { event, ...(data ?? {}) });
  }
};

const getPhoneVerifiedCacheKey = (userId: string) =>
  `${PHONE_VERIFIED_CACHE_KEY_PREFIX}${userId}`;

const probeReachableNetwork = async () => {
  try {
    const state = await Promise.race([
      fetchNetInfo(),
      new Promise<ReturnType<typeof fetchNetInfo>>((_, reject) =>
        setTimeout(() => reject(new Error('netinfo_timeout')), NETINFO_TIMEOUT_MS),
      ),
    ]);
    return isNetworkConnectionAvailable(state);
  } catch {
    return false;
  }
};

const readPersistedAuthSnapshot = async (): Promise<PersistedAuthSnapshot | null> => {
  try {
    const raw = await AsyncStorage.getItem(AUTH_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedAuthSnapshot> | null;
    if (!parsed?.session?.user?.id) return null;
    if (
      typeof parsed.cachedAt === "number" &&
      Date.now() - parsed.cachedAt > AUTH_SNAPSHOT_TTL_MS
    ) {
      await AsyncStorage.removeItem(AUTH_SNAPSHOT_KEY);
      return null;
    }
    return {
      session: parsed.session as Session,
      profile: (parsed.profile as Profile | null) ?? null,
      phoneVerified: parsed.phoneVerified === true || parsed.profile?.phone_verified === true,
      cachedAt: typeof parsed.cachedAt === "number" ? parsed.cachedAt : Date.now(),
    };
  } catch {
    return null;
  }
};

const writePersistedAuthSnapshot = async (snapshot: PersistedAuthSnapshot) => {
  try {
    await AsyncStorage.setItem(AUTH_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // best effort only
  }
};

const clearPersistedAuthSnapshot = async () => {
  try {
    await AsyncStorage.removeItem(AUTH_SNAPSHOT_KEY);
  } catch {
    // best effort only
  }
};

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

type ProfileRestResult =
  | { status: "found"; profile: Profile }
  | { status: "missing" }
  | { status: "unavailable"; error?: unknown };

const fetchProfileViaRest = async (
  userId: string,
  accessToken?: string | null
): Promise<ProfileRestResult> => {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return { status: "unavailable" };
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
      return { status: "unavailable", error: { status: res.status, body: bodyText } };
    }
    const data = (await res.json()) as Profile[];
    const profile = data?.[0] ?? null;
    return profile ? { status: "found", profile } : { status: "missing" };
  } catch (error) {
    if (
      typeof __DEV__ !== "undefined" &&
      __DEV__ &&
      !isLikelyNetworkError(error)
    ) {
      console.warn("[auth] fetchProfileViaRest: fetch error", error);
    }
    return { status: "unavailable", error };
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
    const data = (await res.json()) as { phone_verified?: boolean | null; phone_number?: string | null }[];
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
    const data = (await res.json()) as {
      phone_number?: string | null;
      status?: string | null;
      is_verified?: boolean | null;
      verified_at?: string | null;
    }[];
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
  const [authStatus, setAuthStatus] = useState<AuthStatus>('unauthenticated');
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [authRecoveryPending, setAuthRecoveryPending] = useState(false);
  const [hadStableAppAccess, setHadStableAppAccess] = useState(false);
  const [usingPersistedSessionFallback, setUsingPersistedSessionFallback] = useState(false);
  const userRef = useRef<User | null>(null);
  const profileRef = useRef<Profile | null>(null);
  const presenceWriteCoordinatorRef = useRef<ReturnType<typeof createPresenceWriteCoordinator> | null>(null);
  if (!presenceWriteCoordinatorRef.current) {
    presenceWriteCoordinatorRef.current = createPresenceWriteCoordinator();
  }
  const authRecoveryPendingRef = useRef(authRecoveryPending);
  const usingPersistedSessionFallbackRef = useRef(usingPersistedSessionFallback);
  const resumeRefreshAtRef = useRef(0);
  const phoneRefreshInFlightRef = useRef(false);
  const phoneRefreshPromiseRef = useRef<Promise<boolean> | null>(null);
  const profileFetchPromiseRef = useRef<{
    userId: string;
    promise: Promise<Profile | null>;
  } | null>(null);
  const profileCacheRef = useRef<{ userId: string; profile: Profile | null; fetchedAt: number } | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const signOutRequestedRef = useRef(false);
  const currentSessionUserIdRef = useRef<string | null>(null);
  const lastUnrequestedSignedOutHandledAtRef = useRef(0);
  const sessionRecoveryInFlightRef = useRef<Promise<boolean> | null>(null);
  const authEventQueueRef = useRef<Promise<void>>(Promise.resolve());
  const nextSilentRecoveryAllowedAtRef = useRef(0);

  // Computed states
  const isAuthenticated = !!session && !!user;
  const hasProfile = !!profile && profile.profile_completed === true;
  const isEmailVerified = !!user?.email_confirmed_at;
  const isSessionRecoveryActive =
    authStatus === 'reconnecting_session' || authStatus === 'session_refreshing';
  authRecoveryPendingRef.current = authRecoveryPending;
  usingPersistedSessionFallbackRef.current = usingPersistedSessionFallback;
  userRef.current = user;
  profileRef.current = profile;

  const applySignedOutState = (nextStatus: AuthStatus = 'unauthenticated') => {
    accessTokenRef.current = null;
    profileCacheRef.current = null;
    profileFetchPromiseRef.current = null;
    currentSessionUserIdRef.current = null;
    userRef.current = null;
    profileRef.current = null;
    setAuthRecoveryPending(false);
    setHadStableAppAccess(false);
    setUsingPersistedSessionFallback(false);
    setAuthStatus(nextStatus);
    setSession(null);
    setUser(null);
    setProfile(null);
    setPhoneVerified(false);
  };

  const persistAuthSnapshot = async (
    nextSession: Session,
    nextProfile: Profile | null,
    nextPhoneVerified: boolean
  ) => {
    const existing = await readPersistedAuthSnapshot();
    await writePersistedAuthSnapshot({
      session: nextSession,
      profile: nextProfile ?? existing?.profile ?? null,
      phoneVerified:
        nextPhoneVerified ||
        nextProfile?.phone_verified === true ||
        existing?.phoneVerified === true,
      cachedAt: Date.now(),
    });
  };

  const restoreAuthSnapshot = async (reason: string) => {
    const snapshot = await readPersistedAuthSnapshot();
    if (!snapshot) return null;

    accessTokenRef.current = isSupabaseAccessTokenUsable(snapshot.session.access_token)
      ? snapshot.session.access_token
      : null;
    currentSessionUserIdRef.current = snapshot.session.user?.id ?? null;
    userRef.current = snapshot.session.user ?? null;
    profileRef.current = snapshot.profile ?? null;
    setUsingPersistedSessionFallback(true);
    const restoredStableAccess =
      !!snapshot.session &&
      !!snapshot.session.user &&
      !!snapshot.session.user.email_confirmed_at &&
      (snapshot.phoneVerified === true || snapshot.profile?.phone_verified === true) &&
      snapshot.profile?.profile_completed === true;
    setAuthRecoveryPending(false);
    setHadStableAppAccess(restoredStableAccess);
    setAuthStatus('offline_authenticated');
    setSession(snapshot.session);
    setUser(snapshot.session.user ?? null);
    setProfile(snapshot.profile ?? null);
    setPhoneVerified(snapshot.phoneVerified === true || snapshot.profile?.phone_verified === true);

    if (snapshot.session.user?.id) {
      profileCacheRef.current = {
        userId: snapshot.session.user.id,
        profile: snapshot.profile ?? null,
        fetchedAt: Date.now(),
      };
    }

    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("[auth] restored persisted auth snapshot", {
        reason,
        userId: snapshot.session.user?.id ?? null,
        hasProfile: !!snapshot.profile,
        phoneVerified: snapshot.phoneVerified,
      });
    }

    return snapshot;
  };

  const restoreProfileFromPersistedSnapshot = async (
    userId: string,
    reason: string,
    nextSession?: Session | null
  ): Promise<Profile | null> => {
    const snapshot = await readPersistedAuthSnapshot();
    if (!snapshot?.profile || snapshot.session.user?.id !== userId) return null;

    const resolvedSession = nextSession ?? session ?? snapshot.session;
    const resolvedUser = resolvedSession?.user ?? snapshot.session.user ?? null;
    const resolvedPhoneVerified =
      snapshot.phoneVerified === true || snapshot.profile.phone_verified === true;

    const nextAccessToken =
      resolvedSession?.access_token ?? snapshot.session.access_token ?? accessTokenRef.current;
    accessTokenRef.current = isSupabaseAccessTokenUsable(nextAccessToken)
      ? nextAccessToken
      : null;
    currentSessionUserIdRef.current = userId;
    userRef.current = resolvedUser;
    profileRef.current = snapshot.profile;
    setUsingPersistedSessionFallback(true);
    setAuthStatus('offline_authenticated');
    profileCacheRef.current = {
      userId,
      profile: snapshot.profile,
      fetchedAt: Date.now(),
    };

    if (resolvedSession) {
      setSession(resolvedSession);
    }
    if (resolvedUser) {
      setUser(resolvedUser);
    }
    setProfile(snapshot.profile);
    setPhoneVerified((current) => current || resolvedPhoneVerified);

    if (
      resolvedUser?.email_confirmed_at &&
      resolvedPhoneVerified &&
      snapshot.profile.profile_completed === true
    ) {
      setHadStableAppAccess(true);
      setAuthRecoveryPending(false);
    }

    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.log("[auth] restored persisted profile snapshot", {
        reason,
        userId,
        profileCompleted: snapshot.profile.profile_completed,
        phoneVerified: resolvedPhoneVerified,
      });
    }

    return snapshot.profile;
  };

  // Ensure Supabase token refresh is correctly managed across iOS background/foreground.
  useEffect(() => {
    const cleanup = initSupabaseAuthLifecycle();
    return cleanup;
  }, []);

  // Attach user id to crash/error reports (no PII beyond user id).
  useEffect(() => {
    setSentryUser(user?.id ?? null);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const provider =
      user.app_metadata?.provider === "google" || user.app_metadata?.provider === "apple"
        ? user.app_metadata.provider
        : "email";

    void (async () => {
      try {
        await supabase
          .from("profiles")
          .update({ last_successful_auth_provider: provider })
          .eq("user_id", user.id);

        await supabase
          .from("profiles")
          .update({ created_via_provider: provider })
          .eq("user_id", user.id)
          .is("created_via_provider", null);
      } catch {
        // best effort only
      }
    })();
  }, [user?.app_metadata?.provider, user?.id]);

  // Initialize auth state
  const getAccessToken = async () => {
    if (isSupabaseAccessTokenUsable(accessTokenRef.current)) {
      return accessTokenRef.current;
    }
    accessTokenRef.current = null;
    if (isSupabaseAccessTokenUsable(session?.access_token)) {
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
      accessTokenRef.current = isSupabaseAccessTokenUsable(token) ? token : null;
      return accessTokenRef.current;
    } catch {
      return null;
    }
  };

  const attemptSilentSessionRecovery = async (
    reason: string,
    options?: { allowWithoutSnapshot?: boolean; force?: boolean }
  ): Promise<boolean> => {
    if (sessionRecoveryInFlightRef.current) {
      return await sessionRecoveryInFlightRef.current;
    }
    if (signOutRequestedRef.current) return false;
    if (!options?.force && Date.now() < nextSilentRecoveryAllowedAtRef.current) {
      logAuthRecoveryEvent('recovery_deferred_backoff', {
        reason,
        retryAt: nextSilentRecoveryAllowedAtRef.current,
      });
      return false;
    }

    const recoveryPromise = (async () => {
      const snapshot = await readPersistedAuthSnapshot();
      const hasCachedAccess =
        !!snapshot?.session?.user?.id ||
        !!session?.user?.id ||
        !!user?.id ||
        usingPersistedSessionFallback ||
        hadStableAppAccess;

      if (!hasCachedAccess && !options?.allowWithoutSnapshot) {
        return false;
      }

      logAuthRecoveryEvent('reconnecting_session_started', {
        reason,
        hasSnapshot: !!snapshot,
        hasSession: !!session,
        hadStableAppAccess,
      });
      setAuthRecoveryPending(true);
      setAuthStatus('reconnecting_session');

      const recovery = await recoverSupabaseConnectivity(reason, {
        maxRefreshAttempts: 2,
        fallbackSession: snapshot?.session ?? session ?? null,
        onStateChange: (state) => {
          if (state === 'session_refreshing') {
            setAuthStatus('session_refreshing');
          } else {
            setAuthStatus('reconnecting_session');
          }
        },
      });

      if (recovery.status === 'ok' || recovery.status === 'refreshed') {
        const { data } = await Promise.race([
          supabase.auth.getSession(),
          new Promise<{ data: { session: null } }>((resolve) =>
            setTimeout(() => resolve({ data: { session: null } }), 1500),
          ),
        ]);

        const recoveredSession = data?.session ?? null;
        if (recoveredSession?.user) {
          nextSilentRecoveryAllowedAtRef.current = 0;
          accessTokenRef.current = isSupabaseAccessTokenUsable(recoveredSession.access_token)
            ? recoveredSession.access_token ?? null
            : null;
          currentSessionUserIdRef.current = recoveredSession.user.id;
          userRef.current = recoveredSession.user;
          setUsingPersistedSessionFallback(false);
          setSession(recoveredSession);
          setUser(recoveredSession.user);
          setAuthStatus('authenticated');
          setAuthRecoveryPending(false);
          void refreshProfile();
          void refreshPhoneState();
          return true;
        }
      }

      if (recovery.status === 'failed_unrecoverable') {
        nextSilentRecoveryAllowedAtRef.current = 0;
        await persistSessionExpiredReason('session_expired');
        await clearPersistedAuthSnapshot();
        setAuthRecoveryPending(false);
        setUsingPersistedSessionFallback(false);
        setAuthStatus('session_expired');
        applySignedOutState('session_expired');
        return false;
      }

      const restored = snapshot
        ? await restoreAuthSnapshot(`silent_recovery:${reason}`)
        : null;
      nextSilentRecoveryAllowedAtRef.current =
        Date.now() + RECOVERABLE_SESSION_RETRY_BACKOFF_MS;
      if (restored) {
        setAuthRecoveryPending(true);
        setAuthStatus('reconnecting_session');
      } else if (!options?.allowWithoutSnapshot) {
        setAuthRecoveryPending(false);
      }
      return false;
    })().finally(() => {
      sessionRecoveryInFlightRef.current = null;
    });

    sessionRecoveryInFlightRef.current = recoveryPromise;
    return await recoveryPromise;
  };

  useEffect(() => {
    let cancelled = false;
    const initAuth = async () => {
      try {
        const { data, error } = await Promise.race([
          supabase.auth.getSession(),
          new Promise<{
            data: { session: null };
            error: Error;
          }>((resolve) =>
            setTimeout(() => resolve({ data: { session: null }, error: new Error("initial_session_timeout") }), 2500)
          ),
        ]);

        if (cancelled) return;
        if (error && typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth] initial getSession error", error);
        }

        const initialSession = data?.session ?? null;
        accessTokenRef.current = isSupabaseAccessTokenUsable(initialSession?.access_token)
          ? initialSession?.access_token ?? null
          : null;
        currentSessionUserIdRef.current = initialSession?.user?.id ?? null;
        userRef.current = initialSession?.user ?? null;
        setAuthRecoveryPending(false);
        setUsingPersistedSessionFallback(false);
        lastUnrequestedSignedOutHandledAtRef.current = 0;
        setAuthStatus(initialSession?.user ? 'authenticated' : 'unauthenticated');
        setSession(initialSession);
        setUser(initialSession?.user ?? null);

        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth] initial session", {
            hasSession: !!initialSession,
            hasUser: !!initialSession?.user,
          });
        }

        if (initialSession?.user) {
          // Profile creation is performed by fetchProfile only after a successful
          // server response confirms that the row is genuinely absent.
          let initialProfile = await fetchProfile(initialSession.user.id);
          if (!initialProfile) {
            initialProfile = await restoreProfileFromPersistedSnapshot(
              initialSession.user.id,
              "initial_profile_fetch_failed",
              initialSession
            );
          }
          if (!cancelled && initialProfile?.phone_verified === true) {
            setPhoneVerified(true);
          }
          if (
            initialSession.user.email_confirmed_at &&
            initialProfile?.phone_verified === true &&
            initialProfile?.profile_completed === true
          ) {
            setHadStableAppAccess(true);
          }
          await persistAuthSnapshot(
            initialSession,
            initialProfile ?? null,
            initialProfile?.phone_verified === true
          );
        } else {
          const restored = await restoreAuthSnapshot(
            error?.message === "initial_session_timeout" ? "initial_session_timeout" : "initial_session_empty"
          );
          if (!restored) {
            setProfile(null);
            setPhoneVerified(false);
          } else if (await probeReachableNetwork()) {
            void attemptSilentSessionRecovery('initial_snapshot_restore', { force: true });
          }
        }
      } catch (error) {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth] initial auth bootstrap error", error);
        }
        if (cancelled) return;
        const restored = await restoreAuthSnapshot("initial_auth_exception");
        if (!restored) {
          applySignedOutState();
        } else if (await probeReachableNetwork()) {
          void attemptSilentSessionRecovery('initial_auth_exception', { force: true });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void initAuth();

    const processAuthStateChange = async (_event: string, session: Session | null) => {
        accessTokenRef.current = isSupabaseAccessTokenUsable(session?.access_token)
          ? session?.access_token ?? null
          : null;
        
        if (session?.user) {
          signOutRequestedRef.current = false;
          setAuthRecoveryPending(false);
          setUsingPersistedSessionFallback(false);
          lastUnrequestedSignedOutHandledAtRef.current = 0;
          setAuthStatus('authenticated');
          const nextUserId = session.user.id;
          const previousUserId = currentSessionUserIdRef.current;
          if (previousUserId && previousUserId !== nextUserId) {
            await Promise.all([
              resetChatDbForUserSignOut(previousUserId),
              clearOfflineImagesForOwner(previousUserId),
              clearOfflineVideosForOwner(previousUserId),
              clearOfflineAttachmentsForOwner(previousUserId),
              clearChatAttachmentPreviewsForOwner(previousUserId),
              clearStagedOfflineChatUploadsForOwner(previousUserId),
              ChatUploadTransport.clearForOwner(previousUserId),
            ]).catch((clearError) => {
              console.warn('[chat] clear local data on account switch failed', clearError);
            });
            clearChatBootCacheForUser(previousUserId);
          }
          const isRedundantInitialSession =
            _event === "INITIAL_SESSION" &&
            currentSessionUserIdRef.current === nextUserId &&
            profileCacheRef.current?.userId === nextUserId;

          currentSessionUserIdRef.current = nextUserId;
          userRef.current = session.user;
          setSession(session);
          setUser(session.user);

          if (isRedundantInitialSession) {
            return;
          }

          // Do not issue an unconditional profile write here. A transient network
          // failure must not be treated as proof that the profile is missing.
          const profileData = await fetchProfile(session.user.id);
          const metadata = await consumeSignupMetadata();
          await updateSignupEventForUser(session.user.id, metadata);

          await refreshPhoneState();
          const { verified } = await getSignupPhoneState();
          if (verified) {
            const ok = await finalizeSignupPhoneVerification();
            if (ok) {
              await clearSignupSession({ preserveOnboardingVariant: true });
            } else if (typeof __DEV__ !== "undefined" && __DEV__) {
              console.log("[auth] finalize-signup failed; keeping signup session for retry");
            }
          }

          // refresh profile one more time if first fetch failed
          let finalProfile = profileData;
          if (!finalProfile) {
            finalProfile = await fetchProfile(session.user.id);
          }
          if (!finalProfile) {
            finalProfile = await restoreProfileFromPersistedSnapshot(
              session.user.id,
              `auth_event:${_event}:profile_fetch_failed`,
              session
            );
          }
          if (
            session.user.email_confirmed_at &&
            (finalProfile?.phone_verified === true || phoneVerified) &&
            finalProfile?.profile_completed === true
          ) {
            setHadStableAppAccess(true);
          }
          await persistAuthSnapshot(
            session,
            finalProfile ?? null,
            (finalProfile?.phone_verified === true) || phoneVerified
          );
        } else {
          if (signOutRequestedRef.current) {
            signOutRequestedRef.current = false;
            applySignedOutState();
            await clearPersistedAuthSnapshot();
            return;
          }

          if (_event === "SIGNED_OUT") {
            const now = Date.now();
            if (
              now - lastUnrequestedSignedOutHandledAtRef.current <
              UNREQUESTED_SIGNED_OUT_THROTTLE_MS
            ) {
              return;
            }
            lastUnrequestedSignedOutHandledAtRef.current = now;
            setAuthRecoveryPending(true);
            const networkReachable = await probeReachableNetwork();
            const restored = await restoreAuthSnapshot(
              "auth_event:SIGNED_OUT_unrequested"
            );
            if (networkReachable) {
              logAuthRecoveryEvent('network_restored', {
                reason: 'auth_event:SIGNED_OUT_unrequested',
              });
              const recovered = await attemptSilentSessionRecovery(
                'auth_event:SIGNED_OUT_unrequested',
                { allowWithoutSnapshot: !restored }
              );
              if (recovered) {
                return;
              }
            }
            if (!restored) {
              applySignedOutState();
            } else {
              setAuthStatus(networkReachable ? 'reconnecting_session' : 'offline_authenticated');
            }
            return;
          }

          setAuthRecoveryPending(true);
          const restored = await restoreAuthSnapshot(`auth_event:${_event}`);
          if (!restored) {
            applySignedOutState();
          } else {
            setAuthStatus('offline_authenticated');
          }
        }
    };

    // Supabase warns against awaiting other Supabase calls inside this callback.
    // Queue the real work after the auth lock has been released.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth] onAuthStateChange", {
            event: _event,
            hasSession: !!session,
            hasUser: !!session?.user,
          });
        }
        setTimeout(() => {
          authEventQueueRef.current = authEventQueueRef.current
            .catch(() => undefined)
            .then(() => processAuthStateChange(_event, session));
        }, 0);
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let lastReachable = true;

    const handleNetInfoRestore = (state: {
      isConnected: boolean | null;
      isInternetReachable: boolean | null;
    }) => {
      const reachable = isNetworkConnectionAvailable(state);
      if (reachable && !lastReachable) {
        logAuthRecoveryEvent('network_restored', {
          authStatus,
          usingPersistedSessionFallback,
          hadStableAppAccess,
        });
        if (
          authStatus === 'offline_authenticated' ||
          authStatus === 'reconnecting_session' ||
          authStatus === 'session_refreshing' ||
          usingPersistedSessionFallback ||
          authRecoveryPending ||
          hadStableAppAccess
        ) {
          void attemptSilentSessionRecovery('network_restored', { force: true });
        }
      }
      lastReachable = reachable;
    };

    const unsubscribe = addNetInfoListener(handleNetInfoRestore);
    fetchNetInfo().then(handleNetInfoRestore).catch(() => undefined);
    return () => {
      unsubscribe();
    };
  }, [
    authRecoveryPending,
    authStatus,
    hadStableAppAccess,
    usingPersistedSessionFallback,
  ]);

  // Fetch user profile
  const fetchProfile = async (userId: string, options?: FetchProfileOptions) => {
    const inFlight = profileFetchPromiseRef.current;
    if (inFlight && inFlight.userId === userId) {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[auth] fetchProfile: awaiting in-flight");
      }
      return await inFlight.promise;
    }

    const fetchPromise = (async () => {
      try {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[auth] fetchProfile: start", { userId });
      }
      const cached = profileCacheRef.current;
      if (
        !options?.force &&
        cached &&
        cached.userId === userId &&
        Date.now() - cached.fetchedAt < PROFILE_CACHE_TTL_MS
      ) {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth] fetchProfile: cache hit");
        }
        setProfile(cached.profile);
        profileRef.current = cached.profile;
        return cached.profile;
      }

      const accessToken = await getAccessToken();
      let restResult = await fetchProfileViaRest(userId, accessToken);
      if (restResult.status === "missing") {
        // A successful empty read is the only safe signal to create the minimal row.
        await ensureProfileExists(userId);
        restResult = await fetchProfileViaRest(userId, accessToken);
      }
      if (restResult.status !== "found") {
        if (restResult.status === "missing") {
          void diagnoseProfileFetch(userId);
        }
        if (
          typeof __DEV__ !== "undefined" &&
          __DEV__ &&
          (restResult.status === "missing" ||
            !isLikelyNetworkError(restResult.error))
        ) {
          console.log("[auth] fetchProfile: rest unavailable", {
            status: restResult.status,
          });
        }
        const staleCachedProfile =
          profileCacheRef.current?.userId === userId ? profileCacheRef.current.profile : null;
        if (staleCachedProfile) {
          setProfile(staleCachedProfile);
          profileRef.current = staleCachedProfile;
          return staleCachedProfile;
        }

        const restoredProfile = await restoreProfileFromPersistedSnapshot(
          userId,
          "fetch_profile_rest_failed"
        );
        if (restoredProfile) {
          return restoredProfile;
        }

        return null;
      }

      const presenceResult = await fetchUserPresence(userId);
      const mergedProfile = overlayPresence(
        restResult.profile as any,
        (presenceResult.data as any) ?? null
      );
      profileCacheRef.current = { userId, profile: mergedProfile, fetchedAt: Date.now() };
      profileRef.current = mergedProfile;
      setProfile(mergedProfile);
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[auth] fetchProfile: rest ok");
      }
      return mergedProfile;
      } catch (error) {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[auth] fetchProfile: error", error);
      }
      const staleCachedProfile =
        profileCacheRef.current?.userId === userId ? profileCacheRef.current.profile : null;
      if (staleCachedProfile) {
        setProfile(staleCachedProfile);
        profileRef.current = staleCachedProfile;
        return staleCachedProfile;
      }
      const restoredProfile = await restoreProfileFromPersistedSnapshot(
        userId,
        "fetch_profile_exception"
      );
      if (restoredProfile) {
        return restoredProfile;
      }
      return null;
      }
    })();

    profileFetchPromiseRef.current = {
      userId,
      promise: fetchPromise,
    };

    try {
      return await fetchPromise;
    } finally {
      if (profileFetchPromiseRef.current?.promise === fetchPromise) {
        profileFetchPromiseRef.current = null;
      }
    }
  };

  const refreshProfile = async () => {
    if (user) {
      // refreshProfile is called when the UI needs the latest server state (post-save,
      // app resume, pull-to-refresh). Bypass the short profile cache to avoid stale UI.
      return await fetchProfile(user.id, { force: true });
    }
    return null;
  };

  const refreshPhoneState = async (): Promise<boolean> => {
    if (phoneRefreshInFlightRef.current && phoneRefreshPromiseRef.current) {
      return await phoneRefreshPromiseRef.current;
    }

    const refreshPromise = (async (): Promise<boolean> => {
      phoneRefreshInFlightRef.current = true;
      const resolvedUser = userRef.current ?? user;
      const resolvedProfile = profileRef.current ?? profile;
      const serverKnownVerified = resolvedProfile?.phone_verified === true;
      let cachedVerified = false;
      let cachedUnverified = false;
      try {
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          console.log("[auth] refreshPhoneState: start", {
            hasUser: !!resolvedUser?.id,
            profilePhoneVerified: resolvedProfile?.phone_verified ?? null,
            serverKnownVerified,
          });
        }
        if (!resolvedUser?.id) {
          setPhoneVerified(false);
          if (typeof __DEV__ !== "undefined" && __DEV__) {
            console.log("[auth] refreshPhoneState: no user -> false");
          }
          return false;
        }

        // Fast-path: if profile already says verified, treat it as source of truth.
        if (serverKnownVerified) {
          setPhoneVerified(true);
          try {
            await AsyncStorage.setItem(
              getPhoneVerifiedCacheKey(resolvedUser.id),
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
          const cachedRaw = await AsyncStorage.getItem(getPhoneVerifiedCacheKey(resolvedUser.id));
          if (cachedRaw) {
            const cached = JSON.parse(cachedRaw) as { verified?: boolean; expiresAt?: number };
            const isFresh = typeof cached.expiresAt === "number" && cached.expiresAt > Date.now();
            if (!isFresh) {
              await AsyncStorage.removeItem(getPhoneVerifiedCacheKey(resolvedUser.id));
            } else if (cached.verified === true) {
              cachedVerified = true;
              if (typeof __DEV__ !== "undefined" && __DEV__) {
                console.log("[auth] refreshPhoneState: cached verified hint");
              }
            } else if (cached.verified === false) {
              cachedUnverified = true;
              if (typeof __DEV__ !== "undefined" && __DEV__) {
                console.log("[auth] refreshPhoneState: using cached unverified");
              }
            }
          }
        } catch {
          // ignore cache errors
        }

        const accessToken = await getAccessToken();
        const flags = await fetchProfilePhoneFlagsViaRest(resolvedUser.id, accessToken, 2500);
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
              getPhoneVerifiedCacheKey(resolvedUser.id),
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
              getPhoneVerifiedCacheKey(resolvedUser.id),
              JSON.stringify({ verified: false, expiresAt: Date.now() + PHONE_VERIFIED_CACHE_TTL_MS })
            );
          } catch {
            // ignore cache errors
          }
          return false;
        }

        const verifiedRow = await fetchVerifiedPhoneViaRest(resolvedUser.id, accessToken, 2500);
        if (verifiedRow?.status === "verified" || verifiedRow?.is_verified === true) {
          setPhoneVerified(true);
          try {
            await AsyncStorage.setItem(
              getPhoneVerifiedCacheKey(resolvedUser.id),
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
        phoneRefreshPromiseRef.current = null;
      }
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[auth] refreshPhoneState: fallback", {
          serverKnownVerified,
          cachedVerified,
          cachedUnverified,
        });
      }
      const fallbackVerified = serverKnownVerified || cachedVerified;
      setPhoneVerified(fallbackVerified);
      return fallbackVerified;
    })();

    phoneRefreshPromiseRef.current = refreshPromise;
    return await refreshPromise;
  };

  const updatePresence = async (nextOnline: boolean) => {
    if (!user?.id) return;
    if (authRecoveryPendingRef.current || usingPersistedSessionFallbackRef.current) return;
    const requestedUserId = user.id;
    await presenceWriteCoordinatorRef.current!.request(
      requestedUserId,
      nextOnline,
      async (ownerUserId, requestedOnline) => {
        try {
          const sessionStatus = await ensureFreshSession();
          if (sessionStatus === 'failed' || sessionStatus === 'no_session') {
            await restoreProfileFromPersistedSnapshot(ownerUserId, `presence_skip_${sessionStatus}`);
            return false;
          }
          const presenceAt = new Date().toISOString();
          const { error } = await setCurrentUserPresence(requestedOnline);
          if (error) {
            if (isLikelyNetworkError(error) || isExpiredJwtError(error)) {
              if (isExpiredJwtError(error)) {
                await restoreProfileFromPersistedSnapshot(ownerUserId, 'presence_expired_jwt');
              }
              if (typeof __DEV__ !== 'undefined' && __DEV__) {
                console.warn('[presence] update warning', error);
              }
            } else {
              console.error('[presence] update error', error);
            }
            return false;
          }

          setProfile((prev) =>
            prev
              ? overlayPresence(prev as any, {
                  user_id: ownerUserId,
                  online: requestedOnline,
                  last_active: presenceAt,
                })
              : prev,
          );
          if (profileCacheRef.current?.userId === ownerUserId && profileCacheRef.current.profile) {
            profileCacheRef.current = {
              ...profileCacheRef.current,
              profile: overlayPresence(profileCacheRef.current.profile as any, {
                user_id: ownerUserId,
                online: requestedOnline,
                last_active: presenceAt,
              }),
              fetchedAt: Date.now(),
            };
          }
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.log('[presence] set', { online: requestedOnline });
          }
          return true;
        } catch (error) {
          if (isLikelyNetworkError(error) || isExpiredJwtError(error)) {
            if (isExpiredJwtError(error)) {
              await restoreProfileFromPersistedSnapshot(ownerUserId, 'presence_exception_expired_jwt');
            }
            if (typeof __DEV__ !== 'undefined' && __DEV__) {
              console.warn('[presence] update warning', error);
            }
          } else {
            console.error('[presence] update error', error);
          }
          return false;
        }
      },
    );
  };

  const refreshSessionOnResume = async () => {
    if (!user?.id) return;
    const now = Date.now();
    if (now - resumeRefreshAtRef.current < RESUME_REFRESH_THROTTLE_MS) return;
    resumeRefreshAtRef.current = now;

    try {
      const netState = await Promise.race([
        fetchNetInfo(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), NETINFO_TIMEOUT_MS)),
      ]);
      const reachable = isNetworkConnectionAvailable(netState);

      if (!reachable) {
        await restoreProfileFromPersistedSnapshot(user.id, "resume_offline");
        return;
      }

      // ensureFreshSession owns its timeout. Racing it with a shorter timer leaves
      // the native refresh alive and can start a second refresh on top of it.
      const status = await ensureFreshSession();

      if (status === 'failed' || status === 'no_session') {
        setAuthRecoveryPending(true);
        setAuthStatus('reconnecting_session');
        await restoreProfileFromPersistedSnapshot(user.id, `resume_refresh_${status}`);
        void attemptSilentSessionRecovery(`resume_refresh_${status}`, { force: true });
        return;
      }

      // Pull the latest session snapshot so downstream requests have a current token.
      const { data } = await Promise.race([
        supabase.auth.getSession(),
        new Promise<{ data: { session: null } }>((resolve) => setTimeout(() => resolve({ data: { session: null } }), 1500)),
      ]);

      if (data?.session) {
        accessTokenRef.current = isSupabaseAccessTokenUsable(data.session.access_token)
          ? data.session.access_token ?? null
          : null;
        setSession(data.session);
        userRef.current = data.session.user ?? null;
        setUser(data.session.user ?? null);
      }

      // Rehydrate critical app state to avoid "stuck" screens after background/network changes.
      await Promise.race([refreshProfile(), new Promise<void>((resolve) => setTimeout(resolve, 2500))]);
      await Promise.race([refreshPhoneState(), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2500))]);
    } catch (error) {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[auth] refreshSessionOnResume: exception", error);
      }
      await restoreProfileFromPersistedSnapshot(user.id, "resume_refresh_exception");
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let lastNetworkReady = true;
    const clearHeartbeatTimer = () => {
      if (!heartbeatTimer) return;
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    };
    const startHeartbeat = () => {
      clearHeartbeatTimer();
      heartbeatTimer = setInterval(() => {
        if (!mounted || AppState.currentState !== 'active') return;
        void updatePresence(true);
      }, PRESENCE_HEARTBEAT_MS);
    };
    const setOnline = () => {
      if (mounted) void updatePresence(true);
      startHeartbeat();
    };
    const setOffline = () => {
      clearHeartbeatTimer();
      if (mounted) void updatePresence(false);
    };

    setOnline();
    // Cold start with a persisted session won't emit an AppState transition.
    // Refresh once here so stale access tokens are renewed after relaunch.
    void refreshSessionOnResume();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setOnline();
        // Fire-and-forget: don't block UI thread on resume.
        void refreshSessionOnResume();
      } else {
        setOffline();
      }
    });
    const unsubscribeNetInfo = addNetInfoListener((state) => {
      const nextReady = isNetworkConnectionAvailable(state);
      if (nextReady && !lastNetworkReady && AppState.currentState === 'active') {
        setOnline();
        void refreshSessionOnResume();
      }
      lastNetworkReady = nextReady;
    });

    return () => {
      mounted = false;
      clearHeartbeatTimer();
      subscription.remove();
      unsubscribeNetInfo();
      void updatePresence(false);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    if (authRecoveryPending || usingPersistedSessionFallback) return;
    if (AppState.currentState !== 'active') return;
    void updatePresence(true);
  }, [authRecoveryPending, user?.id, usingPersistedSessionFallback]);

  useEffect(() => {
    if (!user?.id) return;
    void refreshPhoneState();
  }, [user?.id, profile?.phone_verified]);

  useEffect(() => {
    if (!user?.id) return;
    if (authRecoveryPending || usingPersistedSessionFallback) return;
    let cancelled = false;
    (async () => {
      try {
        const sessionStatus = await ensureFreshSession();
        if (cancelled) return;
        if (sessionStatus === 'failed' || sessionStatus === 'no_session') {
          await restoreProfileFromPersistedSnapshot(user.id, `e2ee_skip_${sessionStatus}`);
          return;
        }
        const keypair = await getOrCreateDeviceKeypair();
        if (cancelled) return;
        const { data, error } = await supabase
          .from('profiles')
          .select('public_key')
          .eq('user_id', user.id)
          .maybeSingle();
        if (error) {
          if (isExpiredJwtError(error)) {
            await restoreProfileFromPersistedSnapshot(user.id, 'e2ee_fetch_expired_jwt');
            return;
          }
          console.error('[e2ee] fetch public key error', error);
          return;
        }
        if (!data?.public_key || data.public_key !== keypair.publicKeyB64) {
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ public_key: keypair.publicKeyB64 })
            .eq('user_id', user.id);
          if (updateError) {
            if (isExpiredJwtError(updateError)) {
              await restoreProfileFromPersistedSnapshot(user.id, 'e2ee_update_expired_jwt');
              return;
            }
            console.error('[e2ee] update public key error', updateError);
          }
        }
        await registerPushToken(user.id);
      } catch (error) {
        if (isExpiredJwtError(error)) {
          await restoreProfileFromPersistedSnapshot(user.id, 'e2ee_exception_expired_jwt');
          return;
        }
        console.error('[e2ee] ensure identity error', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authRecoveryPending, usingPersistedSessionFallback, user?.id]);

  useEffect(() => {
    if (!session?.user) return;
    void persistAuthSnapshot(session, profile ?? null, phoneVerified);
  }, [
    session,
    profile,
    phoneVerified,
  ]);

  useEffect(() => {
    const hasStableAccessNow =
      !!session &&
      !!user &&
      !!user.email_confirmed_at &&
      phoneVerified &&
      !!profile &&
      profile.profile_completed === true;

    if (hasStableAccessNow) {
      if (!hadStableAppAccess) {
        setHadStableAppAccess(true);
      }
      if (authRecoveryPending) {
        setAuthRecoveryPending(false);
      }
      if (authStatus !== 'authenticated') {
        setAuthStatus('authenticated');
      }
    }
  }, [authRecoveryPending, authStatus, hadStableAppAccess, phoneVerified, profile, session, user]);

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
    signOutRequestedRef.current = true;
    const signedOutUserId = user?.id ?? null;
    await clearPersistedAuthSnapshot();
    try {
      await AsyncStorage.setItem(EXPLICIT_SIGN_OUT_KEY, JSON.stringify({ at: Date.now() }));
    } catch {
      // best effort only
    }
    if (signedOutUserId) {
      void updatePresence(false);
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error);
      signOutRequestedRef.current = false;
      return;
    }

    if (signedOutUserId) {
      try {
        await Promise.all([
          resetChatDbForUserSignOut(signedOutUserId),
          clearOfflineImagesForOwner(signedOutUserId),
          clearOfflineVideosForOwner(signedOutUserId),
          clearOfflineAttachmentsForOwner(signedOutUserId),
          clearChatAttachmentPreviewsForOwner(signedOutUserId),
          clearStagedOfflineChatUploadsForOwner(signedOutUserId),
          ChatUploadTransport.clearForOwner(signedOutUserId),
        ]);
        clearChatBootCacheForUser(signedOutUserId);
        await clearAppIconBadgeCount();
      } catch (clearError) {
        console.warn('[chat] clear local data on sign out failed', clearError);
      }
    }
  };

  const updateProfile = async (updates: ProfileUpdateInput) => {
    if (!user) return { error: new Error('No user found') };
    const updatedAt = new Date().toISOString();

    const queueProfileUpdate = async () => {
      const optimisticProfile = profile
        ? ({
            ...profile,
            ...updates,
            user_id: user.id,
            updated_at: updatedAt,
          } as Profile)
        : null;

      if (optimisticProfile) {
        profileCacheRef.current = { userId: user.id, profile: optimisticProfile, fetchedAt: Date.now() };
        profileRef.current = optimisticProfile;
        setProfile(optimisticProfile);
        if (session) {
          void writePersistedAuthSnapshot({
            session,
            profile: optimisticProfile,
            phoneVerified: phoneVerified || optimisticProfile.phone_verified === true,
            cachedAt: Date.now(),
          });
        }
      }

      await enqueueProfileUpdateMutation({
        userId: user.id,
        updates: updates as Record<string, unknown>,
        updatedAt,
      });
    };

    if (isSessionRecoveryActive || authStatus === 'offline_authenticated') {
      await queueProfileUpdate();
      return { error: null, queued: true };
    }

    try {
      // The Edge Function owns optional semantic review and invokes the
      // service-only database bridge; mobile never receives a provider secret.
      const guardInvocation = prepareProfileGuardInvocation(
        updates as Record<string, unknown>,
      );
      const { data, error: invokeError } = await supabase.functions.invoke(
        guardInvocation.functionName,
        {
          body: guardInvocation.body,
        },
      );
      const error = invokeError ?? (data?.ok === false
        ? Object.assign(new Error('Keep your profile personal'), {
            code: data.code ?? 'PROFILE_CONTENT_NOT_ALLOWED',
            fieldNames: Array.isArray(data.field_names) ? data.field_names : [],
          })
        : null);

      if (error && isLikelyNetworkError(error)) {
        throw error;
      }

      if (!error) {
        await refreshProfile();
      }

      return { error };
    } catch (error) {
      if (isLikelyNetworkError(error)) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn('Profile update queued offline', error);
        }
        await queueProfileUpdate();

        return { error: null, queued: true };
      }
      console.error('Profile update error:', error);
      return { error: error as Error };
    }
  };

  const value: AuthContextType = {
    // State
    session,
    user,
    profile,
    authStatus,
    isLoading,
    isAuthenticating,
    
    // Computed
    isAuthenticated,
    hasProfile,
    isEmailVerified,
    phoneVerified,
    authRecoveryPending,
    hadStableAppAccess,
    usingPersistedSessionFallback,
    isSessionRecoveryActive,
    canPerformAuthenticatedWrites:
      authStatus === 'authenticated' && !!session?.user,
    
    // Actions
    signIn,
    signUp,
    signOut,
    refreshProfile,
    refreshPhoneState,
    retrySessionRecovery: (reason = 'manual_retry') =>
      attemptSilentSessionRecovery(reason, {
        allowWithoutSnapshot: true,
        force: true,
      }),
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
  const {
    isAuthenticated,
    isLoading,
    isEmailVerified,
    hasProfile,
    phoneVerified,
    authStatus,
    authRecoveryPending,
    hadStableAppAccess,
    usingPersistedSessionFallback,
  } = useAuth();

  const stableAccess = isAuthenticated && isEmailVerified && phoneVerified && hasProfile;
  const isRecoveryState =
    authStatus === 'offline_authenticated' ||
    authStatus === 'reconnecting_session' ||
    authStatus === 'session_refreshing' ||
    usingPersistedSessionFallback ||
    authRecoveryPending;
  const canPreserveAccessDuringRecovery =
    (hadStableAppAccess || (hasProfile && phoneVerified)) && isRecoveryState;
  
  return {
    isLoading,
    needsAuth: !isAuthenticated && !canPreserveAccessDuringRecovery,
    needsEmailVerification: isAuthenticated && !isEmailVerified && !canPreserveAccessDuringRecovery,
    needsPhoneVerification: isAuthenticated && isEmailVerified && !phoneVerified && !canPreserveAccessDuringRecovery,
    needsProfileSetup: isAuthenticated && isEmailVerified && phoneVerified && !hasProfile && !canPreserveAccessDuringRecovery,
    canAccessApp: stableAccess || canPreserveAccessDuringRecovery,
  };
}
