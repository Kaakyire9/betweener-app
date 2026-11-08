import React, { useSyncExternalStore } from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { VoiceCallScreen } from '@/features/connect/components/VoiceCallScreen';
import { createVoicePreview } from '@/features/connect/voice/voice-preview';
import type { VoiceViewState } from '@/features/connect/voice/voice-types';
import { unverifiedShutdown } from '@/features/connect/media/local-shutdown';

jest.mock('expo-image', () => {
  const React = require('react'); const { View } = require('react-native');
  return { Image: (props: Record<string, unknown>) => React.createElement(View, props) };
});
jest.mock('expo-linear-gradient', () => {
  const React = require('react'); const { View } = require('react-native');
  return { LinearGradient: (props: Record<string, unknown>) => React.createElement(View, props) };
});
jest.mock('react-native-safe-area-context', () => {
  const React = require('react'); const { View } = require('react-native');
  return { SafeAreaView: (props: Record<string, unknown>) => React.createElement(View, props) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: Object.assign(() => null, { glyphMap: {} }), MaterialCommunityIcons: () => null }));

const base: VoiceViewState = { localShutdown: unverifiedShutdown(), endBlock: null, phase: 'RINGING', session: null, peer: { profileId: 'peer', name: 'Alex', avatar: null },
  incoming: true, muted: true, route: 'earpiece', routes: [], permission: null, error: null, busy: false,
  durationSeconds: null, foreground: true };
const handlers = () => ({ onAccept: jest.fn(), onDecline: jest.fn(), onHangup: jest.fn(), onMute: jest.fn(), onRoute: jest.fn(), onDone: jest.fn(), onOpenSettings: jest.fn() });

