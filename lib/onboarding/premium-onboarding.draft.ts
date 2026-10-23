import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  PremiumOnboardingFormState,
  PremiumOnboardingVariant,
} from "./premium-onboarding.types";

const DRAFT_VERSION = 2;
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DRAFT_KEY_PREFIX = "@betweener/onboarding-draft/v2";

export type PremiumOnboardingDraft = {
  version: typeof DRAFT_VERSION;
  userId: string;
  variant: PremiumOnboardingVariant;
  stepIndex: number;
  form: PremiumOnboardingFormState;
  customOccupation: string;
  customTribe: string;
  imageUri: string | null;
  approvedAvatarUrl: string | null;
  completionRequestId: string;
  savedAt: number;
  expiresAt: number;
};

type SaveDraftInput = Omit<PremiumOnboardingDraft, "version" | "savedAt" | "expiresAt">;

const draftKey = (userId: string, variant: PremiumOnboardingVariant) =>
  `${DRAFT_KEY_PREFIX}/${userId}/${variant}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export async function loadPremiumOnboardingDraft(
  userId: string,
  variant: PremiumOnboardingVariant,
): Promise<PremiumOnboardingDraft | null> {
  const key = draftKey(userId, variant);
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      !isRecord(parsed)
      || parsed.version !== DRAFT_VERSION
      || parsed.userId !== userId
      || parsed.variant !== variant
      || !isRecord(parsed.form)
      || typeof parsed.completionRequestId !== "string"
      || typeof parsed.expiresAt !== "number"
      || parsed.expiresAt <= Date.now()
    ) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    return parsed as PremiumOnboardingDraft;
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }
}

export async function savePremiumOnboardingDraft(input: SaveDraftInput): Promise<void> {
  const now = Date.now();
  const draft: PremiumOnboardingDraft = {
    ...input,
    version: DRAFT_VERSION,
    savedAt: now,
    expiresAt: now + DRAFT_TTL_MS,
  };
  await AsyncStorage.setItem(draftKey(input.userId, input.variant), JSON.stringify(draft));
}

export async function clearPremiumOnboardingDraft(
  userId: string,
  variant: PremiumOnboardingVariant,
): Promise<void> {
  await AsyncStorage.removeItem(draftKey(userId, variant));
}

export const PREMIUM_ONBOARDING_DRAFT_VERSION = DRAFT_VERSION;
