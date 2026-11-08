export type CircleMemberPreview = {
  circle_id: string;
  profile_id: string;
  full_name?: string | null;
  avatar_url?: string | null;
};

type CircleMemberPreviewProfile = {
  id?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  hero_image_url?: string | null;
  photos?: unknown;
};

const firstNonEmptyString = (values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

export const resolveCircleMemberPreviewAvatar = (
  profile?: CircleMemberPreviewProfile | null,
) => firstNonEmptyString([
  profile?.avatar_url,
  profile?.hero_image_url,
  ...(Array.isArray(profile?.photos) ? profile.photos : []),
]);

export const groupCircleMemberPreviewRows = (
  rows: unknown[],
  perCircleLimit = 3,
): Record<string, CircleMemberPreview[]> => {
  const limit = Math.max(1, Math.min(3, Math.trunc(perCircleLimit) || 3));

  return rows.reduce<Record<string, CircleMemberPreview[]>>((result, rawRow) => {
    const row = rawRow as Record<string, unknown>;
    const circleId = String(row.circle_id ?? '').trim();
    const nestedProfile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const profile = (nestedProfile ?? row) as CircleMemberPreviewProfile;
    const profileId = String(profile?.id ?? row.profile_id ?? '').trim();
    const avatarUrl = resolveCircleMemberPreviewAvatar(profile);
    if (!circleId || !profileId || !avatarUrl) return result;

    const current = result[circleId] ?? [];
    if (current.length >= limit || current.some((member) => member.profile_id === profileId)) {
      return result;
    }

    result[circleId] = [
      ...current,
      {
        circle_id: circleId,
        profile_id: profileId,
        full_name: typeof profile.full_name === 'string' ? profile.full_name : null,
        avatar_url: avatarUrl,
      },
    ];
    return result;
  }, {});
};

export const formatCircleMemberCount = (value?: number | null) => {
  const count = Math.max(0, Math.trunc(Number(value) || 0));
  return count === 1 ? '1 member' : `${count} members`;
};
