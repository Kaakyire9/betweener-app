import React from 'react';
import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import ConnectVoiceRoute from '@/app/connect/voice';
import { ConnectProductProvider, useConnectProduct } from '@/features/connect/components/ConnectProductProvider';
import { VoiceCallLobby } from '@/features/connect/components/VoiceCallLobby';
import { VoiceCallScreen } from '@/features/connect/components/VoiceCallScreen';
import { VideoCallPreparation } from '@/features/connect/components/VideoCallPreparation';
import { ConnectCallEntry } from '@/features/connect/components/ConnectCallEntry';
import { ConnectIncomingNotice } from '@/features/connect/components/ConnectIncomingNotice';
import { useAuth } from '@/lib/auth-context';
import { ConnectNativeBuildError } from '@/features/connect/media/native-runtime-contract';
const { fixture, id, settle } = require('./fixtures/connect-product-fixture.cjs');

const mockPush = jest.fn(), mockBack = jest.fn();
let mockParams: Record<string, unknown> = {};
let mockPathname = '/connect/voice';
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: mockBack, canGoBack: () => true, replace: mockBack }),
  useLocalSearchParams: () => mockParams, usePathname: () => mockPathname,
  useFocusEffect: (fn: () => void) => { const React = require('react'); React.useEffect(fn, [fn]); },
}));
jest.mock('@/lib/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('@/config/app-identity', () => ({ APP_IDENTITY: { variant: 'staging', bundleIdentifier: 'com.aduboffour.betweener.staging' } }));
jest.mock('expo-application', () => ({ applicationId: 'com.aduboffour.betweener.staging' }));
jest.mock('@/features/connect/components/ConnectProductProvider', () => ({
  ...jest.requireActual<typeof import('@/features/connect/components/ConnectProductProvider')>('@/features/connect/components/ConnectProductProvider'), useConnectProduct: jest.fn(),
}));
jest.mock('@/features/connect/config/connect-feature-flags', () => ({ connectFeatureFlags: { nativeSafetyOwner: true, endCallAndBlock: true } }));
jest.mock('expo-image', () => { const React = require('react'); const { View } = require('react-native'); return { Image: (props: object) => React.createElement(View, props) }; });
jest.mock('expo-linear-gradient', () => { const React = require('react'); const { View } = require('react-native'); return { LinearGradient: (props: object) => React.createElement(View, props) }; });
jest.mock('react-native-safe-area-context', () => { const React = require('react'); const { View } = require('react-native'); return { SafeAreaView: (props: object) => React.createElement(View, props), useSafeAreaInsets: () => ({ top: 0 }) }; });
jest.mock('@expo/vector-icons', () => ({ Ionicons: Object.assign(() => null, { glyphMap: {} }) }));
const context = jest.mocked(useConnectProduct);
beforeEach(() => { jest.clearAllMocks(); mockParams = {}; mockPathname = '/connect/voice'; context.mockReturnValue({ ui: false, status: 'disabled', product: null }); });
const peer = { profileId: id(3), name: 'Ama', avatar: null };

describe('Connect product integration', () => {
  it('default-off root host renders children without reading Auth or loading native services', async () => {
    const screen = await render(<ConnectProductProvider><Text>Application content</Text></ConnectProductProvider>);
    expect(screen.getByText('Application content')).toBeTruthy(); expect(useAuth).not.toHaveBeenCalled();
  });
  it('disabled call route performs no bootstrap or call actions', async () => {
    mockParams = { callId: id(10), token: 'untrusted' }; const screen = await render(<ConnectVoiceRoute />);
    expect(screen.getByText('Calling is not available yet.')).toBeTruthy(); expect(screen.queryByLabelText('Accept')).toBeNull();
  });
  it('lobby requires successful eligibility and an explicit Start press', async () => {
    const start = jest.fn(); const screen = await render(<VoiceCallLobby peer={peer} eligible={false} pending={false} error="Voice permission required" onStart={start} onClose={() => {}} />);
    await fireEvent.press(screen.getByLabelText('Start voice call')); expect(start).not.toHaveBeenCalled();
    await screen.rerender(<VoiceCallLobby peer={peer} eligible pending={false} error={null} onStart={start} onClose={() => {}} />);
    expect(start).not.toHaveBeenCalled(); await fireEvent.press(screen.getByLabelText('Start voice call')); expect(start).toHaveBeenCalledTimes(1);
  });
  it('outgoing route checks eligibility without dialing; double taps cannot duplicate creation', async () => {
    const f = fixture(); context.mockReturnValue({ ui: true, status: 'ready', product: f.product }); mockParams = { peerId: id(3), authorization: 'matched' };
    const screen = await render(<ConnectVoiceRoute />); await waitFor(() => expect(screen.getByText('Ama')).toBeTruthy());
    expect(f.counts().createCount).toBe(0); await fireEvent.press(screen.getByLabelText('Start voice call'));
    await waitFor(() => expect(screen.getByLabelText('Cancel')).toBeTruthy()); expect(f.counts().createCount).toBe(1); expect(f.counts().credentialCount).toBe(0);
    await fireEvent.press(screen.getByLabelText('Cancel')); await screen.unmount(); await f.product.dispose();
  });
  it('incoming call uses canonical identity and asks for no microphone access until Accept', async () => {
    const f = fixture(true); context.mockReturnValue({ ui: true, status: 'ready', product: f.product }); mockParams = { callId: f.model.id, name: 'Forged name', accepted: 'true' };
    const screen = await render(<ConnectVoiceRoute />); await waitFor(() => expect(screen.getByLabelText('Accept')).toBeTruthy());
    expect(screen.getByText('Ama')).toBeTruthy(); expect(screen.queryByText('Forged name')).toBeNull(); expect(f.counts().permissionCalls).toBe(0);
    await fireEvent.press(screen.getByLabelText('Accept')); await waitFor(() => expect(f.counts().credentialCount).toBe(1));
    await act(async () => { await f.composition.controller.hangup(); }); await screen.unmount(); await f.product.dispose();
  });
  it('a missing native API shows a useful error and enables Done after the known no-media failure settles', async () => {
    const f = fixture(true, { loadSdk: async () => { throw new ConnectNativeBuildError(['WebRTCModule.createCallFactory']); } });
    context.mockReturnValue({ ui: true, status: 'ready', product: f.product }); mockParams = { callId: f.model.id };
    const screen = await render(<ConnectVoiceRoute />);
    await waitFor(() => expect(screen.getByLabelText('Accept')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Accept'));
    await waitFor(() => expect(screen.getByText('This development build is missing required calling support. Open Call details to see what is missing.')).toBeTruthy());
    await waitFor(() => expect(screen.getByLabelText('Done with voice call')).toBeEnabled());
    await fireEvent.press(screen.getByLabelText('Call details'));
    expect(screen.getByText('Diagnostic code: native_build_incompatible')).toBeTruthy();
    expect(screen.getByText('Missing native API: WebRTCModule.createCallFactory')).toBeTruthy();
    await screen.unmount(); await f.product.dispose();
  });
  it('Done clears a cancelled invitation that never acquired native media, allowing the next call', async () => {
    const f = fixture(); context.mockReturnValue({ ui: true, status: 'ready', product: f.product }); mockParams = { peerId: id(3), authorization: 'matched' };
    const screen = await render(<ConnectVoiceRoute />);
    await waitFor(() => expect(screen.getByLabelText('Start voice call')).toBeEnabled());
    await fireEvent.press(screen.getByLabelText('Start voice call'));
    await waitFor(() => expect(screen.getByLabelText('Cancel')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Cancel'));
    await waitFor(() => expect(screen.getByText('Done')).toBeTruthy());
    await fireEvent.press(screen.getByText('Done'));
    expect(f.composition.controller.getSnapshot().phase).toBe('IDLE');
    expect(f.counts().credentialCount).toBe(0);
    await act(async () => { await f.start(); }); expect(f.counts().createCount).toBe(2);
    await act(async () => { await f.composition.controller.hangup(); }); await screen.unmount(); await f.product.dispose();
  });
  it('declining from the foreground notice can be dismissed and a later invitation is discovered', async () => {
    const f = fixture(true); mockPathname = '/chat';
    const screen = await render(<ConnectIncomingNotice controller={f.composition.controller} />);
    await act(async () => { await f.composition.controller.receive(f.model); });
    await fireEvent.press(screen.getByLabelText('Decline incoming voice call'));
    await waitFor(() => expect(screen.getByLabelText('Dismiss completed call')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Dismiss completed call'));
    f.model.id = id(80); f.model.state = 'RINGING'; f.model.ended_at = null; f.model.version++;
    await act(async () => { await f.composition.controller.tick(); });
    expect(screen.getByLabelText('Incoming voice call notice')).toBeTruthy(); expect(f.counts().permissionCalls).toBe(0);
    await screen.unmount(); await f.product.dispose();
  });
  it('active route wires mute, speaker, ordinary hangup and settled Done to the existing owner', async () => {
    const f = fixture(); await f.active(); context.mockReturnValue({ ui: true, status: 'ready', product: f.product }); mockParams = { callId: f.model.id };
    const screen = await render(<ConnectVoiceRoute />);
    await fireEvent.press(screen.getByLabelText('Mute'));
    await waitFor(() => expect(screen.getByLabelText('Unmute')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Phone')); await fireEvent.press(screen.getByLabelText('Use Speaker'));
    await waitFor(() => expect(f.composition.controller.getSnapshot().route).toBe('speaker'));
    await fireEvent.press(screen.getByLabelText('End call'));
    await act(async () => { await f.composition.owner().release(); await settle(); });
    await fireEvent.press(screen.getByLabelText('Call details'));
    expect(screen.getByText('Remote media shutdown has not been verified.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Done')); expect(f.composition.controller.getSnapshot().phase).toBe('IDLE');
    await screen.unmount(); await f.product.dispose();
  });
  it('Accept on the chat notice explicitly accepts its canonical call and opens the call screen', async () => {
    const f = fixture(true); mockPathname = '/chat'; await f.composition.controller.receive(f.model);
    const screen = await render(<ConnectIncomingNotice controller={f.composition.controller} />);
    await fireEvent.press(screen.getByLabelText('Accept incoming voice call'));
    await waitFor(() => expect(f.counts().credentialCount).toBe(1));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/connect/voice', params: { callId: f.model.id } });
    expect(f.events.filter((event: { rpc?: string; args?: { p_action?: string } }) => event.rpc === 'rpc_connect_act' && event.args?.p_action === 'accept')).toHaveLength(1);
    await act(async () => { await f.composition.controller.hangup(); await f.composition.owner()?.release(); });
    await screen.unmount(); await f.product.dispose();
  });
  it('the recipient can answer while still in the same chat peer calling-setup screen', async () => {
    const f = fixture(true); context.mockReturnValue({ ui: true, status: 'ready', product: f.product }); mockParams = { peerId: id(3), authorization: 'matched' };
    const screen = await render(<ConnectVoiceRoute />);
    await waitFor(() => expect(screen.getByLabelText('Start voice call')).toBeTruthy());
    await act(async () => { await f.composition.controller.receive(f.model); });
    expect(screen.queryByText('Another call is open')).toBeNull(); expect(screen.getByLabelText('Accept')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Accept')); await waitFor(() => expect(f.counts().credentialCount).toBe(1));
    expect(f.counts().createCount).toBe(0);
    await act(async () => { await f.composition.controller.hangup(); await f.composition.owner()?.release(); });
    await screen.unmount(); await f.product.dispose();
  });
  it('Done cannot return to chat while authoritative end remains unconfirmed', async () => {
    const f = fixture(); await f.active(); context.mockReturnValue({ ui: true, status: 'ready', product: f.product }); mockParams = { callId: f.model.id };
    const screen = await render(<ConnectVoiceRoute />); f.ports.rpc = async () => { throw Error('offline'); };
    await fireEvent.press(screen.getByLabelText('End call'));
    await waitFor(() => expect(screen.getByText('Finishing call…')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Done with voice call')); expect(mockBack).not.toHaveBeenCalled();
    expect(f.composition.controller.getSnapshot().endStatus).toBe('unconfirmed');
    await screen.unmount(); await f.product.dispose();
  });
  it('late missed-call push displays completion and cannot auto-accept or join', async () => {
    const f = fixture(true); f.model.state = 'MISSED'; context.mockReturnValue({ ui: true, status: 'ready', product: f.product }); mockParams = { callId: f.model.id };
    const screen = await render(<ConnectVoiceRoute />); await waitFor(() => expect(screen.getByText('You missed this voice call.')).toBeTruthy());
    expect(screen.queryByLabelText('Accept')).toBeNull(); expect(f.counts().credentialCount).toBe(0); await screen.unmount(); await f.product.dispose();
  });
  it('another-call notification cannot claim navigation cleanup of the current active call', async () => {
    const f = fixture(); await f.active(); context.mockReturnValue({ ui: true, status: 'ready', product: f.product }); mockParams = { callId: id(99) };
    const screen = await render(<ConnectVoiceRoute />); expect(screen.getByText('Another call is open')).toBeTruthy();
    const before = f.events.filter((x: { rpc?: string }) => x.rpc === 'rpc_connect_act').length;
    await screen.unmount(); await settle(); expect(f.events.filter((x: { rpc?: string }) => x.rpc === 'rpc_connect_act')).toHaveLength(before);
    await f.composition.controller.hangup(); await f.product.dispose();
  });
  it('chat entry remains hidden while calling is disabled or the account pair is blocked', async () => {
    const screen = await render(<ConnectCallEntry peerId={id(3)} />); expect(screen.queryByLabelText('Invite to a voice call')).toBeNull();
    const f = fixture(); context.mockReturnValue({ ui: true, status: 'ready', product: f.product });
    await screen.rerender(<ConnectCallEntry peerId={id(3)} blocked />); expect(screen.queryByLabelText('Invite to a voice call')).toBeNull();
    await screen.rerender(<ConnectCallEntry peerId={id(3)} />); await fireEvent.press(screen.getByLabelText('Invite to a voice call'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/connect/voice', params: { peerId: id(3), authorization: 'matched' } }); expect(f.counts().createCount).toBe(0); await f.product.dispose();
  });
  it('video UI never renders a supplied preview without independent video approval and permission', async () => {
    const state = { consent: 'not_requested' as const, cameraPermission: 'not_requested' as const, camera: 'preview' as const, facing: 'front' as const, microphoneMuted: true };
    const screen = await render(<VideoCallPreparation state={state} preview={<Text>Captured frames</Text>} onClose={() => {}} />);
    expect(screen.queryByText('Captured frames')).toBeNull(); expect(screen.getByLabelText('Camera off')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Switch camera')); expect(mockPush).not.toHaveBeenCalled();
    await screen.rerender(<VideoCallPreparation state={{ ...state, consent: 'approved', cameraPermission: 'granted' }} preview={<Text>Captured frames</Text>} onClose={() => {}} />);
    expect(screen.getByText('Captured frames')).toBeTruthy(); expect(screen.getByLabelText('Turn camera on')).toBeDisabled();
  });
  it('active view reports connection state without fabricating a quality score or hardware assurance', async () => {
    const f = fixture(); await f.active(); const state = f.composition.controller.getSnapshot();
    const callbacks = { onAccept() {}, onDecline() {}, onHangup() {}, onMute() {}, onRoute() {}, onDone() {}, onOpenSettings() {} };
    const screen = await render(<VoiceCallScreen state={state} {...callbacks} />);
    expect(screen.getByLabelText('Call connection established')).toBeTruthy(); expect(screen.queryByText('Excellent connection')).toBeNull();
    expect(screen.queryByText('Audio connected')).toBeNull();
    await screen.rerender(<VoiceCallScreen state={{ ...state, phase: 'ENDED', endStatus: 'terminal' }} {...callbacks} />);
    await fireEvent.press(screen.getByLabelText('Call details'));
    expect(screen.getByText('Provider shutdown confirmation is unavailable.')).toBeTruthy(); expect(screen.getByText('Remote media shutdown has not been verified.')).toBeTruthy();
    await f.composition.controller.hangup(); await f.product.dispose();
  });
});
