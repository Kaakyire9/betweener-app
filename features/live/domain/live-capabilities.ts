import type { LiveParticipantRole } from './live-types.ts';

export const LIVE_CAPABILITIES = [
  'live.join',
  'live.react',
  'live.comment',
  'live.report',
  'live.block',
  'live.request_seat',
  'live.publish',
  'live.manage_seats',
  'live.moderate_comments',
  'live.mute_participant',
  'live.remove_participant',
  'live.ban_participant',
  'live.suggest_match',
  'live.manage_match_round',
  'live.start_session',
  'live.end_session',
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
  'live.mute_participant',
  'live.remove_participant',
  'live.ban_participant',
];

export const LIVE_ROLE_CAPABILITIES: Readonly<
  Record<LiveParticipantRole, readonly LiveCapability[]>
> = {
  audience: AUDIENCE_CAPABILITIES,
  participant: [...AUDIENCE_CAPABILITIES, 'live.publish'],
  matchmaker: [
    ...AUDIENCE_CAPABILITIES,
    'live.suggest_match',
    'live.manage_match_round',
  ],
  moderator: [...AUDIENCE_CAPABILITIES, ...MODERATION_CAPABILITIES],
  host: [
    ...AUDIENCE_CAPABILITIES,
    ...MODERATION_CAPABILITIES,
    'live.publish',
    'live.manage_seats',
    'live.start_session',
    'live.end_session',
  ],
  internal_admin: [
    'live.join',
    'live.report',
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

