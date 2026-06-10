import { activateKeepAwakeAsync, deactivateKeepAwake, ExpoKeepAwakeTag, isAvailableAsync } from 'expo-keep-awake';
import { AppState } from 'react-native';

export type ScreenAwakeReason =
  | 'video_recording'
  | 'camera_capture'
  | 'qr_scanner'
  | 'video_playback'
  | 'video_call'
  | 'live_event';

export type ScreenAwakeLease = {
  reason: ScreenAwakeReason;
  tag: string;
  activatedAt: number;
};

type InternalLease = {
  lease: ScreenAwakeLease;
  warningTimer: ReturnType<typeof setTimeout> | null;
};

const ACTIVE_LEASES = new Map<string, InternalLease>();
const SCREEN_AWAKE_REASONS: readonly ScreenAwakeReason[] = [
  'video_recording',
  'camera_capture',
  'qr_scanner',
  'video_playback',
  'video_call',
  'live_event',
] as const;
const SCREEN_AWAKE_REASON_SET = new Set<ScreenAwakeReason>(SCREEN_AWAKE_REASONS);
const STALE_LEASE_WARNING_MS = 10 * 60 * 1000;
const RECENT_RELEASE_WINDOW_MS = 2500;

let keepAwakeAvailablePromise: Promise<boolean> | null = null;
let keepAwakeAvailabilityResolved = false;
const recentlyReleasedTags = new Map<string, number>();

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

function normalizeInstanceId(instanceId?: string) {
  const normalized = String(instanceId ?? 'default')
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, '-')
    .replace(/-+/g, '-');
  return normalized.length > 0 ? normalized : 'default';
}

function buildScreenAwakeTag(reason: ScreenAwakeReason, instanceId?: string) {
  return `betweener:screen-awake:${reason}:${normalizeInstanceId(instanceId)}`;
}

function debugLog(event: string, payload: Record<string, unknown>) {
  if (!isDev) return;
  console.log('[screen-awake]', {
    event,
    appState: AppState.currentState,
    ...payload,
  });
}

function warnLog(event: string, payload: Record<string, unknown>) {
  if (!isDev) return;
  console.warn('[screen-awake]', {
    event,
    appState: AppState.currentState,
    ...payload,
  });
}

function clearWarningTimer(internalLease: InternalLease | undefined) {
  if (!internalLease?.warningTimer) return;
  clearTimeout(internalLease.warningTimer);
  internalLease.warningTimer = null;
}

function rememberRecentRelease(tag: string) {
  const now = Date.now();
  recentlyReleasedTags.set(tag, now);
  for (const [releasedTag, releasedAt] of recentlyReleasedTags.entries()) {
    if (now - releasedAt > RECENT_RELEASE_WINDOW_MS) {
      recentlyReleasedTags.delete(releasedTag);
    }
  }
}

function scheduleStaleLeaseWarning(lease: ScreenAwakeLease) {
  if (!isDev) return null;
  return setTimeout(() => {
    if (!ACTIVE_LEASES.has(lease.tag)) return;
    warnLog('screen_awake_stale_lease_detected', {
      tag: lease.tag,
      reason: lease.reason,
      heldForMs: Date.now() - lease.activatedAt,
    });
  }, STALE_LEASE_WARNING_MS);
}

function assertScreenAwakeReason(reason: ScreenAwakeReason) {
  if (!SCREEN_AWAKE_REASON_SET.has(reason)) {
    throw new Error(`screen_awake_reason_invalid:${String(reason)}`);
  }
}

async function ensureKeepAwakeAvailable() {
  if (!keepAwakeAvailablePromise) {
    keepAwakeAvailablePromise = isAvailableAsync().catch(() => false);
  }
  const available = await keepAwakeAvailablePromise;
  if (!keepAwakeAvailabilityResolved) {
    keepAwakeAvailabilityResolved = true;
    debugLog('screen_awake_availability_resolved', {
      available,
    });
  }
  return available;
}

