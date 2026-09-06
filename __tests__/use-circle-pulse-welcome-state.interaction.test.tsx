// @ts-nocheck
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useCirclePulseWelcomeState } from '@/lib/circles/pulse/use-circle-pulse-welcome-state';

const mockFetchStates = jest.fn();
const mockRecordEvent = jest.fn();

jest.mock('@/lib/circles/pulse/circle-pulse-service', () => ({
  fetchCirclePulseWelcomeViewStates: (...args: any[]) => mockFetchStates(...args),
  recordCirclePulseWelcomeEvent: (...args: any[]) => mockRecordEvent(...args),
}));

jest.mock('@/lib/telemetry/logger', () => ({
  logger: { warn: jest.fn() },
}));

describe('useCirclePulseWelcomeState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchStates.mockResolvedValue([
      { profileId: 'profile-seen', firstSeenAt: '2026-09-05T12:00:00.000Z' },
    ]);
    mockRecordEvent.mockResolvedValue(1);
  });

  it('loads prior exposure and records only the visible constellation members', async () => {
    const profileIds = ['profile-seen', 'profile-2', 'profile-3', 'profile-4', 'profile-5', 'profile-6'];
    const { result } = await renderHook(() => useCirclePulseWelcomeState({
      circleId: 'circle-1',
      viewerProfileId: 'viewer-1',
      profileIds,
      enabled: true,
    }));

    await waitFor(() => expect(result.current.seenProfileIds.has('profile-seen')).toBe(true));
    await waitFor(() => expect(mockRecordEvent).toHaveBeenCalledWith(
      'circle-1',
      'viewer-1',
      profileIds.slice(0, 5),
      'impression',
    ));
  });

  it('updates the current session after the gallery is deliberately opened', async () => {
    const { result } = await renderHook(() => useCirclePulseWelcomeState({
      circleId: 'circle-1',
      viewerProfileId: 'viewer-1',
      profileIds: ['profile-2', 'profile-3'],
      enabled: true,
    }));

    await waitFor(() => expect(mockFetchStates).toHaveBeenCalled());
    await act(async () => {
      await result.current.recordEvent(['profile-2', 'profile-3'], 'gallery_opened');
    });

    expect(result.current.seenProfileIds.has('profile-2')).toBe(true);
    expect(result.current.seenProfileIds.has('profile-3')).toBe(true);
  });
});
