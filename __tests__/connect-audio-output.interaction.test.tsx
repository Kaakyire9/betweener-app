import React from 'react';
import { afterEach, expect, it, jest } from '@jest/globals';
import { cleanup, fireEvent, render } from '@testing-library/react-native';
import { VoiceCallControls } from '@/features/connect/components/VoiceCallControls';
import { unverifiedShutdown } from '@/features/connect/media/local-shutdown';
import type { VoiceViewState } from '@/features/connect/voice/voice-types';

jest.mock('expo-linear-gradient', () => {
  const React = require('react'); const { View } = require('react-native');
  return { LinearGradient: (props: object) => React.createElement(View, props) };
});
jest.mock('@expo/vector-icons', () => {
  const React = require('react'); const { Text } = require('react-native');
  return { Ionicons: Object.assign(({ name }: { name: string }) => React.createElement(Text, { testID: `call-icon-${name}` }), { glyphMap: {} }) };
});

const base: VoiceViewState = {
  localShutdown: unverifiedShutdown(), endBlock: null, phase: 'ACTIVE', session: null, peer: null,
  incoming: false, muted: false, route: 'bluetooth', routes: ['earpiece', 'speaker', 'bluetooth', 'wired'],
  permission: 'granted', error: null, busy: false, durationSeconds: 20, foreground: true, audioSetupStage: 'ready',
};
const callbacks = { onAccept: jest.fn(), onDecline: jest.fn(), onHangup: jest.fn(), onMute: jest.fn(), onRoute: jest.fn() };
afterEach(async () => { await cleanup(); jest.clearAllMocks(); });

it.each([false, true])('shows the Bluetooth output independently of mute in compact=%s controls', async compact => {
  const screen = await render(<VoiceCallControls state={base} compact={compact} {...callbacks} />);
  expect(screen.getByLabelText('Bluetooth')).toBeTruthy();
  expect(screen.getByTestId('call-icon-bluetooth-outline')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Mute'));
  expect(callbacks.onMute).toHaveBeenCalledTimes(1);
  await screen.rerender(<VoiceCallControls state={{ ...base, muted: true }} compact={compact} {...callbacks} />);
  expect(screen.getByLabelText('Unmute')).toBeTruthy();
  expect(screen.getByTestId('call-icon-mic-off-outline')).toBeTruthy();
  expect(screen.getByTestId('call-icon-bluetooth-outline')).toBeTruthy();
});

it('updates the icon and checked route when the OS changes output, including wired headphones', async () => {
  const screen = await render(<VoiceCallControls state={base} {...callbacks} />);
  await fireEvent.press(screen.getByLabelText('Bluetooth'));
  expect(screen.getByLabelText('Use Bluetooth').props.accessibilityState.checked).toBe(true);
  await screen.rerender(<VoiceCallControls state={{ ...base, route: 'earpiece' }} {...callbacks} />);
  expect(screen.getByLabelText('Phone')).toBeTruthy();
  expect(screen.getByLabelText('Use Phone').props.accessibilityState.checked).toBe(true);
  expect(screen.getByLabelText('Use Bluetooth').props.accessibilityState.checked).toBe(false);
  expect(screen.getByTestId('call-icon-phone-portrait-outline')).toBeTruthy();
  await screen.rerender(<VoiceCallControls state={{ ...base, route: 'wired' }} {...callbacks} />);
  expect(screen.getByLabelText('Headphones')).toBeTruthy();
  expect(screen.getByTestId('call-icon-headset-outline')).toBeTruthy();
});

it('shows a generic output control when Bluetooth is available but current selection is unknown', async () => {
  const screen = await render(<VoiceCallControls state={{ ...base, route: null }} {...callbacks} />);
  expect(screen.getByLabelText('Audio output')).toBeTruthy();
  expect(screen.queryByTestId('call-icon-bluetooth-outline')).toBeNull();
  expect(screen.getByLabelText('Mute')).toBeTruthy();
});
