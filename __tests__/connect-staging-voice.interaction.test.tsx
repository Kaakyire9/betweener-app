import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { describe, it, expect, jest } from '@jest/globals';
import { createAudioPlayer } from 'expo-audio';
import { ConnectVoiceSetup } from '@/features/connect/components/ConnectVoiceSetup';
import { ConnectRingtone } from '@/features/connect/components/ConnectRingtone';
const { fixture, id, deferred } = require('./fixtures/connect-product-fixture.cjs');
jest.mock('expo-audio', () => ({ createAudioPlayer: jest.fn() }));
describe('normal staging voice setup', () => {
  it('reading an old match never confirms it or opts the account into calls', async () => {
    const f = fixture(), confirm = jest.fn<(peerId: string) => Promise<boolean>>(async () => false), set = jest.fn();
    f.product.services.relationship = { verified: async () => false, confirm };
    f.product.services.preferences = { get: async () => ({ voice: false, video: false }), set };
    const screen = await render(<ConnectVoiceSetup product={f.product} peerId={id(3)} matched onEligibility={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText('Confirm this connection for calling')).toBeTruthy());
    expect(confirm).not.toHaveBeenCalled(); expect(set).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Confirm this connection for calling'));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(id(3)));
    expect(screen.getByText('Waiting for the other person to confirm.')).toBeTruthy();
    expect(f.counts().credentialCount).toBe(0); await screen.unmount(); await f.product.dispose();
  });
  it('voice opt-in waits for saved readback and preserves independent video preference', async () => {
    const f = fixture(), gate = deferred(); let prefs = { voice: false, video: false };
    const set = jest.fn(async (voice: boolean, video: boolean) => { await gate.promise; prefs = { voice, video }; });
    f.product.services.preferences = { get: async () => ({ ...prefs }), set };
    const screen = await render(<ConnectVoiceSetup product={f.product} peerId={id(3)} matched onEligibility={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText('Allow voice invitations in this account').props.disabled).toBe(false));
    await fireEvent(screen.getByLabelText('Allow voice invitations in this account'), 'valueChange', true);
    expect(screen.getByLabelText('Allow voice invitations in this account').props.value).toBe(false);
    await act(async () => { gate.resolve(); });
    await waitFor(() => expect(screen.getByLabelText('Allow voice invitations in this account').props.value).toBe(true));
    expect(set).toHaveBeenCalledWith(true, false); await screen.unmount(); await f.product.dispose();
  });
  it('a failed consent mutation never enables a call or claims a confirmed connection', async () => {
    const f = fixture(), eligible = jest.fn();
    f.product.services.relationship = { verified: async () => false, confirm: async () => { throw Error('offline'); } };
    const screen = await render(<ConnectVoiceSetup product={f.product} peerId={id(3)} matched onEligibility={eligible} />);
    await waitFor(() => expect(screen.getByLabelText('Confirm this connection for calling')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Confirm this connection for calling'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy()); expect(eligible).toHaveBeenCalledWith(false);
    expect(f.counts().createCount).toBe(0); await screen.unmount(); await f.product.dispose();
  });
  it('foreground ringing releases audio before the accepted call begins', async () => {
    const f = fixture(true), player = { play: jest.fn(), pause: jest.fn(), remove: jest.fn(), loop: false, volume: 0 };
    jest.mocked(createAudioPlayer).mockReturnValue(player as never);
    const screen = await render(<ConnectRingtone controller={f.composition.controller} />);
    await act(async () => { await f.composition.controller.receive(f.model); });
    expect(player.play).toHaveBeenCalledTimes(1);
    await act(async () => { await f.composition.controller.accept(); });
    expect(player.pause).toHaveBeenCalledTimes(1); expect(player.remove).toHaveBeenCalledTimes(1);
    await screen.unmount(); await f.product.dispose();
  });
});
