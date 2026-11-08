import type { NativeSessionOwner } from '../../../lib/auth/native-session-owner.ts';

/** Headless native events and React acquire the same composition. No second
 * controller, SDK client or token provider may own the same Auth epoch. */
export function createProductLeaseRegistry<T extends { dispose(): Promise<void> }>() {
  const entries = new WeakMap<NativeSessionOwner, { epoch: string; count: number; work: Promise<T>; disposing?: Promise<void> }>();
  const dispose = (entry: { work: Promise<T>; disposing?: Promise<void> }) => entry.disposing ?? (entry.disposing = entry.work.then(value => value.dispose()));
  return async (auth: NativeSessionOwner, build: () => Promise<T>): Promise<T> => {
    const expected = auth.snapshot(); if (!expected) throw Error('connect_unauthenticated');
    let entry = entries.get(auth);
    if (entry && entry.epoch !== expected.generation) {
      entries.delete(auth); void dispose(entry).catch(() => undefined); entry = undefined;
    }
    if (!entry) {
      const work = Promise.resolve().then(build);
      entry = { epoch: expected.generation, count: 0, work }; entries.set(auth, entry);
      const own = entry;
      void work.catch(() => { if (entries.get(auth) === own) entries.delete(auth); });
    }
    const own = entry; own.count++;
    let released = false;
    const release = async () => {
      if (released) return; released = true;
      if (--own.count === 0) { if (entries.get(auth) === own) entries.delete(auth); await dispose(own); }
    };
    try {
      const value = await own.work, current = auth.snapshot();
      if (current?.userId !== expected.userId || current.generation !== expected.generation) throw Error('connect_unauthenticated');
      return { ...value, dispose: release };
    } catch (error) { await release().catch(() => undefined); throw error; }
  };
}
