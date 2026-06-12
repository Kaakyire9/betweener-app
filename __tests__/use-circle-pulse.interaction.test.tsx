// @ts-nocheck
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useCirclePulse } from '@/lib/circles/pulse/use-circle-pulse';

const mockReadCirclePulseSnapshotState = jest.fn();
const mockWriteCirclePulseSnapshot = jest.fn(async () => undefined);
const mockFetchCirclePulseItems = jest.fn();
const mockFetchCirclePulseItemSnapshot = jest.fn();
const mockFetchNetInfo = jest.fn();

jest.mock('@/lib/offline/circle-pulse-store', () => ({
  readCirclePulseSnapshotState: (...args: any[]) => mockReadCirclePulseSnapshotState(...args),
  writeCirclePulseSnapshot: (...args: any[]) => mockWriteCirclePulseSnapshot(...args),
}));

jest.mock('@/lib/circles/pulse/circle-pulse-service', () => ({
  fetchCirclePulseItems: (...args: any[]) => mockFetchCirclePulseItems(...args),
  fetchCirclePulseItemSnapshot: (...args: any[]) => mockFetchCirclePulseItemSnapshot(...args),
}));

jest.mock('@/lib/circles/pulse/use-circle-pulse-refresh', () => ({
  useCirclePulseRefresh: jest.fn(),
}));

jest.mock('@react-native-community/netinfo', () => ({
  fetch: (...args: any[]) => mockFetchNetInfo(...args),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    channel: jest.fn(() => {
      const chain: any = {
        on: jest.fn(() => chain),
        subscribe: jest.fn(() => chain),
      };
      return chain;
    }),
    removeChannel: jest.fn(),
  },
}));

const liveItem = {
  id: 'pulse-live',
  circleId: 'circle-1',
  type: 'prompt',
  title: 'Live pulse',
  subtitle: null,
  body: 'Live data',
  imageUrl: null,
  mediaUrl: null,
  mediaType: null,
  promptId: 'prompt-1',
  gatheringId: null,
  momentId: null,
  loveSeatId: null,
  featuredProfileId: null,
  featuredProfileName: null,
  featuredProfileAge: null,
  featuredProfileAvatarUrl: null,
  featuredProfileLocation: null,
  featuredProfileBadge: null,
  loveSeatQuote: null,
  welcomeProfiles: [],
  status: 'active',
  priority: 1,
  startsAt: null,
  expiresAt: null,
  commentCount: 0,
  discussionCta: null,
  discussionSummary: null,
  gatheringStartsAt: null,
  gatheringCity: null,
  gatheringType: null,
  gatheringPresentationMode: null,
  gatheringSeatContext: null,
  gatheringHostCreatedForMember: false,
  gatheringIsPartnerVenue: false,
  gatheringSafeFirstDateSpace: false,
  gatheringAttendeeCount: 0,
  sourceAvailable: true,
};

const savedItem = {
  ...liveItem,
  id: 'pulse-saved',
  title: 'Saved pulse',
  body: 'Saved data',
};

describe('useCirclePulse', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchNetInfo.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    mockReadCirclePulseSnapshotState.mockResolvedValue({
      data: null,
      savedAt: null,
      staleAt: null,
      isStale: false,
    });
    mockFetchCirclePulseItemSnapshot.mockResolvedValue(null);
  });

  it('keeps live Pulse data on screen when a later refresh fails', async () => {
    mockFetchCirclePulseItems.mockResolvedValueOnce([liveItem]);
    const { result } = renderHook(() =>
      useCirclePulse({ circleId: 'circle-1', enabled: true, viewerProfileId: 'profile-1' }),
    );

    await waitFor(() => expect(result.current.items[0]?.id).toBe('pulse-live'));
    await waitFor(() => expect(mockWriteCirclePulseSnapshot).toHaveBeenCalledWith('circle-1', 'profile-1', [liveItem]));

    mockFetchCirclePulseItems.mockRejectedValueOnce(new Error('Network request failed'));

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.items[0]?.id).toBe('pulse-live');
    expect(result.current.error).toBeNull();
  });

  it('does not persist an empty snapshot before Pulse hydration resolves', async () => {
    mockFetchCirclePulseItems.mockImplementation(() => new Promise(() => undefined));

    renderHook(() =>
      useCirclePulse({ circleId: 'circle-1', enabled: true, viewerProfileId: 'profile-1' }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockWriteCirclePulseSnapshot).not.toHaveBeenCalled();
  });

  it('falls back to the saved Pulse when offline and there is no live data yet', async () => {
    mockFetchNetInfo.mockResolvedValue({ isConnected: false, isInternetReachable: false });
    mockReadCirclePulseSnapshotState.mockResolvedValue({
      data: [savedItem],
      savedAt: Date.now(),
      staleAt: Date.now() + 60_000,
      isStale: false,
    });

    const { result } = renderHook(() =>
      useCirclePulse({ circleId: 'circle-1', enabled: true, viewerProfileId: 'profile-1' }),
    );

    await waitFor(() => expect(result.current.items[0]?.id).toBe('pulse-saved'));
    expect(result.current.error).toBe('Showing saved Circle Pulse.');
  });
});
