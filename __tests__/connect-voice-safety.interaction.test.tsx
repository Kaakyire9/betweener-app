import React from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';
import { VoiceCallScreen } from '@/features/connect/components/VoiceCallScreen';
import { ConnectVoiceSession } from '@/features/connect/components/ConnectVoiceSession';
import { createVoicePreview } from '@/features/connect/voice/voice-preview';
import { pendingShutdown, unverifiedShutdown } from '@/features/connect/media/local-shutdown';
import type { VoiceViewState } from '@/features/connect/voice/voice-types';

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => () => void) => { require('react').useEffect(callback, [callback]); },
}));
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

const flags = { nativeSafetyOwner: true, endCallAndBlock: true };
const state: VoiceViewState = { phase: 'ACTIVE', localShutdown: unverifiedShutdown(), endBlock: null,
  session: { id: 'offline-call', created_at: '2026-10-31T08:00:00Z', caller_profile_id: 'self', recipient_profile_id: 'peer',
    state: 'ACTIVE', media: 'voice', authorization: 'matched', version: 1, accepted_at: null, connected_at: null, ended_at: null, deadline: null, reason: null, duration_seconds: null },
  peer: { profileId: 'peer', name: 'Alex', avatar: null }, incoming: false, muted: false, route: 'earpiece', routes: ['earpiece'], permission: 'granted', error: null, busy: false, durationSeconds: null, foreground: true };
const handlers = () => ({ onAccept: jest.fn(), onDecline: jest.fn(), onHangup: jest.fn(), onMute: jest.fn(), onRoute: jest.fn(), onDone: jest.fn(), onOpenSettings: jest.fn() });
const safety = () => ({ endAndBlock: jest.fn(), checkStatus: jest.fn() });

it('required encryption is labelled active only after SDK confirmation', async () => {
  const screen=await render(<VoiceCallScreen state={{...state,encryption:{required:true,sdkConfirmed:false,identityVerified:false}}} {...handlers()} />);
  expect(screen.getByText('Securing your call…')).toBeTruthy();expect(screen.queryByText('End-to-end encrypted')).toBeNull();
  await screen.rerender(<VoiceCallScreen state={{...state,encryption:{required:true,sdkConfirmed:true,identityVerified:false}}} {...handlers()} />);
  expect(screen.getByText('End-to-end encrypted')).toBeTruthy();
});
it('changed-device trust requires an explicit safety-code review and confirmation', async () => {
  const reviewIdentity=jest.fn<()=>Promise<string>>().mockResolvedValue('abcd ef01');
  const replaceIdentity=jest.fn<(code:string)=>Promise<void>>().mockResolvedValue(undefined);
  const screen=await render(<VoiceCallScreen state={state} {...handlers()} flags={{...flags,encryptedCalls:true}}
    safetyActions={{...safety(),reviewIdentity,replaceIdentity}} />);
  await fireEvent.press(screen.getByLabelText('Review calling identity'));
  expect(screen.getByLabelText('Identity verification code')).toBeTruthy();expect(replaceIdentity).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText('Confirm compared calling identity'));expect(replaceIdentity).toHaveBeenCalledWith('abcd ef01');
});

it('a late identity review cannot show the previous call code on another call', async () => {
  let resolve!: (code:string)=>void;
  const pending=new Promise<string>(done=>{resolve=done;});
  const actions={...safety(),reviewIdentity:()=>pending,replaceIdentity:async()=>{}};
  const screen=await render(<VoiceCallScreen state={state} {...handlers()} flags={{...flags,encryptedCalls:true}} safetyActions={actions} />);
  await fireEvent.press(screen.getByLabelText('Review calling identity'));
  await screen.rerender(<VoiceCallScreen state={{...state,session:{...state.session!,id:'another-call'}}} {...handlers()} flags={{...flags,encryptedCalls:true}} safetyActions={actions} />);
  await act(async()=>{resolve('old peer code');await pending;});
  expect(screen.queryByText('old peer code')).toBeNull();
  expect(screen.queryByLabelText('Confirm compared calling identity')).toBeNull();
});

