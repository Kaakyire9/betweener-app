import React, { useEffect } from 'react';
import { expect, it, jest } from '@jest/globals';
import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useCallingPreferences } from '@/features/connect/hooks/use-calling-preferences';

const deferred = <T,>() => {
  let resolve!: (v: T) => void, reject!: (e: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
type Port = Parameters<typeof useCallingPreferences>[0];
type Preferences = ReturnType<typeof useCallingPreferences>;
let current: Preferences;
const unusedSet = () => jest.fn<Port['set']>(async () => undefined);
function Harness({ port }: { port: Port }) {
  const preferences = useCallingPreferences(port);
  useEffect(() => { current = preferences; }, [preferences]);
  return <Text>{JSON.stringify({ value: preferences.value, busy: preferences.busy, error: preferences.error })}</Text>;
}

it('reads preferences without opting the account in or requesting credentials', async () => {
  const set = unusedSet(), port = { get: async () => ({ voice: false, video: false }), set };
  await render(<Harness port={port} />);
  await waitFor(() => expect(current.value).toEqual({ voice: false, video: false }));
  expect(set).not.toHaveBeenCalled();
});

it('waits for saved readback and never derives video approval from voice selection', async () => {
  let stored = { voice: false, video: false }; const gate = deferred<void>();
  const port = { get: async () => ({ ...stored }), set: jest.fn(async (voice: boolean, video: boolean) => { await gate.promise; stored = { voice, video }; }) };
  await render(<Harness port={port} />); await waitFor(() => expect(current.value).not.toBeNull());
  let saving!: Promise<boolean>;
  await act(async () => { saving = current.setVoice(true); });
  expect(current.value?.voice).toBe(false); expect(current.busy).toBe(true);
  expect(port.set).toHaveBeenCalledWith(true, false);
  await act(async () => { gate.resolve(); expect(await saving).toBe(true); });
  expect(current.value).toEqual({ voice: true, video: false }); expect(current.busy).toBe(false);
});

it('serializes repeated mutations even before a React rerender', async () => {
  const gate = deferred<void>(), port = { get: async () => ({ voice: false, video: false }), set: jest.fn(() => gate.promise) };
  await render(<Harness port={port} />); await waitFor(() => expect(current.value).not.toBeNull());
  let first!: Promise<boolean>, second!: Promise<boolean>;
  await act(async () => { first = current.setVoice(true); second = current.setVoice(true); });
  expect(await second).toBe(false); expect(port.set).toHaveBeenCalledTimes(1);
  await act(async () => { gate.resolve(); await first; });
});

it('a late failed read cannot erase newer preferences', async () => {
  const old = deferred<{ voice: boolean; video: boolean }>();
  const port = { get: jest.fn<Port['get']>().mockImplementationOnce(() => old.promise).mockResolvedValue({ voice: true, video: false }), set: unusedSet() };
  await render(<Harness port={port} />);
  await act(async () => { await current.refresh(); });
  await act(async () => { old.reject(Error('late')); await old.promise.catch(() => undefined); });
  expect(current.value).toEqual({ voice: true, video: false }); expect(current.error).toBe(false);
});

it('an account-service switch rejects late readback from the previous owner', async () => {
  const old = deferred<{ voice: boolean; video: boolean }>();
  const a = { get: () => old.promise, set: unusedSet() }, b = { get: async () => ({ voice: false, video: false }), set: unusedSet() };
  const screen = await render(<Harness port={a} />); await screen.rerender(<Harness port={b} />);
  await waitFor(() => expect(current.value).toEqual({ voice: false, video: false }));
  await act(async () => { old.resolve({ voice: true, video: true }); await old.promise; });
  expect(current.value).toEqual({ voice: false, video: false }); expect(b.set).not.toHaveBeenCalled();
});

it('an old mutation cannot read or overwrite the new account state', async () => {
  const gate = deferred<void>(); const get = jest.fn(async () => ({ voice: false, video: false }));
  const a = { get, set: jest.fn(() => gate.promise) }, b = { get: async () => ({ voice: true, video: false }), set: unusedSet() };
  const screen = await render(<Harness port={a} />); await waitFor(() => expect(current.value).not.toBeNull());
  let saving!: Promise<boolean>; await act(async () => { saving = current.setVoice(true); });
  await screen.rerender(<Harness port={b} />); await waitFor(() => expect(current.value?.voice).toBe(true));
  await act(async () => { gate.resolve(); expect(await saving).toBe(false); });
  expect(get).toHaveBeenCalledTimes(1); expect(b.set).not.toHaveBeenCalled(); expect(current.busy).toBe(false);
});

it('malformed preferences and write failures remain unconfirmed', async () => {
  const malformed = { get: async () => ({ voice: 'true', video: false }) as never, set: unusedSet() };
  const screen = await render(<Harness port={malformed} />);
  await waitFor(() => expect(current.error).toBe(true)); expect(await current.setVoice(true)).toBe(false); expect(malformed.set).not.toHaveBeenCalled();
  const port = { get: async () => ({ voice: false, video: false }), set: jest.fn(async () => { throw Error('offline'); }) };
  await screen.rerender(<Harness port={port} />); await waitFor(() => expect(current.value).not.toBeNull());
  await act(async () => { expect(await current.setVoice(true)).toBe(false); });
  expect(current.value).toBeNull(); expect(current.error).toBe(true); expect(current.busy).toBe(false);
});

it('media-specific video approval never restores a stale voice preference', async () => {
  const stored = { voice: true, video: false };
  const port = { get: async () => ({ ...stored }), set: unusedSet(),
    setMedia: jest.fn(async (media: 'voice' | 'video', enabled: boolean) => { stored[media] = enabled; }) };
  await render(<Harness port={port} />); await waitFor(() => expect(current.value?.voice).toBe(true));
  stored.voice = false; // A different device withdraws voice after this screen's read.
  await act(async () => { expect(await current.setVideo(true)).toBe(true); });
  expect(port.setMedia).toHaveBeenCalledWith('video', true); expect(port.set).not.toHaveBeenCalled();
  expect(current.value).toEqual({ voice: false, video: true });
});

it('legacy pair-only services cannot opt into video', async () => {
  const port = { get: async () => ({ voice: true, video: false }), set: unusedSet() };
  await render(<Harness port={port} />); await waitFor(() => expect(current.value).not.toBeNull());
  await act(async () => { expect(await current.setVideo(true)).toBe(false); });
  expect(port.set).not.toHaveBeenCalled(); expect(current.error).toBe(true);
});

it('a resolved media write is not success when authoritative readback disagrees', async () => {
  const port = { get: async () => ({ voice: false, video: false }), set: unusedSet(), setMedia: jest.fn(async () => undefined) };
  await render(<Harness port={port} />); await waitFor(() => expect(current.value).not.toBeNull());
  await act(async () => { expect(await current.setVideo(true)).toBe(false); });
  expect(current.value?.video).toBe(false);
  expect(current.error).toBe(true);
});
