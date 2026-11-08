import React from 'react';
import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { act, cleanup, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, AppState, Text } from 'react-native';
import { AudioCallPortrait } from '@/features/connect/components/AudioCallPortrait';
import { VoiceCallScreen } from '@/features/connect/components/VoiceCallScreen';
import { useCallVisualActivity } from '@/features/connect/hooks/use-call-visual-activity';
import { unverifiedShutdown } from '@/features/connect/media/local-shutdown';
import type { VoiceViewState } from '@/features/connect/voice/voice-types';

jest.mock('expo-image', () => { const React = require('react'); const { View } = require('react-native'); return { Image: (props: object) => React.createElement(View, props) }; });
jest.mock('expo-linear-gradient', () => { const React = require('react'); const { View } = require('react-native'); return { LinearGradient: (props: object) => React.createElement(View, props) }; });
jest.mock('react-native-safe-area-context', () => { const React = require('react'); const { View } = require('react-native'); return { SafeAreaView: (props: object) => React.createElement(View, props) }; });
jest.mock('@expo/vector-icons', () => ({ Ionicons: Object.assign(() => null, { glyphMap: {} }), MaterialCommunityIcons: () => null }));
jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'dark' }));
const peer = { profileId: 'peer-a', name: 'Ama', avatar: 'https://example.com/a.jpg', photos: ['https://example.com/b.jpg', 'https://example.com/c.jpg'] };
const base: VoiceViewState = { localShutdown: unverifiedShutdown(), endBlock: null, phase: 'ACTIVE', peer, session: null,
  incoming: false, muted: false, route: 'earpiece', routes: ['earpiece', 'speaker'], permission: 'granted', error: null, busy: false, durationSeconds: 37, foreground: true };
const handlers = () => ({ onAccept: jest.fn(), onDecline: jest.fn(), onHangup: jest.fn(), onMute: jest.fn(), onRoute: jest.fn(), onDone: jest.fn(), onOpenSettings: jest.fn() });
beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(Animated, 'loop').mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() } as ReturnType<typeof Animated.loop>);
});
afterEach(async () => { await cleanup(); jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });
const tick = async (ms: number) => { await act(async () => { jest.advanceTimersByTime(ms); }); };
const portrait = (props = {}) => <AudioCallPortrait peer={peer} phase="ACTIVE" screenActive motionAllowed {...props} />;

