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
  const version =
    Constants.expoConfig?.version ||
    Constants.manifest?.version ||
    Constants.expoConfig?.runtimeVersion ||
    Constants.manifest?.runtimeVersion;
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

export const clearSignupSession = async () => {
  await AsyncStorage.multiRemove([
    SIGNUP_SESSION_KEY,
    SIGNUP_PHONE_KEY,
    SIGNUP_PHONE_VERIFIED_KEY,
    SIGNUP_AUTH_METHOD_KEY,
    SIGNUP_OAUTH_PROVIDER_KEY,
  ]);
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

  const { error } = await supabase
    .from("signup_events")
    .upsert(body, {
      onConflict: "signup_session_id",
      ignoreDuplicates: true,
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
  const { error } = await supabase
    .from("signup_events")
    .update({
      ...updates,
      user_id: userId,
    })
    .eq("signup_session_id", signup_session_id);

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

export const consumeSignupMetadata = async () => {
  const [phoneNumber, verified, authMethod, oauthProvider] = await Promise.all([
    AsyncStorage.getItem(SIGNUP_PHONE_KEY),
    AsyncStorage.getItem(SIGNUP_PHONE_VERIFIED_KEY),
    AsyncStorage.getItem(SIGNUP_AUTH_METHOD_KEY),
    AsyncStorage.getItem(SIGNUP_OAUTH_PROVIDER_KEY),
  ]);

  return {
    phone_number: phoneNumber,
    phone_verified: verified === "true",
    auth_method: authMethod || null,
    oauth_provider: oauthProvider || null,
  };
};
