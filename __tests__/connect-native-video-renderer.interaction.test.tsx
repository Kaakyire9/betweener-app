import React from 'react';
import { beforeEach, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { NativeVideoRenderer } from '@/features/connect/media/native-video-renderer';

let mockCall: any;
jest.mock('@stream-io/video-react-native-sdk', () => ({ useCall: () => mockCall, hasVideo: (p: any) => p.publishedTracks.includes('video'),
  DebounceType: { IMMEDIATE: 'immediate' }, VisibilityState: { VISIBLE: 'visible', INVISIBLE: 'invisible' } }));
jest.mock('@stream-io/react-native-webrtc', () => ({ RTCView: (props: object) => require('react').createElement(require('react-native').View, { ...props, testID: 'native-video-fixture' }) }));
const participant = (local = false, published = true, live = true): any => ({ sessionId: local ? 'self' : 'peer', isLocalParticipant: local,
  publishedTracks: published ? ['video'] : [], videoStream: { toURL: () => 'fixture-stream', getVideoTracks: () => [{ readyState: live ? 'live' : 'ended' }] } });
beforeEach(() => {
  mockCall = { state: { callingState: 'joined', updateParticipant: jest.fn(), updateParticipantTracks: jest.fn() }, trackSubscriptionManager: { apply: jest.fn() } };
});
const layout = { nativeEvent: { layout: { width: 360, height: 640 } } };
it('remote layout requests only the bound camera track and releases that subscription on unmount', async () => {
  const screen = await render(<NativeVideoRenderer current={() => true} participant={participant()} trackType="videoTrack" />);
  // The native surface's enclosing View owns layout, rather than RTCView dimensions.
  await fireEvent(screen.getByTestId('connect-native-video-surface'), 'layout', layout);
  expect(mockCall.state.updateParticipantTracks).toHaveBeenCalledWith('videoTrack', { peer: { dimension: { width: 360, height: 640 } } });
  expect(screen.getByTestId('native-video-fixture').props.streamURL).toBe('fixture-stream');
  await screen.unmount(); expect(mockCall.state.updateParticipantTracks).toHaveBeenLastCalledWith('videoTrack', { peer: { dimension: undefined } });
});
it('a local surface mirrors only on request and never subscribes to a second audio/video receiver', async () => {
  const screen = await render(<NativeVideoRenderer current={() => true} participant={participant(true)} mirror videoZOrder={1} />);
  expect(screen.getByTestId('native-video-fixture').props.mirror).toBe(true);
  expect(mockCall.state.updateParticipantTracks).not.toHaveBeenCalled();
});
it('unpublished, ended, hidden or screen-share tracks never reach the native video view', async () => {
  const screen = await render(<NativeVideoRenderer current={() => true} participant={participant(false, false)} />);
  expect(screen.queryByTestId('native-video-fixture')).toBeNull();
  await screen.rerender(<NativeVideoRenderer current={() => true} participant={participant(false, true, false)} />); expect(screen.queryByTestId('native-video-fixture')).toBeNull();
  await screen.rerender(<NativeVideoRenderer current={() => true} participant={participant()} isVisible={false} />); expect(screen.queryByTestId('native-video-fixture')).toBeNull();
  await screen.rerender(<NativeVideoRenderer current={() => true} participant={participant()} trackType="screenShareTrack" />); expect(screen.queryByTestId('native-video-fixture')).toBeNull();
});
it('a retired call cannot request media or render a retained stream', async () => {
  mockCall.state.callingState = 'left'; const screen = await render(<NativeVideoRenderer current={() => true} participant={participant()} />);
  expect(screen.queryByTestId('native-video-fixture')).toBeNull(); expect(mockCall.trackSubscriptionManager.apply).not.toHaveBeenCalled();
});
it('an owner retirement fences delayed layout callbacks even if the SDK still says joined', async () => {
  let active = true;
  const screen = await render(<NativeVideoRenderer current={() => active} participant={participant()} />);
  active = false;
  await fireEvent(screen.getByTestId('connect-native-video-surface'), 'layout', layout);
  expect(mockCall.state.updateParticipantTracks).not.toHaveBeenCalled();
  await screen.rerender(<NativeVideoRenderer current={() => active} participant={participant()} />);
  expect(screen.queryByTestId('native-video-fixture')).toBeNull();
});
