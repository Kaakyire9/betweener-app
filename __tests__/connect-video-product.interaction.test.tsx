// Local UI and SDK-port fixtures only; no device, provider or hardware assurance.
import React from 'react';
import { beforeEach, expect, it, jest } from '@jest/globals';
import { Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import ConnectVideoRoute from '@/app/connect/video';
import { VideoCallScreen } from '@/features/connect/components/VideoCallScreen';
import { useConnectProduct } from '@/features/connect/components/ConnectProductProvider';
import type { VoiceViewState } from '@/features/connect/voice/voice-types';
import type { VideoPresentation } from '@/features/connect/video/video-types';
import { unverifiedShutdown } from '@/features/connect/media/local-shutdown';
const { fixture, id } = require('./fixtures/connect-product-fixture.cjs');

let mockParams: Record<string, string> = {};
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams, usePathname: () => '/connect/video',
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true }),
  useFocusEffect: (callback: () => () => void) => { require('react').useEffect(callback, [callback]); } }));
jest.mock('@/features/connect/components/ConnectProductProvider', () => ({ useConnectProduct: jest.fn() }));
jest.mock('expo-image', () => ({ Image: (props: object) => require('react').createElement(require('react-native').View, props) }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: (props: object) => require('react').createElement(require('react-native').View, props) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: (props: object) => require('react').createElement(require('react-native').View, props), useSafeAreaInsets: () => ({ top: 0 }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: Object.assign(() => null, { glyphMap: {} }) }));
const context = jest.mocked(useConnectProduct);
const flags = { nativeSafetyOwner: true, endCallAndBlock: true, videoCalling: true };
const handlers = () => ({ onAccept: jest.fn(), onDecline: jest.fn(), onHangup: jest.fn(), onMute: jest.fn(), onRoute: jest.fn(),
  onDone: jest.fn(), onOpenSettings: jest.fn(), onCamera: jest.fn(), onFlipCamera: jest.fn(), onVideoError: jest.fn() });
const base: VoiceViewState = { phase: 'ACTIVE', session: null, peer: { profileId: id(3), name: 'Ama', avatar: null }, incoming: false, muted: false,
  route: 'speaker', routes: ['speaker', 'earpiece'], permission: 'granted', error: null, busy: false, durationSeconds: 12,
  foreground: true, audioSetupStage: 'ready', localShutdown: unverifiedShutdown(), endBlock: null, video: { camera: 'off', facing: 'front', error: null } };

