// @ts-nocheck
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useCircleLive } from '@/features/live/hooks/use-circle-live';

const mockGetCircleLiveSnapshot = jest.fn();
const mockSubscribeCircleLive = jest.fn(() => jest.fn());
const mockReadCircleLiveSnapshotState = jest.fn();
const mockWriteCircleLiveSnapshot = jest.fn(async () => undefined);
let mockCurrentAccountId: string | null = 'account-1';

jest.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    authStatus: mockCurrentAccountId ? 'authenticated' : 'anonymous',
    canPerformAuthenticatedWrites: Boolean(mockCurrentAccountId),
    user: mockCurrentAccountId ? { id: mockCurrentAccountId } : null,
  }),
}));

jest.mock('@/features/live/application/index.ts', () => ({
  liveRepository: {
    getCircleLiveSnapshot: (...args: any[]) => mockGetCircleLiveSnapshot(...args),
    subscribeCircleLive: (...args: any[]) => mockSubscribeCircleLive(...args),
  },
}));

jest.mock('@/lib/offline/circle-live-store', () => ({
  readCircleLiveSnapshotState: (...args: any[]) => mockReadCircleLiveSnapshotState(...args),
  writeCircleLiveSnapshot: (...args: any[]) => mockWriteCircleLiveSnapshot(...args),
}));

const snapshot = {
  circleId: 'circle-1',
  canSchedule: false,
  sessions: [],
  serverNow: '2026-10-14T12:00:00.000Z',
};

describe('useCircleLive', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentAccountId = 'account-1';
    mockGetCircleLiveSnapshot.mockResolvedValue(snapshot);
    mockReadCircleLiveSnapshotState.mockResolvedValue({
      data: null,
      savedAt: null,
      staleAt: null,
      isStale: false,
    });
  });

  it('persists member-only Live data under the authenticated account', async () => {
    const { result } = await renderHook(() => useCircleLive('circle-1', true));

    await waitFor(() => expect(result.current.snapshot).toEqual(snapshot));
    expect(mockWriteCircleLiveSnapshot).toHaveBeenCalledWith('circle-1', 'account-1', snapshot);
  });

  it('falls back only to the current account snapshot', async () => {
    mockGetCircleLiveSnapshot.mockRejectedValue(new Error('Network request failed'));
    mockReadCircleLiveSnapshotState.mockResolvedValue({
      data: snapshot,
      savedAt: Date.now(),
      staleAt: Date.now() + 30_000,
      isStale: false,
    });

    const { result } = await renderHook(() => useCircleLive('circle-1', true));

    await waitFor(() => expect(result.current.snapshot).toEqual(snapshot));
    expect(mockReadCircleLiveSnapshotState).toHaveBeenCalledWith('circle-1', 'account-1');
    expect(result.current.error).toBe('Showing saved Circle Live information.');
  });

  it('clears cached member data immediately when the account changes', async () => {
    const { result, rerender } = await renderHook(() => useCircleLive('circle-1', true));
    await waitFor(() => expect(result.current.snapshot).toEqual(snapshot));

    mockCurrentAccountId = 'account-2';
    mockGetCircleLiveSnapshot.mockImplementation(() => new Promise(() => undefined));
    await act(async () => rerender({}));

    await waitFor(() => expect(result.current.snapshot).toBeNull());
  });
});
