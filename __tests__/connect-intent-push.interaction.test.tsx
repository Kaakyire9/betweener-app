import React from 'react';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { IntentCallingConsent } from '@/features/connect/components/IntentCallingConsent';
import { ConnectCallingPreferences } from '@/features/connect/components/ConnectCallingPreferences';
import { useConnectProduct } from '@/features/connect/components/ConnectProductProvider';
import ConnectVoiceRoute from '@/app/connect/voice';
import type { IntentCallingContext } from '@/features/connect/domain/intent-consent';
const { fixture, id, deferred } = require('./fixtures/connect-product-fixture.cjs');
const mockPush = jest.fn(), mockBack = jest.fn();
let mockColorScheme = 'dark';
let mockParams: Record<string, unknown> = {};
jest.mock('@/features/connect/components/ConnectProductProvider', () => ({ useConnectProduct: jest.fn() }));
jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => mockColorScheme }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: mockBack, canGoBack: () => true, replace: mockBack }),
  useLocalSearchParams: () => mockParams, usePathname: () => '/connect/voice',
  useFocusEffect: (fn: () => void) => { const React = require('react'); React.useEffect(fn, [fn]); },
}));
jest.mock('@/features/connect/config/connect-feature-flags', () => ({ connectFeatureFlags: { nativeSafetyOwner: true, endCallAndBlock: true } }));
jest.mock('expo-image', () => { const React = require('react'); const { View } = require('react-native'); return { Image: (props: object) => React.createElement(View, props) }; });
jest.mock('expo-linear-gradient', () => { const React = require('react'); const { View } = require('react-native'); return { LinearGradient: (props: object) => React.createElement(View, props) }; });
jest.mock('react-native-safe-area-context', () => { const React = require('react'); const { View } = require('react-native'); return { SafeAreaView: (props: object) => React.createElement(View, props), useSafeAreaInsets: () => ({ top: 0 }) }; });
jest.mock('@expo/vector-icons', () => ({ Ionicons: Object.assign(() => null, { glyphMap: {} }), MaterialCommunityIcons: () => null }));
const context = jest.mocked(useConnectProduct);
beforeEach(() => { jest.clearAllMocks(); mockParams = {}; mockColorScheme = 'dark'; context.mockReturnValue({ ui: false, status: 'disabled', product: null }); });
function consentFixture(recipient = false, pending = false) {
  const f = fixture(), model: IntentCallingContext = { intent_id: id(20), requester_profile_id: id(2), recipient_profile_id: id(3), intent_status: 'pending',
    intent_expires_at: '2099-01-01T00:00:00Z', available: true, offer_voice: true, offer_video: true, can_call_voice: false,
    grant: pending ? { id: id(21), intent_id: id(20), requester_profile_id: id(2), recipient_profile_id: id(3), voice: false, video: false, requested_voice: true,
      requested_video: true, status: 'pending', expires_at: '2099-01-01T00:00:00Z', accepted_at: null, revoked_at: null } : null };
  const get = jest.fn(async () => structuredClone(model));
  const offer = jest.fn(async (_intent: string, voice: boolean, video: boolean) => { model.grant = { ...consentFixtureGrant(), requested_voice: voice, requested_video: video }; });
  const decide = jest.fn(async (_grant: string, voice: boolean, video: boolean) => { Object.assign(model.grant!, { voice, video, status: voice || video ? 'accepted' : 'revoked' }); model.can_call_voice = voice; });
  const withdraw = jest.fn(async (_grant: string) => { model.grant!.status = 'revoked'; model.grant!.revoked_at = new Date().toISOString(); model.can_call_voice = false; });
  const product = { ...f.product, accountUserId: id(1), selfProfileId: recipient ? id(3) : id(2), services: { ...f.services, consent: { get, offer, decide, withdraw } } };
  context.mockReturnValue({ ui: true, status: 'ready', product }); return { f, product, model, get, offer, decide, withdraw };
}
function consentFixtureGrant() { return { id: id(21), intent_id: id(20), requester_profile_id: id(2), recipient_profile_id: id(3), voice: false, video: false, requested_voice: true,
  requested_video: true, status: 'pending' as const, expires_at: '2099-01-01T00:00:00Z', accepted_at: null, revoked_at: null }; }