it.each([
  ['unavailable', 'Checking audio delivery'], ['awaiting', 'Waiting for audio packets'],
  ['receiving', 'Receiving audio packets'], ['stale', 'Audio statistics are not current'],
] as const)('shows %s media evidence without claiming audible output', async (reception, message) => {
  const screen = await render(<VoiceCallScreen state={{ ...base, incoming: false, phase: 'ACTIVE', audioHealth: {
    reception, sending: null, jitterMs: null, roundTripMs: null, receivedPackets: null, lostPackets: null, audibleOutput: 'not_verified',
  } }} {...handlers()} />);
  expect(screen.getByText(message)).toBeTruthy();
  expect(screen.queryByText('Audio connected')).toBeNull();
});
describe('Connect voice presentation', () => {
  it('shows a named incoming voice invitation with separate Accept and Decline actions', async () => {
    const callbacks = handlers(); const screen = await render(<VoiceCallScreen state={base} {...callbacks} />);
    expect(screen.getByText('Alex')).toBeTruthy(); expect(screen.getByText('Incoming voice call')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Accept')); await fireEvent.press(screen.getByLabelText('Decline'));
    expect(callbacks.onAccept).toHaveBeenCalledTimes(1); expect(callbacks.onDecline).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Mute')).toBeNull();
  });
  it('outgoing ringing permits cancellation without showing a connected timer', async () => {
    const callbacks = handlers(); const screen = await render(<VoiceCallScreen state={{ ...base, incoming: false }} {...callbacks} />);
    await fireEvent.press(screen.getByLabelText('Cancel')); expect(callbacks.onHangup).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText(/Connected duration/)).toBeNull(); expect(screen.queryByLabelText('Accept')).toBeNull();
  });
  it('never displays connected duration while audio is still connecting', async () => {
    const screen = await render(<VoiceCallScreen state={{ ...base, phase: 'CONNECTING', durationSeconds: 45 }} {...handlers()} />);
    expect(screen.queryByLabelText(/Connected duration/)).toBeNull(); expect(screen.getByText('Connecting audio…')).toBeTruthy();
  });
  it('active controls expose mute, hang-up and only available audio outputs', async () => {
    const callbacks = handlers(); const screen = await render(<VoiceCallScreen state={{ ...base, incoming: false, phase: 'ACTIVE', muted: false,
      routes: ['earpiece', 'speaker', 'bluetooth'], durationSeconds: 65 }} {...callbacks} />);
    expect(screen.getByLabelText('Connected duration 01:05')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Mute')); expect(callbacks.onMute).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByLabelText('Phone')); await fireEvent.press(screen.getByLabelText('Use Bluetooth'));
    expect(callbacks.onRoute).toHaveBeenCalledWith('bluetooth'); expect(screen.queryByLabelText('Use Headphones')).toBeNull();
    await fireEvent.press(screen.getByLabelText('End call')); expect(callbacks.onHangup).toHaveBeenCalledTimes(1);
  });
  it('output changes wait for initial audio setup while End remains available', async () => {
    const callbacks = handlers();
    const connecting: VoiceViewState = { ...base, incoming: false, phase: 'CONNECTING', routes: ['earpiece', 'speaker'], audioSetupStage: 'audio_output' };
    const screen = await render(<VoiceCallScreen state={connecting} {...callbacks} />);
    expect(screen.getByLabelText('Phone')).toBeDisabled();
    await fireEvent.press(screen.getByLabelText('Phone')); expect(screen.queryByLabelText('Available audio outputs')).toBeNull();
    expect(screen.getByLabelText('End call')).toBeEnabled();
    await screen.rerender(<VoiceCallScreen state={{ ...connecting, audioSetupStage: 'ready' }} {...callbacks} />);
    expect(screen.getByLabelText('Phone')).toBeEnabled();
    await fireEvent.press(screen.getByLabelText('Phone')); await fireEvent.press(screen.getByLabelText('Use Speaker'));
    expect(callbacks.onRoute).toHaveBeenCalledWith('speaker');
  });
  it('permanent microphone denial offers Settings without camera controls', async () => {
    const callbacks = handlers(); const screen = await render(<VoiceCallScreen state={{ ...base, permission: 'blocked', error: 'Allow microphone access in Settings to join a voice call.' }} {...callbacks} />);
    await fireEvent.press(screen.getByLabelText('Open microphone settings')); expect(callbacks.onOpenSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText(/camera/i)).toBeNull();
  });
  it('terminal calls remove all capture/answer controls and provide Done', async () => {
    const callbacks = handlers(); const screen = await render(<VoiceCallScreen state={{ ...base, phase: 'ENDED' }} {...callbacks} />);
    expect(screen.getByText('Call ended')).toBeTruthy(); expect(screen.queryByLabelText('Accept')).toBeNull(); expect(screen.queryByLabelText('Unmute')).toBeNull();
    await fireEvent.press(screen.getByText('Done')); expect(callbacks.onDone).toHaveBeenCalledTimes(1);
  });
  it('ordinary call completion keeps audit facts in optional details', async () => {
    const screen = await render(<VoiceCallScreen state={{ ...base, phase: 'ENDED', endStatus: 'terminal' }} {...handlers()} />);
    expect(screen.getByText('Call ended')).toBeTruthy();
    expect(screen.queryByText('Remote media shutdown has not been verified.')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Call details'));
    expect(screen.getByText('Remote media shutdown has not been verified.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Call details'));
    expect(screen.queryByLabelText('Call safety status')).toBeNull();
  });
  it('failed cleanup stays visible while optional native diagnostic details are collapsed', async () => {
    const screen = await render(<VoiceCallScreen state={{ ...base, phase: 'FAILED', endStatus: 'terminal',
      localShutdown: { ...unverifiedShutdown(), resourceRelease: 'failed' },
      audioSetupFailure: { stage: 'native_join', code: 'native_build_incompatible', missingNativeApis: ['WebRTCModule.createCallFactory'] },
    }} canDismiss={false} {...handlers()} />);
    expect(screen.getByText('Audio cleanup needs attention. View Call details before calling again.')).toBeTruthy();
    expect(screen.getByLabelText('Done with voice call')).toBeDisabled();
    await fireEvent.press(screen.getByLabelText('Call details'));
    expect(screen.getByText('Diagnostic code: native_build_incompatible')).toBeTruthy();
    expect(screen.getByText('Missing native API: WebRTCModule.createCallFactory')).toBeTruthy();
  });
  it('preview drives accept, confirmed connection, mute and remote termination through the controller', async () => {
    const preview = createVoicePreview(); await preview.incoming(); const controller = preview.controller;
    function Harness() {
      const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
      return <VoiceCallScreen state={state} onAccept={() => { void controller.accept(); }} onDecline={() => { void controller.decline(); }}
        onHangup={() => { void controller.hangup(); }} onMute={() => { void controller.toggleMute(); }}
        onRoute={(route) => { void controller.selectRoute(route); }} onDone={() => controller.reset()} onOpenSettings={() => {}} />;
    }
    const screen = await render(<Harness />); await act(async () => { await controller.accept(); });
    expect(screen.getByText('Connecting audio…')).toBeTruthy(); expect(screen.queryByLabelText(/Connected duration/)).toBeNull();
    await act(async () => { await preview.connect(); }); expect(screen.getByText('Connected')).toBeTruthy();
    await act(async () => { await controller.toggleMute(); }); expect(screen.getByLabelText('Unmute')).toBeTruthy();
    await act(async () => { await preview.remoteEnd(); }); expect(screen.getByText('Call ended')).toBeTruthy();
    await controller.dispose();
  });
});