async function releaseInternal(tag: string, source: string) {
  const internalLease = ACTIVE_LEASES.get(tag);
  if (!internalLease) {
    const recentReleaseAt = recentlyReleasedTags.get(tag);
    if (recentReleaseAt && Date.now() - recentReleaseAt <= RECENT_RELEASE_WINDOW_MS) {
      return;
    }
    warnLog('screen_awake_release_unknown_tag', {
      tag,
      source,
    });
    return;
  }

  ACTIVE_LEASES.delete(tag);
  rememberRecentRelease(tag);
  clearWarningTimer(internalLease);

  try {
    if (await ensureKeepAwakeAvailable()) {
      await deactivateKeepAwake(tag);
    }
  } catch (error) {
    warnLog('screen_awake_release_native_error', {
      tag,
      source,
      reason: internalLease.lease.reason,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    debugLog(source === 'background_release' ? 'screen_awake_background_release' : source === 'force_release' ? 'screen_awake_force_released' : 'screen_awake_released', {
      tag,
      reason: internalLease.lease.reason,
      releaseSource: source,
      heldForMs: Date.now() - internalLease.lease.activatedAt,
      activeLeaseCount: ACTIVE_LEASES.size,
    });
  }
}

export function isScreenAwakeAllowed(reason: ScreenAwakeReason) {
  return SCREEN_AWAKE_REASON_SET.has(reason);
}

export function getActiveScreenAwakeLeases(): ScreenAwakeLease[] {
  return Array.from(ACTIVE_LEASES.values())
    .map((entry) => entry.lease)
    .sort((left, right) => left.activatedAt - right.activatedAt);
}

export async function acquireScreenAwake(reason: ScreenAwakeReason, instanceId?: string): Promise<string> {
  assertScreenAwakeReason(reason);

  const tag = buildScreenAwakeTag(reason, instanceId);
  const existing = ACTIVE_LEASES.get(tag);
  if (existing) {
    debugLog('screen_awake_acquire_duplicate', {
      tag,
      reason,
      activeLeaseCount: ACTIVE_LEASES.size,
    });
    return tag;
  }

  const lease: ScreenAwakeLease = {
    reason,
    tag,
    activatedAt: Date.now(),
  };
  const internalLease: InternalLease = {
    lease,
    warningTimer: null,
  };

  ACTIVE_LEASES.set(tag, internalLease);
  internalLease.warningTimer = scheduleStaleLeaseWarning(lease);

  try {
    if (await ensureKeepAwakeAvailable()) {
      await activateKeepAwakeAsync(tag);
    } else {
      warnLog('screen_awake_unavailable', {
        tag,
        reason,
      });
    }
    debugLog('screen_awake_acquired', {
      tag,
      reason,
      activeLeaseCount: ACTIVE_LEASES.size,
    });
    if (ACTIVE_LEASES.size > 1) {
      warnLog('screen_awake_multiple_active_leases', {
        activeLeases: getActiveScreenAwakeLeases(),
      });
    }
    return tag;
  } catch (error) {
    ACTIVE_LEASES.delete(tag);
    clearWarningTimer(internalLease);
    throw error;
  }
}

export async function releaseScreenAwake(tag: string): Promise<void> {
  await releaseInternal(tag, 'release');
}

export async function releaseAllScreenAwakeLocks(source: string): Promise<void> {
  const activeTags = Array.from(ACTIVE_LEASES.keys());
  await Promise.all(
    activeTags.map((tag) =>
      releaseInternal(tag, source.includes('background') ? 'background_release' : 'force_release'),
    ),
  );
  debugLog('screen_awake_release_all_complete', {
    source,
    releasedCount: activeTags.length,
  });
}

export async function resetExternalKeepAwakeIfIdle(source: string): Promise<void> {
  if (ACTIVE_LEASES.size > 0) {
    debugLog('screen_awake_external_reset_skipped', {
      source,
      reason: 'active_leases_present',
      activeLeaseCount: ACTIVE_LEASES.size,
    });
    return;
  }

  try {
    if (!(await ensureKeepAwakeAvailable())) {
      debugLog('screen_awake_external_reset_skipped', {
        source,
        reason: 'keep_awake_unavailable',
      });
      return;
    }

    await deactivateKeepAwake(ExpoKeepAwakeTag);
    debugLog('screen_awake_external_reset_complete', {
      source,
      tag: ExpoKeepAwakeTag,
    });
  } catch (error) {
    warnLog('screen_awake_external_reset_failed', {
      source,
      tag: ExpoKeepAwakeTag,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
