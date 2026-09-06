// @ts-nocheck

import {
  checkProfileHandleAvailability,
  getMyProfileHandleState,
  normalizeProfileHandleDraft,
  updateMyProfileHandle,
  validateProfileHandleFormat,
} from '@/lib/profile/profile-handle-service';

const mockRpc = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

describe('profile handle service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes handles and rejects malformed input before calling the server', async () => {
    expect(normalizeProfileHandleDraft('  @@Akosua.25 ')).toBe('akosua.25');
    expect(validateProfileHandleFormat('ab')).toBe('Use at least 3 characters.');
    expect(validateProfileHandleFormat('1234')).toBe('Include at least one letter.');
    expect(validateProfileHandleFormat('akosua__25')).toBe(
      'Use letters, numbers, single periods or underscores.',
    );

    await expect(checkProfileHandleAvailability('1234')).resolves.toMatchObject({
      valid: false,
      available: false,
      reason: 'letters_required',
    });
    await expect(checkProfileHandleAvailability('a'.repeat(25))).resolves.toMatchObject({
      reason: 'too_long',
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('loads, checks and updates through the controlled RPC boundary', async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: {
          username: null,
          usernameSearchable: false,
          claimedAt: null,
          changedAt: null,
          nextChangeAt: null,
          canRename: true,
          cooldownDaysRemaining: 0,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          username: 'akosua',
          valid: true,
          available: true,
          ownedByViewer: false,
          reason: null,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          username: 'akosua',
          usernameSearchable: true,
          claimedAt: '2026-09-06T12:00:00.000Z',
          changedAt: '2026-09-06T12:00:00.000Z',
          nextChangeAt: '2026-10-06T12:00:00.000Z',
          canRename: false,
          cooldownDaysRemaining: 30,
        },
        error: null,
      });

    await expect(getMyProfileHandleState()).resolves.toMatchObject({ username: null, canRename: true });
    await expect(checkProfileHandleAvailability('@Akosua')).resolves.toMatchObject({
      username: 'akosua',
      available: true,
    });
    await expect(updateMyProfileHandle('@Akosua', true)).resolves.toMatchObject({
      username: 'akosua',
      usernameSearchable: true,
      canRename: false,
    });

    expect(mockRpc).toHaveBeenNthCalledWith(1, 'rpc_get_my_profile_handle_state');
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'rpc_check_profile_username_availability', {
      p_username: 'akosua',
    });
    expect(mockRpc).toHaveBeenNthCalledWith(3, 'rpc_update_my_profile_username', {
      p_username: 'akosua',
      p_searchable: true,
    });
  });
});
