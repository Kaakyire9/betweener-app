export type VibesAccessReason =
  | 'account_unavailable'
  | 'profile_incomplete'
  | 'moderation_hidden'
  | 'matchmaking_mode'
  | 'visibility_off';

export type VibesAccessProfile = {
  account_state?: unknown;
  is_active?: unknown;
  profile_completed?: unknown;
  profile_moderation_state?: unknown;
  matchmaking_mode?: unknown;
  discoverable_in_vibes?: unknown;
};

const normalized = (value: unknown) => String(value ?? '').trim().toUpperCase();

/**
 * Resolves the first actionable reason a signed-in profile cannot use Vibes.
 * Undefined legacy fields do not block access; only explicit server state does.
 */
export const deriveVibesAccessReason = (
  profile?: VibesAccessProfile | null,
): VibesAccessReason | null => {
  if (!profile) return null;

  const accountState = normalized(profile.account_state);
  if ((accountState && accountState !== 'ACTIVE') || profile.is_active === false) {
    return 'account_unavailable';
  }
  if (profile.profile_completed === false) return 'profile_incomplete';

  const moderationState = normalized(profile.profile_moderation_state);
  if (moderationState && moderationState !== 'CLEAR') return 'moderation_hidden';
  if (profile.matchmaking_mode === true) return 'matchmaking_mode';
  if (profile.discoverable_in_vibes === false) return 'visibility_off';

  return null;
};
