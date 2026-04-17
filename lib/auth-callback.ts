import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";

export const LAST_DEEP_LINK_URL_KEY = "last_deep_link_url";
export const AUTH_PENDING_TOKENS_KEY = "auth_pending_tokens_v1";
export const AUTH_PENDING_PROVIDER_KEY = "auth_pending_provider_v1";
export const AUTH_PENDING_IDENTITY_LINK_KEY = "auth_pending_identity_link_v1";

const AUTH_PENDING_FLOW_KEY = "auth_pending_flow_v1";
type PendingAuthFlow = {
  createdAt: number;
  purpose: "oauth" | "email_link" | "email_signup" | "password_reset";
};

type PendingAuthProvider = {
  createdAt: number;
  provider: "google" | "apple";
};

type PendingIdentityLink = {
  createdAt: number;
  provider: "google" | "apple";
};

const DEV_CALLBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);
const AUTH_PENDING_FLOW_TTLS: Record<PendingAuthFlow["purpose"], number> = {
  oauth: 15 * 60 * 1000,
  email_link: 4 * 60 * 60 * 1000,
  email_signup: 24 * 60 * 60 * 1000,
  password_reset: 2 * 60 * 60 * 1000,
};
const AUTH_PENDING_PROVIDER_TTL_MS = 15 * 60 * 1000;
const AUTH_PENDING_IDENTITY_LINK_TTL_MS = 5 * 60 * 1000;

const parseFreshPendingAuthProvider = async (): Promise<PendingAuthProvider | null> => {
  try {
    const raw = await AsyncStorage.getItem(AUTH_PENDING_PROVIDER_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PendingAuthProvider>;
    const createdAt = typeof parsed.createdAt === "number" ? parsed.createdAt : 0;
    const provider =
      parsed.provider === "google" || parsed.provider === "apple"
        ? parsed.provider
        : null;

    const isFresh = createdAt > 0 && provider && Date.now() - createdAt <= AUTH_PENDING_PROVIDER_TTL_MS;
    if (!isFresh || !provider) {
      await AsyncStorage.removeItem(AUTH_PENDING_PROVIDER_KEY);
      return null;
    }

    return { createdAt, provider };
  } catch {
    return null;
  }
};

const parseFreshPendingIdentityLink = async (): Promise<PendingIdentityLink | null> => {
  try {
    const raw = await AsyncStorage.getItem(AUTH_PENDING_IDENTITY_LINK_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PendingIdentityLink>;
    const createdAt = typeof parsed.createdAt === "number" ? parsed.createdAt : 0;
    const provider =
      parsed.provider === "google" || parsed.provider === "apple"
        ? parsed.provider
        : null;

    const isFresh =
      createdAt > 0 &&
      provider &&
      Date.now() - createdAt <= AUTH_PENDING_IDENTITY_LINK_TTL_MS;
    if (!isFresh || !provider) {
      await AsyncStorage.removeItem(AUTH_PENDING_IDENTITY_LINK_KEY);
      return null;
    }

    return { createdAt, provider };
  } catch {
    return null;
  }
};

const parseFreshPendingAuthFlow = async (): Promise<PendingAuthFlow | null> => {
  try {
    const raw = await AsyncStorage.getItem(AUTH_PENDING_FLOW_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PendingAuthFlow>;
    const createdAt =
      typeof parsed.createdAt === "number" ? parsed.createdAt : 0;
    const purpose =
      parsed.purpose === "oauth" ||
      parsed.purpose === "email_link" ||
      parsed.purpose === "email_signup" ||
      parsed.purpose === "password_reset"
        ? parsed.purpose
        : null;
    const ttlMs = purpose ? AUTH_PENDING_FLOW_TTLS[purpose] : 0;
    const isFresh = createdAt > 0 && ttlMs > 0 && Date.now() - createdAt <= ttlMs;

    if (!isFresh || !purpose) {
      await AsyncStorage.removeItem(AUTH_PENDING_FLOW_KEY);
      return null;
    }

    return { createdAt, purpose };
  } catch {
    return null;
  }
};

export const urlHasAuthPayload = (url: string) =>
  url.includes("access_token=") ||
  url.includes("refresh_token=") ||
  url.includes("code=") ||
  url.includes("token_hash=");

export const isTrustedAuthCallbackUrl = (url: string) => {
  const normalized = url.trim();
  const lower = normalized.toLowerCase();

  if (lower.startsWith("https://getbetweener.com/auth/callback")) {
    return true;
  }

  try {
    const parsed = Linking.parse(normalized);
    const scheme = parsed.scheme?.toLowerCase() ?? "";
    const host = parsed.hostname?.toLowerCase() ?? "";
    const path = (parsed.path ?? "").replace(/^\/+|\/+$/g, "").toLowerCase();

    if (scheme === "betweenerapp" && host === "auth" && path === "callback") {
      return true;
    }

    if ((scheme === "exp" || scheme === "exps") && path.endsWith("auth/callback")) {
      return true;
    }

    if (
      (scheme === "http" || scheme === "https") &&
      DEV_CALLBACK_HOSTS.has(host) &&
      (path === "auth/callback" || path.endsWith("/auth/callback") || path.endsWith("/--/auth/callback"))
    ) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
};

export const markPendingAuthFlow = async (
  purpose: PendingAuthFlow["purpose"]
) => {
  await AsyncStorage.setItem(
    AUTH_PENDING_FLOW_KEY,
    JSON.stringify({ createdAt: Date.now(), purpose } satisfies PendingAuthFlow)
  );
};

export const hasFreshPendingAuthFlow = async () => {
  return (await parseFreshPendingAuthFlow()) !== null;
};

export const getFreshPendingAuthFlow = async () => {
  return await parseFreshPendingAuthFlow();
};

export const clearPendingAuthFlow = async () => {
  await AsyncStorage.removeItem(AUTH_PENDING_FLOW_KEY);
};

export const markPendingAuthProvider = async (
  provider: PendingAuthProvider["provider"]
) => {
  await AsyncStorage.setItem(
    AUTH_PENDING_PROVIDER_KEY,
    JSON.stringify({ createdAt: Date.now(), provider } satisfies PendingAuthProvider)
  );
};

export const getFreshPendingAuthProvider = async () => {
  return await parseFreshPendingAuthProvider();
};

export const clearPendingAuthProvider = async () => {
  await AsyncStorage.removeItem(AUTH_PENDING_PROVIDER_KEY);
};

export const markPendingIdentityLink = async (
  provider: PendingIdentityLink["provider"]
) => {
  await AsyncStorage.setItem(
    AUTH_PENDING_IDENTITY_LINK_KEY,
    JSON.stringify({ createdAt: Date.now(), provider } satisfies PendingIdentityLink)
  );
};

export const getFreshPendingIdentityLink = async () => {
  return await parseFreshPendingIdentityLink();
};

export const clearPendingIdentityLink = async () => {
  await AsyncStorage.removeItem(AUTH_PENDING_IDENTITY_LINK_KEY);
};
