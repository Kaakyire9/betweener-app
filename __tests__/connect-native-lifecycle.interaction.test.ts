import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { createConnectNativeLifecycle } from '@/features/connect/media/native-lifecycle';

const callbacks = new Map<string, (state: AppStateStatus) => void>();
const originalPlatform = Platform.OS;
beforeEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  callbacks.clear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((event, listener) => {
    callbacks.set(event, listener as (state: AppStateStatus) => void);
    return { remove: () => { callbacks.delete(event); } };
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
});

it('Android focus restores foreground after notification-shade blur', () => {
  const observer = jest.fn(), stop = createConnectNativeLifecycle().subscribeAppState(observer);
  callbacks.get('blur')!('active'); expect(observer).toHaveBeenLastCalledWith('inactive');
  callbacks.get('focus')!('active'); expect(observer).toHaveBeenLastCalledWith('active');
  stop(); expect(callbacks.size).toBe(0);
});

it('a delayed Android focus cannot mark a background app active', () => {
  const observer = jest.fn(), stop = createConnectNativeLifecycle().subscribeAppState(observer);
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' });
  callbacks.get('focus')!('active'); expect(observer).toHaveBeenLastCalledWith('background');
  stop();
});

it('iOS uses lifecycle transitions without Android-only window-focus events', () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  const observer = jest.fn(), stop = createConnectNativeLifecycle().subscribeAppState(observer);
  expect([...callbacks.keys()]).toEqual(['change']);
  callbacks.get('change')!('inactive'); expect(observer).toHaveBeenLastCalledWith('inactive');
  callbacks.get('change')!('background'); expect(observer).toHaveBeenLastCalledWith('background');
  stop(); expect(callbacks.size).toBe(0);
});
