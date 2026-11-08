import { createNativeSessionOwner } from './native-session-owner.ts';
const name = Symbol.for('betweener.auth.native-session');
const storage = globalThis as unknown as Record<symbol, ReturnType<typeof createNativeSessionOwner> | undefined>;
/** React and a native cold-start event share the same trusted Auth epoch. */
export const getApplicationNativeSession = () => storage[name] ?? (storage[name] = createNativeSessionOwner());
