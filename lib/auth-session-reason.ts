import AsyncStorage from "@react-native-async-storage/async-storage";

const SESSION_EXPIRED_REASON_KEY = "auth_session_expired_reason_v1";
const SESSION_EXPIRED_TTL_MS = 15 * 60 * 1000;

type SessionExpiredReason = {
  at: number;
  reason: "online_signed_out" | "session_expired";
};

export async function persistSessionExpiredReason(
  reason: SessionExpiredReason["reason"],
) {
  try {
    const payload: SessionExpiredReason = {
      at: Date.now(),
      reason,
    };
    await AsyncStorage.setItem(SESSION_EXPIRED_REASON_KEY, JSON.stringify(payload));
  } catch {
    // best effort only
  }
}

export async function consumeSessionExpiredReason() {
  try {
    const raw = await AsyncStorage.getItem(SESSION_EXPIRED_REASON_KEY);
    if (!raw) return null;
    await AsyncStorage.removeItem(SESSION_EXPIRED_REASON_KEY);
    const parsed = JSON.parse(raw) as Partial<SessionExpiredReason> | null;
    if (!parsed || typeof parsed.at !== "number" || typeof parsed.reason !== "string") {
      return null;
    }
    if (Date.now() - parsed.at > SESSION_EXPIRED_TTL_MS) {
      return null;
    }
    return parsed as SessionExpiredReason;
  } catch {
    return null;
  }
}