describe('Intent calling consent and push journey', () => {
  it('default-off Intent controls and preference UI perform no RPCs', async () => {
    const screen = await render(<><IntentCallingConsent intentId={id(20)} /><ConnectCallingPreferences /></>);
    expect(screen.queryByText('Calling, by invitation')).toBeNull(); expect(screen.queryByText('Your calling preferences')).toBeNull();
  });
  it('launch keeps voice offers unavailable without changing Intent acceptance', async () => {
    const f = consentFixture(), screen = await render(<IntentCallingConsent intentId={id(20)} />);
    await waitFor(() => expect(screen.getByText('Calls before matching aren’t available yet. You can still connect through a chat Intent.')).toBeTruthy());
    expect(screen.queryByLabelText('Offer voice availability')).toBeNull(); expect(f.offer).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Invite to a voice call')).toBeNull(); await screen.unmount(); await f.f.product.dispose();
  });
  it('launch keeps video offers unavailable even when a prior context allows the media', async () => {
    const f = consentFixture(); f.model.offer_video = true;
    const screen = await render(<IntentCallingConsent intentId={id(20)} />);
    await waitFor(() => expect(screen.getByText('Calls before matching aren’t available yet. You can still connect through a chat Intent.')).toBeTruthy());
    expect(screen.queryByLabelText('Offer video availability')).toBeNull(); expect(f.offer).not.toHaveBeenCalled();
    await screen.unmount(); await f.f.product.dispose();
  });
  it('a pending pre-match grant cannot be approved from the launch screen', async () => {
    const f = consentFixture(true, true), screen = await render(<IntentCallingConsent intentId={id(20)} />);
    await waitFor(() => expect(screen.getByText('This request has no active calling access.')).toBeTruthy());
    expect(screen.queryByLabelText('Approve voice calling')).toBeNull(); expect(screen.queryByLabelText('Approve video calling')).toBeNull();
    expect(f.decide).not.toHaveBeenCalled(); await screen.unmount(); await f.f.product.dispose();
  });
  it('recipient can withdraw a legacy pending grant without enabling calls', async () => {
    const f = consentFixture(true, true), screen = await render(<IntentCallingConsent intentId={id(20)} />);
    await waitFor(() => expect(screen.getByLabelText('Withdraw calling permission')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Withdraw calling permission'));
    await waitFor(() => expect(f.withdraw).toHaveBeenCalledWith(id(21))); expect(f.decide).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Invite to a voice call')).toBeNull(); await screen.unmount(); await f.f.product.dispose();
  });
  it('saved grants remain viewable and withdrawable but cannot start pre-match calls', async () => {
    const f = consentFixture(false, true); Object.assign(f.model.grant!, { status: 'accepted', voice: true }); f.model.can_call_voice = true;
    const screen = await render(<IntentCallingConsent intentId={id(20)} />);
    await waitFor(() => expect(screen.getByText('Saved permission: voice.')).toBeTruthy());
    expect(screen.queryByLabelText('Invite to a voice call')).toBeNull(); expect(mockPush).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Withdraw calling permission')); await waitFor(() => expect(f.withdraw).toHaveBeenCalledWith(id(21)));
    await screen.unmount(); await f.f.product.dispose();
  });
  it('unconfirmed withdrawal removes cached acceptance and never claims it was saved', async () => {
    const f = consentFixture(false, true); Object.assign(f.model.grant!, { status: 'accepted', voice: true }); f.model.can_call_voice = true;
    f.withdraw.mockRejectedValueOnce(new Error('offline')); const screen = await render(<IntentCallingConsent intentId={id(20)} />);
    await waitFor(() => expect(screen.getByLabelText('Withdraw calling permission')).toBeTruthy()); await fireEvent.press(screen.getByLabelText('Withdraw calling permission'));
    await waitFor(() => expect(screen.getByText('The change could not be confirmed. Refresh before trying again.')).toBeTruthy()); expect(screen.queryByLabelText('Invite to a voice call')).toBeNull();
    await screen.unmount(); await f.f.product.dispose();
  });
  it('double withdrawal taps dispatch one mutation while the first is pending', async () => {
    const f = consentFixture(false, true), gate = deferred(); f.withdraw.mockImplementationOnce(() => gate.promise);
    const screen = await render(<IntentCallingConsent intentId={id(20)} />);
    await waitFor(() => expect(screen.getByLabelText('Withdraw calling permission')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Withdraw calling permission')); await fireEvent.press(screen.getByLabelText('Withdraw calling permission'));
    expect(f.withdraw).toHaveBeenCalledTimes(1); await act(async () => { gate.resolve(); }); await screen.unmount(); await f.f.product.dispose();
  });
  it('blocked/expired Intent disables offers and calls while permitting withdrawal', async () => {
    const f = consentFixture(false, true); f.model.available = false;
    const screen = await render(<IntentCallingConsent intentId={id(20)} />); await waitFor(() => expect(screen.getByText('Calling permission is expired, withdrawn or unavailable.')).toBeTruthy());
    expect(screen.queryByLabelText('Offer voice availability')).toBeNull(); expect(screen.queryByLabelText('Invite to a voice call')).toBeNull();
    expect(screen.getByLabelText('Withdraw calling permission')).toBeTruthy(); await screen.unmount(); await f.f.product.dispose();
  });
  it('voice invitation preference changes only after server readback and preserves video', async () => {
    const f = consentFixture(); let preferences = { voice: false, video: false };
    const set = jest.fn(async (voice: boolean, video: boolean) => { preferences = { voice, video }; });
    f.product.services.preferences = { get: async () => preferences, set };
    const screen = await render(<ConnectCallingPreferences />); await waitFor(() => expect(screen.getByLabelText('Allow eligible voice invitations').props.disabled).toBe(false));
    await fireEvent(screen.getByLabelText('Allow eligible voice invitations'), 'valueChange', true);
    await waitFor(() => expect(set).toHaveBeenCalledWith(true, false)); await waitFor(() => expect(screen.getByLabelText('Allow eligible voice invitations').props.value).toBe(true));
    await screen.unmount(); await f.f.product.dispose();
  });
  it.each(['light', 'dark'])('one accessible preferences panel preserves separate video authority in %s theme', async theme => {
    mockColorScheme = theme;
    const f = consentFixture(); let preferences = { voice: false, video: true };
    const get = jest.fn(async () => preferences);
    const set = jest.fn(async (voice: boolean, video: boolean) => { preferences = { voice, video }; });
    f.product.services.preferences = { get, set };
    const screen = await render(<ConnectCallingPreferences />);
    await waitFor(() => expect(screen.getByLabelText('Allow eligible voice invitations').props.disabled).toBe(false));
    expect(screen.getAllByLabelText('Allow eligible voice invitations')).toHaveLength(1);
    expect(screen.getAllByText('Your calling preferences')).toHaveLength(1);
    expect(screen.getByText('Your calling preferences').props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ color: theme === 'dark' ? '#F4EEE7' : '#173C3F' }),
    ]));
    expect(screen.getByRole('button', { name: 'Refresh calling preferences' })).toBeTruthy();
    await fireEvent(screen.getByLabelText('Allow eligible voice invitations'), 'valueChange', true);
    await waitFor(() => expect(set).toHaveBeenCalledWith(true, true));
    expect(f.decide).not.toHaveBeenCalled();
    await screen.unmount(); await f.f.product.dispose();
  });
  it('wrong-account notification never reads, accepts or captures a call', async () => {
    const f = fixture(true); context.mockReturnValue({ ui: true, status: 'ready', product: { ...f.product, accountUserId: id(1) } });
    mockParams = { callId: f.model.id, recipientUserId: id(9), callGeneration: f.model.created_at, callVersion: '1' };
    const screen = await render(<ConnectVoiceRoute />); expect(screen.getByText('This invitation belongs to a different account or session.')).toBeTruthy();
    expect(f.events.length).toBe(0); await screen.unmount(); await f.product.dispose();
  });
  it('late bound incoming notification displays canonical ended state without permission', async () => {
    const f = fixture(true); f.model.state = 'MISSED'; f.model.version = 3;
    context.mockReturnValue({ ui: true, status: 'ready', product: { ...f.product, accountUserId: id(1) } });
    mockParams = { callId: f.model.id, recipientUserId: id(1), callGeneration: f.model.created_at, callVersion: '1' };
    const screen = await render(<ConnectVoiceRoute />); await waitFor(() => expect(screen.getByText('You missed this voice call.')).toBeTruthy());
    expect(screen.queryByLabelText('Accept')).toBeNull(); expect(f.counts().permissionCalls).toBe(0); await screen.unmount(); await f.product.dispose();
  });
  it('offline notification read keeps admission denied and directs recovery to history', async () => {
    const f = fixture(true); f.services.api.getCall = async () => { throw Error('offline'); };
    context.mockReturnValue({ ui: true, status: 'ready', product: { ...f.product, accountUserId: id(1) } });
    mockParams = { callId: f.model.id, recipientUserId: id(1), callGeneration: f.model.created_at, callVersion: '1' };
    const screen = await render(<ConnectVoiceRoute />); await waitFor(() => expect(screen.getByText('Refresh your call history when you are back online. No invitation was accepted.')).toBeTruthy());
    expect(f.counts().permissionCalls).toBe(0); expect(f.counts().credentialCount).toBe(0); await screen.unmount(); await f.product.dispose();
  });
  it('wrong notification generation is rejected before displaying an answer action', async () => {
    const f = fixture(true); context.mockReturnValue({ ui: true, status: 'ready', product: { ...f.product, accountUserId: id(1) } });
    mockParams = { callId: f.model.id, recipientUserId: id(1), callGeneration: '2000-01-01T00:00:00Z', callVersion: '1' };
    const screen = await render(<ConnectVoiceRoute />); await waitFor(() => expect(screen.getByText('Refresh your call history when you are back online. No invitation was accepted.')).toBeTruthy());
    expect(screen.queryByLabelText('Accept')).toBeNull(); expect(f.counts().permissionCalls).toBe(0); await screen.unmount(); await f.product.dispose();
  });
  it('a delayed notification lookup cannot claim cleanup of a newly active different call', async () => {
    const f = fixture(), gate = deferred(), original = f.services.api.getCall;
    f.services.api.getCall = async (call: string) => call === id(99) ? gate.promise : original(call);
    context.mockReturnValue({ ui: true, status: 'ready', product: { ...f.product, accountUserId: id(1) } });
    const generation = new Date().toISOString(); mockParams = { callId: id(99), recipientUserId: id(1), callGeneration: generation, callVersion: '1' };
    const screen = await render(<ConnectVoiceRoute />);
    await act(async () => { await f.active(); gate.resolve({ ...f.model, id: id(99), created_at: generation }); });
    await waitFor(() => expect(screen.getByText('Another call is open')).toBeTruthy());
    await screen.unmount(); expect(f.composition.owner().getSnapshot().retired).toBe(false);
    await f.product.controller.hangup(); await f.product.dispose();
  });
  it('account switch discards delayed consent response without offering or deciding media', async () => {
    const f = consentFixture(), gate = deferred(); f.get.mockImplementationOnce(() => gate.promise);
    const screen = await render(<IntentCallingConsent intentId={id(20)} />);
    context.mockReturnValue({ ui: false, status: 'disabled', product: null }); await screen.rerender(<IntentCallingConsent intentId={id(20)} />);
    await act(async () => { gate.resolve(f.model); }); expect(screen.queryByText('Calling, by invitation')).toBeNull();
    expect(f.offer).not.toHaveBeenCalled(); expect(f.decide).not.toHaveBeenCalled(); await screen.unmount(); await f.f.product.dispose();
  });
});