it('withdrawing calling consent requires confirmation and reports persistence failure truthfully', async () => {
  const withdrawConsent = jest.fn<() => Promise<void>>().mockRejectedValue(Error('offline'));
  const screen = await render(<VoiceCallScreen state={state} {...handlers()} safetyActions={{ ...safety(), withdrawConsent }} />);
  await fireEvent.press(screen.getByLabelText('Call details'));
  await fireEvent.press(screen.getByLabelText('Turn off calling invitations')); expect(withdrawConsent).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText('Confirm withdrawal of calling consent'));
  expect(withdrawConsent).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Your calling preference change has not been confirmed. Try again when connected.')).toBeTruthy();
  expect(screen.queryByText('Calling invitations are off for your account.')).toBeNull();
});

it('conversation prompts stay optional and appear only during an active call', async () => {
  const screen = await render(<VoiceCallScreen state={state} {...handlers()} />);
  expect(screen.queryByText('What made you smile today?')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Show a conversation prompt'));
  expect(screen.getByText('What made you smile today?')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Hide conversation prompt'));
  expect(screen.queryByText('What made you smile today?')).toBeNull();
  await screen.rerender(<VoiceCallScreen state={{ ...state, phase: 'ENDED' }} {...handlers()} />);
  expect(screen.queryByLabelText('Show a conversation prompt')).toBeNull();
});

it('withdrawal remains pending until acknowledged and ignores duplicate confirmation taps', async () => {
  let complete!: () => void;
  const pending = new Promise<void>(resolve => { complete = resolve; });
  const withdrawConsent = jest.fn<() => Promise<void>>().mockReturnValue(pending);
  const screen = await render(<VoiceCallScreen state={state} {...handlers()} safetyActions={{ ...safety(), withdrawConsent }} />);
  await fireEvent.press(screen.getByLabelText('Call details'));
  await fireEvent.press(screen.getByLabelText('Turn off calling invitations'));
  const confirm = screen.getByLabelText('Confirm withdrawal of calling consent');
  await fireEvent.press(confirm);
  expect(withdrawConsent).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Saving your calling preferences…')).toBeTruthy();
  expect(screen.queryByLabelText('Confirm withdrawal of calling consent')).toBeNull();
  await act(async () => { complete(); await pending; });
  expect(screen.getByText('Calling invitations are off for your account.')).toBeTruthy();
});

it('cancelling consent withdrawal does not dispatch a mutation', async () => {
  const withdrawConsent = jest.fn<() => Promise<void>>();
  const screen = await render(<VoiceCallScreen state={state} {...handlers()} safetyActions={{ ...safety(), withdrawConsent }} />);
  await fireEvent.press(screen.getByLabelText('Call details'));
  await fireEvent.press(screen.getByLabelText('Turn off calling invitations'));
  await fireEvent.press(screen.getByLabelText('Keep calling invitations'));
  expect(withdrawConsent).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Confirm withdrawal of calling consent')).toBeNull();
});

describe('Default-off Connect local safety UI', () => {
  it('default flags hide End Call & Block even when callbacks exist', async () => {
    const screen = await render(<VoiceCallScreen state={state} {...handlers()} safetyActions={safety()} />);
    expect(screen.queryByLabelText('End call and block')).toBeNull();
  });
  it('ordinary End remains separate and block requires explicit confirmation', async () => {
    const callbacks = handlers(), actions = safety();
    const screen = await render(<VoiceCallScreen state={state} {...callbacks} safetyActions={actions} flags={flags} />);
    await fireEvent.press(screen.getByLabelText('End call'));
    expect(callbacks.onHangup).toHaveBeenCalledTimes(1); expect(actions.endAndBlock).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('End call and block'));
    expect(actions.endAndBlock).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Confirm end call and block')); expect(actions.endAndBlock).toHaveBeenCalledTimes(1);
  });
  it('confirmation cannot carry over to a different call or back to the old call', async () => {
    const actions = safety(), props = handlers();
    const screen = await render(<VoiceCallScreen state={state} {...props} safetyActions={actions} flags={flags} />);
    await fireEvent.press(screen.getByLabelText('End call and block'));
    await screen.rerender(<VoiceCallScreen state={{ ...state, session: { ...state.session!, id: 'different-call' } }} {...props} safetyActions={actions} flags={flags} />);
    expect(screen.queryByLabelText('Confirm end call and block')).toBeNull();
    await screen.rerender(<VoiceCallScreen state={state} {...props} safetyActions={actions} flags={flags} />);
    expect(screen.queryByLabelText('Confirm end call and block')).toBeNull(); expect(actions.endAndBlock).not.toHaveBeenCalled();
  });
  it('canceling confirmation makes no authority request', async () => {
    const actions = safety(); const screen = await render(<VoiceCallScreen state={state} {...handlers()} safetyActions={actions} flags={flags} />);
    await fireEvent.press(screen.getByLabelText('End call and block')); await fireEvent.press(screen.getByLabelText('Cancel account block'));
    expect(screen.queryByLabelText('Confirm end call and block')).toBeNull(); expect(actions.endAndBlock).not.toHaveBeenCalled();
  });
  it('saved block with provider ACK still shows pending local shutdown and remote uncertainty', async () => {
    const actions = safety(); const ended: VoiceViewState = { ...state, phase: 'ENDED', localShutdown: pendingShutdown(),
      endBlock: { block: 'saved', call: 'terminal', provider: 'acknowledged', media: 'unverified', error: null } };
    const screen = await render(<VoiceCallScreen state={ended} {...handlers()} safetyActions={actions} flags={flags} />);
    expect(screen.getByText('Account block saved.')).toBeTruthy(); expect(screen.getByText('Stopping local media…')).toBeTruthy();
    expect(screen.getByText('Provider end request acknowledged.')).toBeTruthy(); expect(screen.getByText('Remote media shutdown has not been verified.')).toBeTruthy();
    expect(screen.queryByText('Local media shutdown verified.')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Check block and end status'));
    expect(actions.checkStatus).toHaveBeenCalledTimes(1); expect(actions.endAndBlock).not.toHaveBeenCalled();
  });
  it('unblock and a failed termination remain separate facts without an automatic reblock', async () => {
    const screen = await render(<VoiceCallScreen state={{ ...state, phase: 'ENDED', endBlock: { block: 'no_longer_saved', call: 'terminal', provider: 'unconfirmed', media: 'unverified', error: null } }} {...handlers()} safetyActions={safety()} flags={flags} />);
    expect(screen.getByText('Account block is no longer saved.')).toBeTruthy(); expect(screen.getByText('Provider end request unconfirmed.')).toBeTruthy();
    expect(screen.queryByLabelText('End call and block')).toBeNull();
  });
  it('disabled session view does not subscribe, poll or construct native ownership', async () => {
    const preview = createVoicePreview(); const subscribe = jest.spyOn(preview.controller, 'subscribe'); const tick = jest.spyOn(preview.controller, 'tick');
    const screen = await render(<ConnectVoiceSession controller={preview.controller} onClose={() => {}} onOpenSettings={() => {}} />);
    expect(screen.getByText('Voice calling is currently unavailable.')).toBeTruthy(); expect(subscribe).not.toHaveBeenCalled(); expect(tick).not.toHaveBeenCalled();
  });
  it('closing a session does not wait for a stalled dispose', async () => {
    const preview = createVoicePreview(); const close = jest.fn();
    jest.spyOn(preview.controller, 'dispose').mockImplementation(() => new Promise(() => {}));
    const screen = await render(<ConnectVoiceSession controller={preview.controller} flags={flags} onClose={close} onOpenSettings={() => {}} />);
    await fireEvent.press(screen.getByText('Done')); expect(close).toHaveBeenCalledTimes(1);
  });
  it('a rejected block action displays uncertainty instead of being silently swallowed', async () => {
    const preview = createVoicePreview(); await preview.start();
    const screen = await render(<ConnectVoiceSession controller={preview.controller} flags={flags} onClose={() => {}} onOpenSettings={() => {}} />);
    await fireEvent.press(screen.getByLabelText('End call and block')); await fireEvent.press(screen.getByLabelText('Confirm end call and block'));
    expect(screen.getByText('Blocking could not be started. No account block has been confirmed.')).toBeTruthy();
  });
  it('development effect replay preserves its owner but real unmount retires it', async () => {
    const preview = createVoicePreview(); const dispose = jest.spyOn(preview.controller, 'dispose');
    const screen = await render(<React.StrictMode><ConnectVoiceSession controller={preview.controller} flags={flags} onClose={() => {}} onOpenSettings={() => {}} /></React.StrictMode>);
    await act(async () => { await Promise.resolve(); }); expect(dispose).not.toHaveBeenCalled();
    await screen.unmount(); await act(async () => { await Promise.resolve(); }); expect(dispose).toHaveBeenCalledTimes(1);
  });
});
