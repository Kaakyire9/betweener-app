import type { LiveQuickConnectSnapshot } from '../application/live-models.ts';

export const quickConnectRemainingSeconds = (
  snapshot: LiveQuickConnectSnapshot | null,
  elapsedSinceSnapshotMs = 0,
): number => {
  if (!snapshot?.pairing) return 0;
  const serverNowMs = Date.parse(snapshot.serverNow);
  const endsAtMs = Date.parse(snapshot.pairing.endsAt);
  if (!Number.isFinite(serverNowMs) || !Number.isFinite(endsAtMs)) return 0;
  return Math.max(
    0,
    Math.ceil((endsAtMs - (serverNowMs + Math.max(0, elapsedSinceSnapshotMs))) / 1_000),
  );
};

export const formatQuickConnectTime = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
};

export const quickConnectOutcomeCopy = (
  outcome: 'mutual_continue' | 'friendship' | 'closed' | null,
): string => {
  if (outcome === 'mutual_continue') return 'You both chose to keep the conversation going.';
  if (outcome === 'friendship') return 'You both chose friendship.';
  return 'This round has closed with care.';
};

export const normalizeQuickConnectErrorCode = (error: unknown): string => {
  const raw = error instanceof Error ? error.message.trim() : '';
  return /^(?:live|authentication)_[a-z0-9_]+$/.test(raw)
    ? raw
    : 'live_quick_connect_unavailable';
};

export const quickConnectAvailabilityCopy = (code: string | null): string | null => {
  if (!code) return null;
  if (code === 'live_quick_connect_not_open') {
    return 'The host is preparing the next Quick Connect rotation.';
  }
  if (code === 'live_quick_connect_not_started' || code === 'live_join_unavailable') {
    return 'This Quick Connect round has not opened yet.';
  }
  if (code === 'live_room_capacity_reached') {
    return 'This Live room is full. Try the next hosted round.';
  }
  if (code === 'live_profile_ineligible' || code === 'live_quick_connect_profile_ineligible') {
    return 'Complete your profile verification before joining Quick Connect.';
  }
  if (code === 'authentication_required') {
    return 'Reconnect your account, then try Quick Connect again.';
  }
  if (code === 'live_quick_connect_forbidden') {
    return 'Quick Connect is not available for this account in this room.';
  }
  if (code === 'live_quick_connect_preferences_required') {
    return 'Choose who you are open to meeting before joining the pool.';
  }
  if (code === 'live_quick_connect_safety_hold_active') {
    return 'Quick Connect is temporarily paused for this account while Betweener Safety reviews recent private reports.';
  }
  return 'Quick Connect is temporarily unavailable.';
};

export type QuickConnectQueueCopy = Readonly<{
  title: string;
  body: string;
}>;

export const quickConnectQueueCopy = (
  snapshot: LiveQuickConnectSnapshot | null,
  availabilityCode: string | null = null,
): QuickConnectQueueCopy => {
  if (!snapshot && availabilityCode === 'live_quick_connect_not_open') {
    return {
      title: 'The next rotation is being prepared.',
      body: 'Stay in the Live. You will enter automatically when the host opens Quick Connect.',
    };
  }
  switch (snapshot?.queueStatus) {
    case 'current_private_conversation':
      return {
        title: 'Your current Spark comes first.',
        body: 'Finish or leave that private conversation before joining another Quick Connect.',
      };
    case 'waiting_for_partner':
      return {
        title: 'Your place is held.',
        body: 'You are first in line. We will begin when another available person joins.',
      };
    case 'waiting_for_eligible_partner':
      return {
        title: 'Your place is held.',
        body: 'People are here, but no mutually eligible pairing is available yet. Preferences and safety rules stay private.',
      };
    case 'rotation_complete':
      return {
        title: 'This rotation is complete.',
        body: 'You have already met every currently eligible person. We will hold your place for someone new.',
      };
    case 'pairing_in_progress':
      return {
        title: 'Your conversation is opening.',
        body: 'We found an eligible person and are preparing your private room.',
      };
    case 'reconnecting':
      return {
        title: 'Holding your place.',
        body: 'Reconnect to stay in this Quick Connect round.',
      };
    default:
      return {
        title: 'Quick Connect is resting.',
        body: 'Return to the Live room and try the next hosted round.',
      };
  }
};

/** Expected host-gated availability is a waiting state, not a transport failure. */
export const quickConnectIsWaitingForHost = (code: string | null): boolean =>
  code === 'live_quick_connect_not_open';

/** Queue presence is separate from the RTC connection of an active pair. */
export const quickConnectQueueNeedsRejoin = (
  snapshot: LiveQuickConnectSnapshot | null,
): boolean => {
  if (!snapshot) return true;
  if (snapshot.pairing) return false;
  return snapshot.connectionState !== 'connected'
    || snapshot.state === 'not_joined'
    || snapshot.state === 'left'
    || snapshot.state === 'unavailable';
};
