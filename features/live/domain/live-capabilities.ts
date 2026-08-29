import type { LiveParticipantRole } from './live-types.ts';

export const LIVE_CAPABILITIES = [
  'live.create_session',
  'live.join',
  'live.react',
  'live.comment',
  'live.report',
  'live.block',
  'live.request_seat',
  'live.publish',
  'live.manage_stage',
  'live.approve_seat_request',
  'live.moderate_comments',
  'live.mute_public_participant',
  'live.remove_participant',
  'live.suspend_participant',
  'live.suggest_match',
  'live.create_match_round',
  'live.manage_audience_pulse',
  'live.start_session',
  'live.end_session',
  'live.terminate_private_spark',
  'live.view_host_console',
  'live.view_safety_console',
  'live.emergency_terminate',
] as const;

export type LiveCapability = (typeof LIVE_CAPABILITIES)[number];

const AUDIENCE_CAPABILITIES: readonly LiveCapability[] = [
  'live.join',
  'live.react',
  'live.comment',
  'live.report',
  'live.block',
  'live.request_seat',
];

const MODERATION_CAPABILITIES: readonly LiveCapability[] = [
  'live.moderate_comments',
  'live.mute_public_participant',
  'live.remove_participant',
  'live.suspend_participant',
  'live.terminate_private_spark',
  'live.view_safety_console',
];

export const LIVE_ROLE_CAPABILITIES: Readonly<
  Record<LiveParticipantRole, readonly LiveCapability[]>
> = {
  audience: AUDIENCE_CAPABILITIES,
  participant: [...AUDIENCE_CAPABILITIES, 'live.publish'],
  matchmaker: [
    ...AUDIENCE_CAPABILITIES,
    'live.suggest_match',
    'live.create_match_round',
    'live.manage_audience_pulse',
    'live.view_host_console',
  ],
  moderator: [
    ...AUDIENCE_CAPABILITIES,
    ...MODERATION_CAPABILITIES,
    'live.manage_audience_pulse',
  ],
  host: [
    ...AUDIENCE_CAPABILITIES,
    ...MODERATION_CAPABILITIES,
    'live.create_session',
    'live.publish',
    'live.manage_stage',
    'live.approve_seat_request',
    'live.suggest_match',
    'live.create_match_round',
    'live.manage_audience_pulse',
    'live.start_session',
    'live.end_session',
    'live.view_host_console',
  ],
  internal_admin: [
    'live.join',
    'live.report',
    'live.manage_audience_pulse',
    ...MODERATION_CAPABILITIES,
    'live.emergency_terminate',
  ],
};

export type LiveCapabilityResolution = {
  roles: readonly LiveParticipantRole[];
  capabilities: ReadonlySet<LiveCapability>;
};

export const resolveLiveCapabilities = (
  roles: readonly LiveParticipantRole[],
  explicitGrants: readonly LiveCapability[] = [],
  explicitRevocations: readonly LiveCapability[] = [],
): LiveCapabilityResolution => {
  const normalizedRoles = Array.from(new Set(roles));
  const capabilities = new Set<LiveCapability>(explicitGrants);

  normalizedRoles.forEach((role) => {
    LIVE_ROLE_CAPABILITIES[role].forEach((capability) => capabilities.add(capability));
  });
  explicitRevocations.forEach((capability) => capabilities.delete(capability));

  return { roles: normalizedRoles, capabilities };
};

export const hasLiveCapability = (
  resolution: LiveCapabilityResolution,
  capability: LiveCapability,
) => resolution.capabilities.has(capability);
