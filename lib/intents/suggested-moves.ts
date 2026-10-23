import { getSafeRemoteImageUri, getUserFacingDisplayName, hasLeftBetweener } from '../profile/display-name.ts';

export type SuggestedMoveProfile = {
  id: string;
  full_name?: string | null;
  age?: number | null;
  avatar_url?: string | null;
  photos?: string[] | null;
  account_state?: string | null;
  deleted_at?: string | null;
};

type SuggestedMoveBase = {
  id: string;
  full_name?: string | null;
  age?: number | null;
  avatar_url?: string | null;
};

const firstSafePhoto = (photos?: string[] | null) => {
  if (!Array.isArray(photos)) return null;
  for (const photo of photos) {
    const safe = getSafeRemoteImageUri(photo);
    if (safe) return safe;
  }
  return null;
};

export const mergeSuggestedMovesWithProfiles = <T extends SuggestedMoveBase>(
  moves: T[],
  profiles: SuggestedMoveProfile[],
): (T & SuggestedMoveBase)[] => {
  const profileById = new Map(profiles.map((profile) => [String(profile.id), profile]));

  return moves.flatMap((move) => {
    const profile = profileById.get(String(move.id));
    if (profile && hasLeftBetweener(profile)) return [];

    const avatarUrl =
      getSafeRemoteImageUri(profile?.avatar_url) ||
      firstSafePhoto(profile?.photos) ||
      getSafeRemoteImageUri(move.avatar_url);

    return [{
      ...move,
      full_name: profile
        ? getUserFacingDisplayName(profile, move.full_name || 'Someone')
        : move.full_name,
      age: profile?.age ?? move.age,
      avatar_url: avatarUrl,
    }];
  });
};
