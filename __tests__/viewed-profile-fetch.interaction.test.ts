import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useState } from 'react';

import { useViewedProfileFetch } from '@/hooks/use-viewed-profile-fetch';
import type { FetchViewedProfileOptions } from '@/lib/profile/fetch-viewed-profile';
import type { UserProfile } from '@/types/user-profile';

const mockFetch = jest.fn<(options: FetchViewedProfileOptions) => Promise<UserProfile>>();
const mockWrite = jest.fn<() => Promise<void>>();
const mockWarn = jest.fn();
jest.mock('@/lib/profile/fetch-viewed-profile', () => ({
  fetchViewedProfile: (options: FetchViewedProfileOptions) => mockFetch(options),
}));
jest.mock('@/lib/offline/profile-store', () => ({
  mergeViewedProfileSnapshots: (...profiles: (UserProfile | null)[]) => Object.assign({}, ...profiles.filter(Boolean)),
  writeViewedProfileSnapshot: () => mockWrite(),
}));
jest.mock('@/lib/telemetry/logger', () => ({ logger: { warn: (...args: unknown[]) => mockWarn(...args) } }));

const profile = (id = 'profile-a', extra: Partial<UserProfile> = {}) => ({
  id, name: 'Fixture', age: 28, location: '', profilePicture: '', photos: [],
  occupation: '', education: '', verified: false, bio: '', ...extra,
}) as UserProfile;
const options = () => ({
  profileId: 'profile-a', viewerProfileId: 'viewer-a', cachedProfile: null as UserProfile | null,
  fallbackProfile: null as UserProfile | null, useCache: true, retryNonce: 0,
  onCacheUpdate: jest.fn<(value: UserProfile) => void>(),
});
function deferred() {
  let resolve!: (value: UserProfile) => void;
  const promise = new Promise<UserProfile>((complete) => { resolve = complete; });
  return { promise, resolve };
}

describe('viewed profile request lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockFetch.mockReset().mockRejectedValue(new Error('Unexpected additional request'));
    mockWrite.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

  it('does not refetch when its successful result updates the parent cache', async () => {
    const fetched = profile();
    mockFetch.mockResolvedValueOnce(fetched);
    const initial = options();
    const view = await renderHook(() => {
      const [cachedProfile, setCachedProfile] = useState<UserProfile | null>(null);
      return useViewedProfileFetch({ ...initial, cachedProfile, onCacheUpdate: setCachedProfile });
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(view.result.current.fetchedProfile?.id).toBe('profile-a');
    expect(view.result.current.fetching).toBe(false);
    await view.unmount();
  });

  it('uses cache hydrated during a request without starting a second request', async () => {
    const pending = deferred();
    mockFetch.mockReturnValueOnce(pending.promise);
    const initial = options();
    const view = await renderHook(useViewedProfileFetch, { initialProps: initial });
    await view.rerender({ ...initial, cachedProfile: profile('profile-a', { occupation: 'Engineer' }) });
    await act(async () => { pending.resolve(profile()); });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(initial.onCacheUpdate).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it('discards an old completion after changing profiles and supports an explicit retry', async () => {
    const old = deferred();
    const current = deferred();
    mockFetch.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise).mockResolvedValueOnce(profile('profile-b'));
    const initial = options();
    const view = await renderHook(useViewedProfileFetch, { initialProps: initial });
    const next = { ...initial, profileId: 'profile-b' };
    await view.rerender(next);
    await act(async () => { old.resolve(profile()); });
    expect(initial.onCacheUpdate).not.toHaveBeenCalled();
    expect(view.result.current.fetching).toBe(true);
    await act(async () => { current.resolve(profile('profile-b')); });
    expect(view.result.current.fetchedProfile?.id).toBe('profile-b');
    expect(initial.onCacheUpdate).toHaveBeenCalledTimes(1);
    await view.rerender({ ...next, retryNonce: 1 });
    expect(mockFetch).toHaveBeenCalledTimes(3);
    await view.unmount();
  });

  it('reports a slow request and recovers when it completes', async () => {
    const pending = deferred();
    mockFetch.mockReturnValueOnce(pending.promise);
    const view = await renderHook(useViewedProfileFetch, { initialProps: options() });
    await act(async () => { jest.advanceTimersByTime(12_000); });
    expect(view.result.current.fetchWatchdogError?.message).toBe('profile_view_timeout');
    expect(view.result.current.fetching).toBe(false);
    await act(async () => { pending.resolve(profile()); });
    expect(view.result.current.fetchWatchdogError).toBeNull();
    expect(view.result.current.fetchedProfile?.id).toBe('profile-a');
    await view.unmount();
  });

  it('clears its watchdog and ignores completion after unmount', async () => {
    const scheduled = jest.spyOn(global, 'setTimeout');
    const cancelled = jest.spyOn(global, 'clearTimeout');
    const pending = deferred();
    mockFetch.mockReturnValueOnce(pending.promise);
    const initial = options();
    const view = await renderHook(useViewedProfileFetch, { initialProps: initial });
    const watchdogIndex = scheduled.mock.calls.findIndex((call) => call[1] === 12_000);
    expect(watchdogIndex).toBeGreaterThanOrEqual(0);
    const watchdog = scheduled.mock.results[watchdogIndex].value as ReturnType<typeof setTimeout>;
    await view.unmount();
    expect(cancelled).toHaveBeenCalledWith(watchdog);
    await act(async () => { jest.advanceTimersByTime(20_000); pending.resolve(profile()); });
    expect(mockWarn).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
    expect(initial.onCacheUpdate).not.toHaveBeenCalled();
  });

  it('does not fetch preview profiles or discard a fetched result on a cache-write failure', async () => {
    mockFetch.mockResolvedValueOnce(profile());
    mockWrite.mockRejectedValueOnce(new Error('Storage unavailable'));
    const initial = options();
    const view = await renderHook(useViewedProfileFetch, { initialProps: { ...initial, profileId: 'preview' } });
    expect(mockFetch).not.toHaveBeenCalled();
    await view.rerender(initial);
    expect(view.result.current.fetchedProfile?.id).toBe('profile-a');
    expect(view.result.current.fetchWatchdogError).toBeNull();
    await view.unmount();
  });
});
