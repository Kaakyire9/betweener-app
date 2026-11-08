import React from 'react';
import { afterEach, expect, it, jest } from '@jest/globals';
import { render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, AppState, Text } from 'react-native';
import { JournalMotionProvider, JournalPulse, useJournalReducedMotion } from '@/features/connect/journal/JournalPulse';
const previousState = AppState.currentState;
afterEach(() => { jest.restoreAllMocks(); AppState.currentState = previousState; });
function Preference() { return <Text>{useJournalReducedMotion() ? 'Reduced' : 'Motion'}</Text>; }
function preferences(reduced: boolean) {
  AppState.currentState = 'active';
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduced);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
}
it('system Reduce Motion prevents the nonessential connection pulse', async () => {
  preferences(true); const timing = jest.spyOn(Animated, 'timing');
  const screen = await render(<JournalMotionProvider><Preference /><JournalPulse id="one" fresh><Text>Call</Text></JournalPulse></JournalMotionProvider>);
  await waitFor(() => expect(screen.getByText('Reduced')).toBeTruthy()); expect(timing).not.toHaveBeenCalled();
});
it('a fresh identity animates once and does not replay when its card remounts', async () => {
  preferences(false); const timing = jest.spyOn(Animated, 'timing').mockImplementation((value: any, config: any) => ({
    start: () => value.setValue(config.toValue), stop: () => {}, reset: () => {},
  }));
  const tree = (visible: boolean) => <JournalMotionProvider><Preference />{visible && <JournalPulse id="one" fresh><Text>Call</Text></JournalPulse>}</JournalMotionProvider>;
  const screen = await render(tree(true)); await waitFor(() => expect(screen.getByText('Motion')).toBeTruthy()); expect(timing).toHaveBeenCalledTimes(1);
  await screen.rerender(tree(false)); await screen.rerender(tree(true)); expect(timing).toHaveBeenCalledTimes(1);
});
