// @ts-nocheck
import { searchCircleInviteCandidates } from '@/lib/circles/circle-invitations';

const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

const candidateRow = {
  profile_id: 'profile-akosua',
  full_name: 'Akosua',
  username: '@akosua',
  avatar_url: null,
  age: 25,
  location: 'Bristol',
  country: 'United Kingdom',
  interests: ['Culture'],
};

describe('Circle invitation member search', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses the username-aware contract and normalizes the displayed handle', async () => {
    mockRpc.mockResolvedValueOnce({ data: [candidateRow], error: null });

    const candidates = await searchCircleInviteCandidates({
      circleId: 'circle-1',
      actorProfileId: 'profile-host',
      search: '@akosua',
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'rpc_search_circle_invite_candidates_v2',
      expect.objectContaining({ p_search: '@akosua' }),
    );
    expect(candidates[0]).toEqual(expect.objectContaining({ username: 'akosua' }));
  });

  it('keeps invitations available while the v2 migration is rolling out', async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST202', message: 'Function is not in the schema cache' },
      })
      .mockResolvedValueOnce({
        data: [{ ...candidateRow, username: undefined }],
        error: null,
      });

    const candidates = await searchCircleInviteCandidates({
      circleId: 'circle-1',
      actorProfileId: 'profile-host',
    });

    expect(mockRpc.mock.calls.map(([functionName]) => functionName)).toEqual([
      'rpc_search_circle_invite_candidates_v2',
      'rpc_search_circle_invite_candidates',
    ]);
    expect(candidates[0].username).toBeNull();
  });
});
