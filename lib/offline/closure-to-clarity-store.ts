import {
  readOfflineState,
  writeOfflineEnvelope,
  updateOfflineEnvelope,
  type OfflineReadState,
} from '@/lib/offline/core';
import type {
  ClosureCandidatePool,
  ClosureReflectionReason,
} from '@/lib/intents/closure-to-clarity';

const CLOSURE_TO_CLARITY_STORE_VERSION = 2;
const CLOSURE_TO_CLARITY_STALE_AFTER_MS = 20 * 60 * 1000;

const buildClosureToClaritySnapshotKey = (
  viewerProfileId: string,
  requestId: string,
  targetProfileId: string,
) =>
  `offline:closure-to-clarity:v${CLOSURE_TO_CLARITY_STORE_VERSION}:${viewerProfileId}:${requestId}:${targetProfileId}`;

export type OfflineClosureToClaritySnapshot = {
  pool: ClosureCandidatePool;
  selectedReasons: ClosureReflectionReason[];
};

export async function readClosureToClaritySnapshotState(
  viewerProfileId: string,
  requestId: string,
  targetProfileId: string,
): Promise<OfflineReadState<OfflineClosureToClaritySnapshot>> {
  return readOfflineState<OfflineClosureToClaritySnapshot>(
    buildClosureToClaritySnapshotKey(viewerProfileId, requestId, targetProfileId),
  );
}

export async function writeClosureToClaritySnapshot(
  viewerProfileId: string,
  requestId: string,
  targetProfileId: string,
  snapshot: OfflineClosureToClaritySnapshot,
): Promise<void> {
  await writeOfflineEnvelope(
    buildClosureToClaritySnapshotKey(viewerProfileId, requestId, targetProfileId),
    snapshot,
    {
      kind: 'closure-to-clarity',
      staleAfterMs: CLOSURE_TO_CLARITY_STALE_AFTER_MS,
    },
  );
}

export async function updateClosureToClaritySnapshot(
  viewerProfileId: string,
  requestId: string,
  targetProfileId: string,
  updater: (
    current: OfflineClosureToClaritySnapshot | null,
  ) =>
    | OfflineClosureToClaritySnapshot
    | null
    | Promise<OfflineClosureToClaritySnapshot | null>,
): Promise<OfflineClosureToClaritySnapshot | null> {
  return updateOfflineEnvelope<OfflineClosureToClaritySnapshot>(
    buildClosureToClaritySnapshotKey(viewerProfileId, requestId, targetProfileId),
    updater,
    {
      kind: 'closure-to-clarity',
      staleAfterMs: CLOSURE_TO_CLARITY_STALE_AFTER_MS,
    },
  );
}
