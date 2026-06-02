// @ts-nocheck
import React from 'react';
import { AppState, View } from 'react-native';
import { act, render } from '@testing-library/react-native';
import {
  CIRCLE_PULSE_REFRESH_INTERVAL_MS,
  useCirclePulseRefresh,
} from '@/lib/circles/pulse/use-circle-pulse-refresh';

function RefreshHarness({ enabled, reload }: { enabled: boolean; reload: () => void }) {
  useCirclePulseRefresh({ enabled, reload });
  return <View />;
}

describe('useCirclePulseRefresh', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('refreshes while active, reloads on foreground, and cleans up on unmount', () => {
    const reload = jest.fn();
    const remove = jest.fn();
    let onAppStateChange: ((state: string) => void) | null = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      onAppStateChange = listener as (state: string) => void;
      return { remove } as any;
    });

    const { unmount } = render(<RefreshHarness enabled reload={reload} />);

    act(() => {
      jest.advanceTimersByTime(CIRCLE_PULSE_REFRESH_INTERVAL_MS);
    });
    expect(reload).toHaveBeenCalledTimes(1);

    act(() => {
      onAppStateChange?.('active');
    });
    expect(reload).toHaveBeenCalledTimes(2);

    unmount();
    expect(remove).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(CIRCLE_PULSE_REFRESH_INTERVAL_MS);
    });
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('does not subscribe while refresh is disabled', () => {
    const reload = jest.fn();

    render(<RefreshHarness enabled={false} reload={reload} />);

    act(() => {
      jest.advanceTimersByTime(CIRCLE_PULSE_REFRESH_INTERVAL_MS);
    });
    expect(reload).not.toHaveBeenCalled();
  });
});
