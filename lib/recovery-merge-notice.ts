import AsyncStorage from "@react-native-async-storage/async-storage";

export const PENDING_RECOVERY_MERGE_NOTICE_KEY = "pending_recovery_merge_notice_v1";

export type PendingRecoveryMergeNotice = {
  createdAt: number;
  duplicateUserId: string;
  duplicateEmail?: string | null;
  conflictingPhoneNumber?: string | null;
  attemptedSignInMethod?: string | null;
  restoredMethod?: string | null;
  recoveryToken?: string | null;
  autoRecoveryMethods?: string[] | null;
};

const NOTICE_TTL_MS = 24 * 60 * 60 * 1000;

export const storePendingRecoveryMergeNotice = async (
  payload: PendingRecoveryMergeNotice
) => {
  await AsyncStorage.setItem(
    PENDING_RECOVERY_MERGE_NOTICE_KEY,
    JSON.stringify(payload)
  );
};

export const getPendingRecoveryMergeNotice =
  async (): Promise<PendingRecoveryMergeNotice | null> => {
    try {
      const raw = await AsyncStorage.getItem(PENDING_RECOVERY_MERGE_NOTICE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<PendingRecoveryMergeNotice>;
      if (
        !parsed ||
        typeof parsed.createdAt !== "number" ||
        typeof parsed.duplicateUserId !== "string" ||
        !parsed.duplicateUserId.trim()
      ) {
        await AsyncStorage.removeItem(PENDING_RECOVERY_MERGE_NOTICE_KEY);
        return null;
      }
      if (Date.now() - parsed.createdAt > NOTICE_TTL_MS) {
        await AsyncStorage.removeItem(PENDING_RECOVERY_MERGE_NOTICE_KEY);
        return null;
      }
      return {
        createdAt: parsed.createdAt,
        duplicateUserId: parsed.duplicateUserId.trim(),
        duplicateEmail:
          typeof parsed.duplicateEmail === "string" ? parsed.duplicateEmail : null,
        conflictingPhoneNumber:
          typeof parsed.conflictingPhoneNumber === "string"
            ? parsed.conflictingPhoneNumber
            : null,
        attemptedSignInMethod:
          typeof parsed.attemptedSignInMethod === "string"
            ? parsed.attemptedSignInMethod
            : null,
        restoredMethod:
          typeof parsed.restoredMethod === "string" ? parsed.restoredMethod : null,
        recoveryToken:
          typeof parsed.recoveryToken === "string" ? parsed.recoveryToken : null,
        autoRecoveryMethods: Array.isArray(parsed.autoRecoveryMethods)
          ? parsed.autoRecoveryMethods.map((entry) => String(entry))
          : null,
      };
    } catch {
      return null;
    }
  };

export const clearPendingRecoveryMergeNotice = async () => {
  await AsyncStorage.removeItem(PENDING_RECOVERY_MERGE_NOTICE_KEY);
};
