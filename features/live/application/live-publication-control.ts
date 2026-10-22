export type LiveBroadcastAuthority = 'mobile_host' | 'studio_producer';

export type LivePublicationControl = {
  schemaVersion: 1;
  serverNow: string;
  sessionId: string;
  status: string;
  version: number;
  scheduledStart: string | null;
  startWindowClosesAt: string | null;
  broadcastAuthority: LiveBroadcastAuthority;
  currentAal: 'aal1' | 'aal2';
  canOpenBackstage: boolean;
  canStart: boolean;
  canSetAuthority: boolean;
  requiresStepUp: boolean;
  controlSurface: 'mobile' | 'studio';
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const hasExplicitTimezone = (value: string) =>
  /(?:z|[+-]\d{2}(?::?\d{2})?)$/iu.test(value);

export const parseLiveServerTimestamp = (value: string): number => {
  const timestamp = value.trim();
  if (!timestamp) return Number.NaN;

  // Older publication snapshots serialized `timezone('utc', now())`, which
  // produces an ISO-looking timestamp without a zone. Treat that legacy
  // contract as UTC so daylight-saving offsets cannot move the server clock.
  return Date.parse(hasExplicitTimezone(timestamp) ? timestamp : `${timestamp}Z`);
};

export const getLiveServerClockOffsetMs = (
  serverNow: string,
  deviceNow = Date.now(),
): number => {
  const serverNowMs = parseLiveServerTimestamp(serverNow);
  return Number.isFinite(serverNowMs) ? serverNowMs - deviceNow : 0;
};

export const parseLivePublicationControl = (value: unknown): LivePublicationControl => {
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || typeof value.serverNow !== 'string'
    || typeof value.sessionId !== 'string'
    || typeof value.status !== 'string'
    || typeof value.version !== 'number'
    || !['mobile_host', 'studio_producer'].includes(String(value.broadcastAuthority))
    || !['aal1', 'aal2'].includes(String(value.currentAal))
    || typeof value.canOpenBackstage !== 'boolean'
    || typeof value.canStart !== 'boolean'
    || typeof value.canSetAuthority !== 'boolean'
    || typeof value.requiresStepUp !== 'boolean'
    || !['mobile', 'studio'].includes(String(value.controlSurface))) {
    throw new Error('live_publication_control_invalid');
  }

  return {
    schemaVersion: 1,
    serverNow: value.serverNow,
    sessionId: value.sessionId,
    status: value.status,
    version: value.version,
    scheduledStart: typeof value.scheduledStart === 'string' ? value.scheduledStart : null,
    startWindowClosesAt: typeof value.startWindowClosesAt === 'string'
      ? value.startWindowClosesAt
      : null,
    broadcastAuthority: value.broadcastAuthority as LiveBroadcastAuthority,
    currentAal: value.currentAal as 'aal1' | 'aal2',
    canOpenBackstage: value.canOpenBackstage === true,
    canStart: value.canStart === true,
    canSetAuthority: value.canSetAuthority === true,
    requiresStepUp: value.requiresStepUp === true,
    controlSurface: value.controlSurface as 'mobile' | 'studio',
  };
};

export const getLivePublicationErrorCode = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return [
    'live_step_up_required',
    'live_studio_step_up_required',
    'live_studio_controls_publication',
    'live_session_not_due',
    'live_start_window_expired',
    'live_session_version_conflict',
    'live_backstage_required',
    'live_backstage_forbidden',
  ].find((code) => message.includes(code)) ?? 'live_publication_failed';
};

export const getLivePublicationErrorMessage = (error: unknown): string => {
  switch (getLivePublicationErrorCode(error)) {
    case 'live_step_up_required':
    case 'live_studio_step_up_required':
      return 'Verify with your authenticator before opening the public stage.';
    case 'live_studio_controls_publication':
      return 'This Live is controlled by Studio. Your producer will open the public stage.';
    case 'live_session_not_due':
      return 'This event is not due yet. The public stage will unlock at its scheduled time.';
    case 'live_start_window_expired':
      return 'The opening window has passed. Reschedule the Live before welcoming guests.';
    case 'live_session_version_conflict':
      return 'The Live changed on another device. Refreshing the latest state…';
    case 'live_backstage_required':
      return 'Enter private backstage and complete your final checks first.';
    case 'live_backstage_forbidden':
      return 'You do not have backstage access for this Live.';
    default:
      return 'The public stage could not be opened. Check your connection and try again.';
  }
};