it('keeps ringing static, then offers manual browsing without starting rotation', async () => {
  const screen = await render(portrait({ phase: 'RINGING' }));
  expect(screen.getByLabelText('Ama, photo 1 of 3')).toBeTruthy();
  expect(screen.queryByLabelText('Next profile photo')).toBeNull();
  await screen.rerender(portrait()); await tick(16000);
  expect(screen.getByLabelText('Ama, photo 1 of 3')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Next profile photo'));
  expect(screen.getByLabelText('Ama, photo 2 of 3')).toBeTruthy();
});
it('rotates every eight seconds only after Play, and touching the portrait pauses until resumed', async () => {
  const screen = await render(portrait());
  await fireEvent.press(screen.getByLabelText('Play automatic photos'));
  await tick(7999); expect(screen.getByLabelText('Ama, photo 1 of 3')).toBeTruthy();
  await tick(1); expect(screen.getByLabelText('Ama, photo 2 of 3')).toBeTruthy();
  // PanResponder deliberately does not claim vertical/start gestures. RNTL gates
  // fireEvent.touchStart on that responder decision; exercise the native touch callback.
  await act(async () => screen.getByTestId('call-profile-gesture').props.onTouchStart());
  await tick(16000); expect(screen.getByLabelText('Ama, photo 2 of 3')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Play automatic photos'));
  await tick(8000); expect(screen.getByLabelText('Ama, photo 3 of 3')).toBeTruthy();
});
it.each([{ screenActive: false }, { motionAllowed: false }, { phase: 'RECONNECTING' }, { phase: 'ENDING' }, { phase: 'ENDED' }, { phase: 'FAILED' }])('stops automatic photos when visibility, motion or lifecycle changes: %j', async props => {
  const screen = await render(portrait()); await fireEvent.press(screen.getByLabelText('Play automatic photos'));
  await screen.rerender(portrait(props)); await tick(24000);
  expect(screen.getByLabelText('Ama, photo 1 of 3')).toBeTruthy();
  await screen.rerender(portrait()); await tick(8000);
  expect(screen.getByLabelText('Play automatic photos')).toBeTruthy();
  expect(screen.getByLabelText('Ama, photo 1 of 3')).toBeTruthy();
});
it('gives manual accessibility controls with reduced motion and removes animation transitions', async () => {
  const screen = await render(portrait({ motionAllowed: false }));
  expect(screen.getByLabelText('Play automatic photos')).toBeDisabled();
  await fireEvent.press(screen.getByLabelText('Next profile photo'));
  expect(screen.getByLabelText('Ama, photo 2 of 3').props.transition).toBe(0);
  expect(Animated.loop).not.toHaveBeenCalled();
});
it('falls through failed images to a safe avatar/initial and hides single-photo controls', async () => {
  const screen = await render(portrait({ peer: { ...peer, photos: ['file:///private.jpg'] } }));
  expect(screen.queryByLabelText('Next profile photo')).toBeNull();
  await fireEvent(screen.getByLabelText('Participant avatar'), 'error');
  expect(screen.getByLabelText('Ama initials')).toBeTruthy();
});
it('resets the selected photo and autoplay when the admitted participant changes', async () => {
  const interval = jest.spyOn(globalThis, 'setInterval'), clear = jest.spyOn(globalThis, 'clearInterval');
  const screen = await render(portrait()); await fireEvent.press(screen.getByLabelText('Next profile photo'));
  await fireEvent.press(screen.getByLabelText('Play automatic photos'));
  await screen.rerender(portrait({ peer: { ...peer, profileId: 'peer-b', name: 'Kojo', avatar: 'https://example.com/d.jpg', photos: ['https://example.com/e.jpg'] } }));
  expect(screen.getByLabelText('Kojo, photo 1 of 2')).toBeTruthy();
  await tick(8000); expect(screen.getByLabelText('Kojo, photo 1 of 2')).toBeTruthy();
  await screen.unmount();
  for (let i = 0; i < interval.mock.calls.length; i++) {
    if (interval.mock.calls[i][1] === 8000) expect(clear).toHaveBeenCalledWith(interval.mock.results[i].value as ReturnType<typeof setInterval>);
  }
});
it('reuses the custom wallpaper, retains local mute controls and fences terminal cleanup', async () => {
  const callbacks = handlers(); const screen = await render(<VoiceCallScreen state={base} {...callbacks} />);
  expect(screen.getByTestId('chat-background-artwork-dark', { includeHiddenElements: true })).toBeTruthy();
  expect(screen.queryByTestId('chat-background-artwork-dark')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Mute')); expect(callbacks.onMute).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText('Add Participant')).toBeNull();
  await screen.rerender(<VoiceCallScreen state={{ ...base, phase: 'ENDED', muted: true, encryption: { required: true, sdkConfirmed: false, identityVerified: false } }} canDismiss={false} {...callbacks} />);
  expect(screen.queryByText('Securing your call…')).toBeNull();
  expect(screen.queryByLabelText('Unmute')).toBeNull();
  expect(screen.queryByLabelText('Next profile photo')).toBeNull();
  expect(screen.getByLabelText('Done with voice call')).toBeDisabled();
  await fireEvent.press(screen.getByLabelText('Done with voice call')); expect(callbacks.onDone).not.toHaveBeenCalled();
});
it('fences visual activity on actual background and accessibility events, independent of call state', async () => {
  let appChanged: (value: string) => void;
  let motionChanged: (value: boolean) => void;
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, fn) => { appChanged = fn; return { remove }; });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((name: string, fn: (v: boolean) => void) => { if (name === 'reduceMotionChanged') motionChanged = fn; return { remove }; }) as unknown as typeof AccessibilityInfo.addEventListener);
  function Harness() { const value = useCallVisualActivity(true); return <Text>{JSON.stringify(value)}</Text>; }
  const screen = await render(<Harness />);
  await act(async () => appChanged('active'));
  expect(screen.getByText('{"screenActive":true,"motionAllowed":true}')).toBeTruthy();
  await act(async () => appChanged('inactive'));
  expect(screen.getByText('{"screenActive":false,"motionAllowed":true}')).toBeTruthy();
  await act(async () => motionChanged(true));
  expect(screen.getByText('{"screenActive":false,"motionAllowed":false}')).toBeTruthy();
  await screen.unmount(); expect(remove).toHaveBeenCalledTimes(3);
});
