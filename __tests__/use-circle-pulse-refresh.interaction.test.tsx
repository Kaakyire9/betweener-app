// @ts-nocheck
import React from 'react';
import { AppState, View } from 'react-native';
import { act, render } from '@testing-library/react-native';
import {
  CIRCLE_PULSE_FOREGROUND_MIN_GAP_MS,
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

  it('reloads stale data on foreground without polling and cleans up on unmount', async () => {
    const reload = jest.fn();
    const remove = jest.fn();
    let onAppStateChange: ((state: string) => void) | null = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      onAppStateChange = listener as (state: string) => void;
      return { remove } as any;
    });

    const { unmount } = await render(<RefreshHarness enabled reload={reload} />);

    await act(() => {
      jest.advanceTimersByTime(CIRCLE_PULSE_FOREGROUND_MIN_GAP_MS);
    });
    expect(reload).not.toHaveBeenCalled();

    await act(() => {
      onAppStateChange?.('active');
    });
    expect(reload).toHaveBeenCalledTimes(1);

    await unmount();
    expect(remove).toHaveBeenCalledTimes(1);

    await act(() => {
      jest.advanceTimersByTime(CIRCLE_PULSE_FOREGROUND_MIN_GAP_MS);
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe while refresh is disabled', async () => {
    const reload = jest.fn();

    await render(<RefreshHarness enabled={false} reload={reload} />);

    await act(() => {
      jest.advanceTimersByTime(CIRCLE_PULSE_FOREGROUND_MIN_GAP_MS);
    });
    expect(reload).not.toHaveBeenCalled();
  });
});
