// @ts-nocheck
import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useCirclePulseLiveDiscussion } from '@/lib/circles/pulse/use-circle-pulse-live-discussion';

const listeners = new Map<string, (payload?: any) => void>();
let subscribeCallback: ((status: string) => void) | null = null;
let presenceState: Record<string, any[]> = {};

const mockChannel: any = {
  state: 'closed',
  socket: { isConnected: () => true },
  on: jest.fn((type: string, filter: { event: string }, callback: (payload?: any) => void) => {
    listeners.set(`${type}:${filter.event}`, callback);
    return mockChannel;
  }),
  subscribe: jest.fn((callback: (status: string) => void) => {
    subscribeCallback = callback;
    return mockChannel;
  }),
  presenceState: jest.fn(() => presenceState),
  track: jest.fn(async () => undefined),
  untrack: jest.fn(async () => undefined),
  send: jest.fn(async () => undefined),
};

const mockRemoveChannel = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    channel: jest.fn(() => mockChannel),
    removeChannel: (...args: any[]) => mockRemoveChannel(...args),
  },
}));

describe('useCirclePulseLiveDiscussion', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-01T12:00:00.000Z'));
    jest.clearAllMocks();
    listeners.clear();
    subscribeCallback = null;
    presenceState = {};
    mockChannel.state = 'closed';
    AppState.currentState = 'active';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('tracks live viewers and broadcasts typing only after the room joins', async () => {
    const onDiscussionChanged = jest.fn();
    const { result, unmount } = await renderHook(() =>
      useCirclePulseLiveDiscussion({
        itemId: 'pulse-1',
        actorProfileId: 'profile-me',
        actorDisplayName: 'Ada',
        enabled: true,
        onDiscussionChanged,
      }),
    );

    await act(() => {
      result.current.notifyTyping(true);
    });
    expect(mockChannel.send).not.toHaveBeenCalled();

    await act(() => {
      mockChannel.state = 'joined';
      subscribeCallback?.('SUBSCRIBED');
    });
    expect(mockChannel.track).toHaveBeenCalled();

    await act(() => {
      presenceState = {
        'profile-me': [{ profileId: 'profile-me', typing: false }],
        'profile-other': [{ profileId: 'profile-other', typing: false }],
      };
      listeners.get('presence:sync')?.();
    });
    expect(result.current.activeViewerCount).toBe(2);

    await act(() => {
      listeners.get('broadcast:typing')?.({
        payload: { profileId: 'profile-other', displayName: 'Ama', typing: true },
      });
    });
    expect(result.current.typingLabel).toBe('Ama is typing');

    await act(() => {
      result.current.notifyTyping(false);
      result.current.notifyTyping(true);
      result.current.announceDiscussionChanged();
    });
    expect(mockChannel.send).toHaveBeenCalledWith(expect.objectContaining({ event: 'typing' }));
    expect(mockChannel.send).toHaveBeenCalledWith(expect.objectContaining({ event: 'discussion_changed' }));

    const typingSendCount = mockChannel.send.mock.calls.filter(([payload]) => payload.event === 'typing').length;
    await act(() => {
      jest.advanceTimersByTime(800);
      result.current.notifyTyping(true);
    });
    expect(mockChannel.send.mock.calls.filter(([payload]) => payload.event === 'typing')).toHaveLength(typingSendCount + 1);

    await act(() => {
      listeners.get('broadcast:discussion_changed')?.({
        payload: { profileId: 'profile-other' },
      });
    });
    expect(onDiscussionChanged).toHaveBeenCalledTimes(1);

    await unmount();
    expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
  });
});
