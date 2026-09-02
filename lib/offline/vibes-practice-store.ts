import { readOfflineData, writeOfflineEnvelope } from "@/lib/offline/core";

export type VibesPracticeStep =
  | "intro"
  | "intentPrompt"
  | "intentForm"
  | "intentExplain"
  | "noticePrompt"
  | "noticeExplain"
  | "passPrompt"
  | "passExplain"
  | "undoPrompt"
  | "undoExplain";

export type OfflineVibesPracticeSnapshot = {
  completedAt: string | null;
  completedVersion: number;
  completionSyncPending: boolean;
  currentStep: VibesPracticeStep;
  updatedAt: string;
};

const VIBES_PRACTICE_STORE_VERSION = 1;
const DEFAULT_STEP: VibesPracticeStep = "intro";

const buildVibesPracticeStoreKey = (ownerId: string) =>
  `offline:vibes:practice:v${VIBES_PRACTICE_STORE_VERSION}:${ownerId}`;

const isVibesPracticeStep = (value: unknown): value is VibesPracticeStep =>
  value === "intro" ||
  value === "intentPrompt" ||
  value === "intentForm" ||
  value === "intentExplain" ||
  value === "noticePrompt" ||
  value === "noticeExplain" ||
  value === "passPrompt" ||
  value === "passExplain" ||
  value === "undoPrompt" ||
  value === "undoExplain";

const normalizeSnapshot = (
  snapshot: OfflineVibesPracticeSnapshot | null,
): OfflineVibesPracticeSnapshot | null => {
  if (!snapshot) return null;
  return {
    completedAt: typeof snapshot.completedAt === "string" ? snapshot.completedAt : null,
    completedVersion:
      typeof snapshot.completedVersion === "number" && Number.isFinite(snapshot.completedVersion)
        ? snapshot.completedVersion
        : 0,
    completionSyncPending: Boolean(snapshot.completionSyncPending),
    currentStep: isVibesPracticeStep(snapshot.currentStep) ? snapshot.currentStep : DEFAULT_STEP,
    updatedAt: typeof snapshot.updatedAt === "string" ? snapshot.updatedAt : new Date(0).toISOString(),
  };
};

export function getDefaultVibesPracticeSnapshot(): OfflineVibesPracticeSnapshot {
  return {
    completedAt: null,
    completedVersion: 0,
    completionSyncPending: false,
    currentStep: DEFAULT_STEP,
    updatedAt: new Date(0).toISOString(),
  };
}

export async function readVibesPracticeSnapshot(
  ownerId: string,
): Promise<OfflineVibesPracticeSnapshot | null> {
  const snapshot = await readOfflineData<OfflineVibesPracticeSnapshot>(buildVibesPracticeStoreKey(ownerId));
  return normalizeSnapshot(snapshot);
}

export async function writeVibesPracticeSnapshot(
  ownerId: string,
  snapshot: OfflineVibesPracticeSnapshot,
): Promise<void> {
  await writeOfflineEnvelope(buildVibesPracticeStoreKey(ownerId), normalizeSnapshot(snapshot) ?? getDefaultVibesPracticeSnapshot(), {
    kind: "vibes:practice",
  });
}
