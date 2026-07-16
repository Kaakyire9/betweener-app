import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Location from "expo-location";
import * as ExpoCrypto from "expo-crypto";
import { supabase } from "@/lib/supabase";

const SIGNUP_SESSION_KEY = "signup_session_id_v1";
const SIGNUP_PHONE_KEY = "signup_phone_number_v1";
const SIGNUP_PHONE_VERIFIED_KEY = "signup_phone_verified_v1";
const SIGNUP_AUTH_METHOD_KEY = "signup_auth_method_v1";
const SIGNUP_OAUTH_PROVIDER_KEY = "signup_oauth_provider_v1";
const SIGNUP_AUTH_NAME_KEY = "signup_auth_name_v1";
const SIGNUP_AUTH_EMAIL_KEY = "signup_auth_email_v1";
const SIGNUP_ONBOARDING_VARIANT_KEY = "signup_onboarding_variant_v1";

export type SignupOnboardingVariant = "ghana" | "global";

type StoredSignupOnboardingVariant = {
  variant: SignupOnboardingVariant;
  signupSessionId: string;
};

const normalizeSignupOnboardingVariant = (
  value?: string | null
): SignupOnboardingVariant | null => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "ghana" || normalized === "global") {
    return normalized;
  }
  return null;
};

type SignupEventPayload = {
  signup_session_id: string;
  user_id?: string | null;
  phone_number?: string | null;
  phone_verified?: boolean;
  auth_method?: string | null;
  oauth_provider?: string | null;
  ip_address?: string | null;
  ip_country?: string | null;
  ip_region?: string | null;
  ip_city?: string | null;
  ip_timezone?: string | null;
  geo_lat?: number | null;
  geo_lng?: number | null;
  geo_accuracy?: number | null;
  device_os?: string | null;
  device_model?: string | null;
  app_version?: string | null;
};

type IpInfo = {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  timezone?: string;
};

const getAppVersion = () => {
  const expoConfig = (Constants.expoConfig ?? {}) as any;
  const manifest = (Constants.manifest ?? {}) as any;
  const version =
    expoConfig.version ||
    manifest.version ||
    expoConfig.runtimeVersion ||
    manifest.runtimeVersion;
  return typeof version === "string" ? version : null;
};

const getDeviceInfo = () => ({
  device_os: Device.osName ?? null,
  device_model: Device.modelName ?? null,
  app_version: getAppVersion(),
});

const fetchIpInfo = async (): Promise<IpInfo | null> => {
  try {
    const response = await fetch("https://ipapi.co/json/");
    if (!response.ok) return null;
    const data = await response.json();
    return {
      ip: data.ip,
      city: data.city,
      region: data.region,
      country: data.country_name || data.country,
      timezone: data.timezone,
    };
  } catch {
    return null;
  }
};

const getLocationSnapshot = async () => {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      return null;
    }
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      geo_lat: location.coords.latitude,
      geo_lng: location.coords.longitude,
      geo_accuracy: location.coords.accuracy ?? null,
    };
  } catch {
    return null;
  }
};

export const getOrCreateSignupSessionId = async () => {
  const existing = await AsyncStorage.getItem(SIGNUP_SESSION_KEY);
  if (existing) return existing;
  const id = ExpoCrypto.randomUUID();
  await AsyncStorage.setItem(SIGNUP_SESSION_KEY, id);
  return id;
};

export const getSignupSessionId = async () => {
  return AsyncStorage.getItem(SIGNUP_SESSION_KEY);
};

export const beginSignupSession = async (variant?: string | null) => {
  await clearSignupSession();
  const signupSessionId = ExpoCrypto.randomUUID();
  const normalized = normalizeSignupOnboardingVariant(variant);
  const entries: [string, string][] = [[SIGNUP_SESSION_KEY, signupSessionId]];
  if (normalized) {
    entries.push([
      SIGNUP_ONBOARDING_VARIANT_KEY,
      JSON.stringify({ variant: normalized, signupSessionId } satisfies StoredSignupOnboardingVariant),
    ]);
  }
  await AsyncStorage.multiSet(entries);
  return signupSessionId;
};

export const setSignupPhoneNumber = async (phoneNumber: string) => {
  await AsyncStorage.setItem(SIGNUP_PHONE_KEY, phoneNumber);
};

export const setSignupPhoneVerified = async (verified: boolean) => {
  await AsyncStorage.setItem(SIGNUP_PHONE_VERIFIED_KEY, verified ? "true" : "false");
};

export const getSignupPhoneState = async () => {
  const [phoneNumber, verified] = await Promise.all([
    AsyncStorage.getItem(SIGNUP_PHONE_KEY),
    AsyncStorage.getItem(SIGNUP_PHONE_VERIFIED_KEY),
  ]);
  return {
    phoneNumber,
    verified: verified === "true",
  };
};