beforeEach(() => { jest.clearAllMocks(); mockParams = {}; context.mockReturnValue({ ui: false, status: 'disabled', product: null }); });
it('default-off video route loads no camera, credentials or call actions', async () => {
  const f = fixture(); context.mockReturnValue({ ui: true, status: 'ready', product: f.product }); mockParams = { peerId: id(3), authorization: 'matched' };
  const screen = await render(<ConnectVideoRoute />);
  expect(screen.getByText('Video calling is not available yet')).toBeTruthy();
  expect(f.counts().createCount).toBe(0); expect(f.counts().credentialCount).toBe(0); expect(f.cameraCounts().permission).toBe(0); await f.product.dispose();
});
it('disabled video view never even reads a supplied render capability', async () => {
  const source = { participants: jest.fn(() => []), subscribe: jest.fn(() => () => {}), render: jest.fn(() => null) };
  const screen = await render(<VideoCallScreen state={base} source={source} flags={{ ...flags, videoCalling: false }} {...handlers()} />);
  expect(screen.queryByLabelText('Turn camera on')).toBeNull(); expect(source.participants).not.toHaveBeenCalled(); expect(source.subscribe).not.toHaveBeenCalled();
});
it('camera-off conversation preserves voice controls and requires an explicit camera press', async () => {
  const h = handlers(), screen = await render(<VideoCallScreen state={base} flags={flags} source={null} {...h} />);
  expect(h.onCamera).not.toHaveBeenCalled(); expect(screen.getByLabelText('Switch camera')).toBeDisabled();
  await fireEvent.press(screen.getByLabelText('Turn camera on')); expect(h.onCamera).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByLabelText('Mute')); expect(h.onMute).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByLabelText('End call')); expect(h.onHangup).toHaveBeenCalledTimes(1);
});
it('incoming video is named and explains camera-off acceptance', async () => {
  const h = handlers(), screen = await render(<VideoCallScreen state={{ ...base, phase: 'RINGING', incoming: true }} flags={flags} source={null} {...h} />);
  expect(screen.getByText('Incoming video call')).toBeTruthy(); expect(screen.getByText('Ama')).toBeTruthy();
  expect(screen.getByText('Answer with your camera off. Turn it on when you’re ready.')).toBeTruthy();
  expect(screen.queryByLabelText('Turn camera on')).toBeNull(); await fireEvent.press(screen.getByLabelText('Accept')); expect(h.onAccept).toHaveBeenCalledTimes(1);
  expect(h.onCamera).not.toHaveBeenCalled();
});
it('remote and local frames use distinct call-scoped render identities', async () => {
  const source: VideoPresentation = { participants: () => [{ sessionId: 'remote', local: false, cameraOn: true }, { sessionId: 'self', local: true, cameraOn: true }],
    subscribe: () => () => {}, render: (sessionId, local) => <Text>{`${local ? 'Local' : 'Remote'} fixture ${sessionId}`}</Text> };
  const screen = await render(<VideoCallScreen state={{ ...base, video: { camera: 'on', facing: 'front', error: null } }} flags={flags} source={source} {...handlers()} />);
  expect(screen.getByText('Remote fixture remote')).toBeTruthy(); expect(screen.getByText('Local fixture self')).toBeTruthy();
  expect(screen.getByLabelText('Switch camera')).toBeEnabled(); expect(screen.queryByText('Hardware verified')).toBeNull();
});
it('a hung camera operation remains cancellable and never disables End', async () => {
  const h = handlers(), screen = await render(<VideoCallScreen state={{ ...base, video: { camera: 'starting', facing: 'front', error: null } }} flags={flags} source={null} {...h} />);
  expect(screen.getByLabelText('Turn camera off')).toBeEnabled(); expect(screen.getByLabelText('Switch camera')).toBeDisabled();
  await fireEvent.press(screen.getByLabelText('Turn camera off')); await fireEvent.press(screen.getByLabelText('End call'));
  expect(h.onCamera).toHaveBeenCalledTimes(1); expect(h.onHangup).toHaveBeenCalledTimes(1);
});
it('background and ending states cannot render media or invoke camera controls', async () => {
  const source = { participants: jest.fn(() => []), subscribe: jest.fn(() => () => {}), render: jest.fn(() => null) };
  const screen = await render(<VideoCallScreen state={{ ...base, foreground: false }} flags={flags} source={source} {...handlers()} />);
  expect(source.participants).not.toHaveBeenCalled(); expect(screen.getByLabelText('Turn camera on')).toBeDisabled();
  await screen.rerender(<VideoCallScreen state={{ ...base, phase: 'ENDED' }} flags={flags} source={source} {...handlers()} />);
  expect(screen.queryByLabelText('Turn camera on')).toBeNull(); expect(source.render).not.toHaveBeenCalled();
});
it('blocked permission presents settings without retrying capture', async () => {
  const h = handlers(), screen = await render(<VideoCallScreen state={{ ...base, video: { camera: 'off', facing: 'front', error: 'Camera access is off.', permission: 'blocked' } }} flags={flags} source={null} {...h} />);
  await fireEvent.press(screen.getByLabelText('Open camera settings')); expect(h.onOpenSettings).toHaveBeenCalledTimes(1); expect(h.onCamera).not.toHaveBeenCalled();
});
it('video navigation uses real eligibility and creates a video invitation only on Start', async () => {
  const f = fixture(false, { media: 'video', videoCalling: true }); context.mockReturnValue({ ui: true, status: 'ready', product: f.product });
  mockParams = { peerId: id(3), authorization: 'matched' }; const screen = await render(<ConnectVideoRoute />);
  await waitFor(() => expect(screen.getByLabelText('Start video call')).toBeEnabled());
  expect(f.counts().createCount).toBe(0); expect(f.cameraCounts().enabled).toBe(0);
  await fireEvent.press(screen.getByLabelText('Start video call')); await waitFor(() => expect(screen.getByLabelText('Cancel')).toBeTruthy());
  expect(f.events.find((e: { rpc?: string }) => e.rpc === 'rpc_connect_create_call').args.p_media).toBe('video');
  expect(f.counts().credentialCount).toBe(0); await act(async () => f.composition.controller.hangup()); await screen.unmount(); await f.product.dispose();
});
it('recipient video acceptance uses the current controller without auto-enabling the camera', async () => {
  const f = fixture(true, { media: 'video', videoCalling: true }); context.mockReturnValue({ ui: true, status: 'ready', product: f.product });
  mockParams = { callId: f.model.id }; const screen = await render(<ConnectVideoRoute />);
  await waitFor(() => expect(screen.getByText('Incoming video call')).toBeTruthy());
  expect(f.counts().credentialCount).toBe(0); await fireEvent.press(screen.getByLabelText('Accept'));
  await waitFor(() => expect(f.counts().credentialCount).toBe(1)); expect(f.cameraCounts().enabled).toBe(0);
  await act(async () => f.composition.controller.hangup()); await screen.unmount(); await f.product.dispose();
});
