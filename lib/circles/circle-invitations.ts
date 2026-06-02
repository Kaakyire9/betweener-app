import { supabase } from '@/lib/supabase';

const db = supabase as any;

export type CircleInviteCandidate = {
  profileId: string;
  fullName: string;
  avatarUrl: string | null;
  age: number | null;
  location: string | null;
  country: string | null;
  interests: string[];
};

export type SentCircleInvitation = {
  id: string;
  profileId: string;
  fullName: string;
  avatarUrl: string | null;
  age: number | null;
  location: string | null;
  status: string;
  createdAt: string;
  expiresAt: string;
};

export type MyCircleInvitation = {
  id: string;
  circleId: string;
  circleName: string;
  circleImageUrl: string | null;
  circleImagePath: string | null;
  inviterName: string;
  message: string | null;
  expiresAt: string;
};

type SearchCircleInviteCandidatesInput = {
  circleId: string;
  actorProfileId: string;
  search?: string;
  country?: string;
  interest?: string;
  minAge?: number | null;
  maxAge?: number | null;
};

export async function searchCircleInviteCandidates({
  circleId,
  actorProfileId,
  search,
  country,
  interest,
  minAge,
  maxAge,
}: SearchCircleInviteCandidatesInput): Promise<CircleInviteCandidate[]> {
  const { data, error } = await db.rpc('rpc_search_circle_invite_candidates', {
    p_circle_id: circleId,
    p_actor_profile_id: actorProfileId,
    p_search: search?.trim() || null,
    p_country: country?.trim() || null,
    p_interest: interest?.trim() || null,
    p_min_age: minAge ?? null,
    p_max_age: maxAge ?? null,
    p_limit: 24,
  });
  if (error) throw new Error(error.message || 'Could not search for Circle members.');

  return (data ?? []).map((row: any) => ({
    profileId: String(row.profile_id),
    fullName: String(row.full_name || 'Betweener member'),
    avatarUrl: row.avatar_url ?? null,
    age: typeof row.age === 'number' ? row.age : null,
    location: row.location ?? null,
    country: row.country ?? null,
    interests: Array.isArray(row.interests) ? row.interests.map(String) : [],
  }));
}

export async function inviteProfileToCircle(
  circleId: string,
  actorProfileId: string,
  invitedProfileId: string,
  message?: string,
) {
  const { error } = await db.rpc('rpc_invite_profile_to_circle', {
    p_circle_id: circleId,
    p_actor_profile_id: actorProfileId,
    p_invited_profile_id: invitedProfileId,
    p_message: message?.trim() || null,
  });
  if (error) throw new Error(error.message || 'Could not send the Circle invitation.');
}

export async function respondToCircleInvitation(circleId: string, profileId: string, accept: boolean) {
  const { data, error } = await db.rpc('rpc_respond_circle_invitation', {
    p_circle_id: circleId,
    p_profile_id: profileId,
    p_accept: accept,
  });
  if (error) throw new Error(error.message || 'Could not respond to the Circle invitation.');
  return String(data || (accept ? 'accepted' : 'declined'));
}

export async function listSentCircleInvitations(circleId: string, actorProfileId: string): Promise<SentCircleInvitation[]> {
  const { data, error } = await db.rpc('rpc_list_sent_circle_invitations', {
    p_circle_id: circleId,
    p_actor_profile_id: actorProfileId,
  });
  if (error) throw new Error(error.message || 'Could not load sent Circle invitations.');
  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    profileId: String(row.invited_profile_id),
    fullName: String(row.invited_profile_name || 'Betweener member'),
    avatarUrl: row.invited_profile_avatar_url ?? null,
    age: typeof row.invited_profile_age === 'number' ? row.invited_profile_age : null,
    location: row.invited_profile_location ?? null,
    status: String(row.status || 'pending'),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
  }));
}

export async function cancelCircleInvitation(invitationId: string, actorProfileId: string) {
  const { error } = await db.rpc('rpc_cancel_circle_invitation', {
    p_invitation_id: invitationId,
    p_actor_profile_id: actorProfileId,
  });
  if (error) throw new Error(error.message || 'Could not withdraw the Circle invitation.');
}

export async function getMyCircleInvitationCount(profileId: string) {
  const { data, error } = await db.rpc('rpc_get_my_circle_invitation_count', {
    p_profile_id: profileId,
  });
  if (error) throw new Error(error.message || 'Could not load Circle invitations.');
  return Math.max(0, Number(data) || 0);
}

export async function listMyCircleInvitations(profileId: string): Promise<MyCircleInvitation[]> {
  const { data, error } = await db.rpc('rpc_list_my_circle_invitations', {
    p_profile_id: profileId,
  });
  if (error) throw new Error(error.message || 'Could not load Circle invitations.');
  return Promise.all((data ?? []).map(async (row: any) => {
    const circleImagePath = row.circle_image_path ?? null;
    let circleImageUrl = row.circle_image_url ?? null;
    if (!circleImageUrl && circleImagePath) {
      const { data: signed } = await db.storage.from('circle-images').createSignedUrl(circleImagePath, 3600);
      circleImageUrl = signed?.signedUrl ?? null;
    }
    return {
      id: String(row.invitation_id),
      circleId: String(row.circle_id),
      circleName: String(row.circle_name || 'Betweener Circle'),
      circleImageUrl,
      circleImagePath,
      inviterName: String(row.inviter_name || 'A Circle member'),
      message: row.message ?? null,
      expiresAt: String(row.expires_at),
    };
  }));
}