export const clearSignupSession = async (options?: { preserveOnboardingVariant?: boolean }) => {
  const keys = [
    SIGNUP_AUTH_METHOD_KEY,
    SIGNUP_OAUTH_PROVIDER_KEY,
    SIGNUP_AUTH_NAME_KEY,
    SIGNUP_AUTH_EMAIL_KEY,
  ];
  if (!options?.preserveOnboardingVariant) {
    keys.push(
      SIGNUP_SESSION_KEY,
      SIGNUP_PHONE_KEY,
      SIGNUP_PHONE_VERIFIED_KEY,
      SIGNUP_ONBOARDING_VARIANT_KEY,
    );
  }
  await AsyncStorage.multiRemove(keys);
};

export const setSignupOnboardingVariant = async (variant?: string | null) => {
  const normalized = normalizeSignupOnboardingVariant(variant);
  if (!normalized) {
    await AsyncStorage.removeItem(SIGNUP_ONBOARDING_VARIANT_KEY);
    return;
  }
  const signupSessionId = await getOrCreateSignupSessionId();
  const stored: StoredSignupOnboardingVariant = {
    variant: normalized,
    signupSessionId,
  };
  await AsyncStorage.setItem(SIGNUP_ONBOARDING_VARIANT_KEY, JSON.stringify(stored));
};

export const getSignupOnboardingVariant = async (): Promise<SignupOnboardingVariant | null> => {
  const [stored, signupSessionId] = await Promise.all([
    AsyncStorage.getItem(SIGNUP_ONBOARDING_VARIANT_KEY),
    AsyncStorage.getItem(SIGNUP_SESSION_KEY),
  ]);
  if (!stored || !signupSessionId) return null;

  try {
    const parsed = JSON.parse(stored) as Partial<StoredSignupOnboardingVariant>;
    if (parsed.signupSessionId !== signupSessionId) return null;
    return normalizeSignupOnboardingVariant(parsed.variant);
  } catch {
    // Legacy values are tolerated only while their original signup session is
    // still active. The verified phone country still takes routing priority.
    return normalizeSignupOnboardingVariant(stored);
  }
};

export const captureSignupContext = async () => {
  const [ipInfo, location] = await Promise.all([fetchIpInfo(), getLocationSnapshot()]);
  return {
    ipInfo,
    location,
  };
};

export const logSignupEvent = async (payload: Omit<SignupEventPayload, "signup_session_id">) => {
  const signup_session_id = await getOrCreateSignupSessionId();
  const deviceInfo = getDeviceInfo();
  const body: SignupEventPayload = {
    signup_session_id,
    ...deviceInfo,
    ...payload,
  };

  const { error } = await supabase.functions.invoke("log-signup-event", {
    body,
  });

  if (error) {
    console.log("[signup] log event error", error);
  }
};

export const updateSignupEventForUser = async (
  userId: string,
  updates: Partial<SignupEventPayload>
) => {
  const signup_session_id = await getSignupSessionId();
  if (!signup_session_id) return;
  const { error } = await supabase.functions.invoke("log-signup-event", {
    body: {
      signup_session_id,
      ...updates,
      user_id: userId,
    },
  });

  if (error) {
    console.log("[signup] update event error", error);
  }
};

export const setPendingAuthMethod = async (authMethod: string, oauthProvider?: string | null) => {
  await AsyncStorage.multiSet([
    [SIGNUP_AUTH_METHOD_KEY, authMethod],
    [SIGNUP_OAUTH_PROVIDER_KEY, oauthProvider ?? ""],
  ]);
};

export const setSignupIdentityHints = async ({
  name,
  email,
}: {
  name?: string | null;
  email?: string | null;
}) => {
  const normalizedName = String(name ?? "").trim();
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  await AsyncStorage.multiSet([
    [SIGNUP_AUTH_NAME_KEY, normalizedName],
    [SIGNUP_AUTH_EMAIL_KEY, normalizedEmail],
  ]);
};

export const finalizeSignupPhoneVerification = async (): Promise<boolean> => {
  const signupSessionId = await getSignupSessionId();
  if (!signupSessionId) return false;
  const { data, error } = await supabase.functions.invoke("finalize-signup", {
    body: { signupSessionId },
  });
  if (error) {
    console.log("[signup] finalize signup error", error);
    return false;
  }
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log("[signup] finalize signup ok", data ?? null);
  }
  return true;
};

export const consumeSignupMetadata = async () => {
  const [phoneNumber, verified, authMethod, oauthProvider, authName, authEmail] = await Promise.all([
    AsyncStorage.getItem(SIGNUP_PHONE_KEY),
    AsyncStorage.getItem(SIGNUP_PHONE_VERIFIED_KEY),
    AsyncStorage.getItem(SIGNUP_AUTH_METHOD_KEY),
    AsyncStorage.getItem(SIGNUP_OAUTH_PROVIDER_KEY),
    AsyncStorage.getItem(SIGNUP_AUTH_NAME_KEY),
    AsyncStorage.getItem(SIGNUP_AUTH_EMAIL_KEY),
  ]);

  return {
    phone_number: phoneNumber,
    phone_verified: verified === "true",
    auth_method: authMethod || null,
    oauth_provider: oauthProvider || null,
    auth_name: authName || null,
    auth_email: authEmail || null,
  };
};
