import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";

export const LAST_DEEP_LINK_URL_KEY = "last_deep_link_url";
export const AUTH_PENDING_TOKENS_KEY = "auth_pending_tokens_v1";

const AUTH_PENDING_FLOW_KEY = "auth_pending_flow_v1";
type PendingAuthFlow = {
  createdAt: number;
  purpose: "oauth" | "email_link" | "email_signup" | "password_reset";
};

const DEV_CALLBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);
const AUTH_PENDING_FLOW_TTLS: Record<PendingAuthFlow["purpose"], number> = {
  oauth: 15 * 60 * 1000,
  email_link: 4 * 60 * 60 * 1000,
  email_signup: 24 * 60 * 60 * 1000,
  password_reset: 2 * 60 * 60 * 1000,
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
