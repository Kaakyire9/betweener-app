interface MediaEngine { dispose(): Promise<boolean> }
type EngineProvider = () => MediaEngine | Promise<MediaEngine>;

/** Installed only while Connect holds the process-wide native lease. */
export function createNativeMediaEngineOwner(create: EngineProvider) {
  const engines = new Set<{ dispose(): Promise<boolean>; complete: boolean }>();
  const creating = new Set<Promise<MediaEngine>>();
  let retired = false;
  const provider = (): Promise<MediaEngine> => {
    if (retired) return Promise.reject(new Error('connect_native_owner_retired'));
    const pending = Promise.resolve().then(create).then(engine => {
      let operation: Promise<boolean> | null = null;
      const owned = { complete: false, dispose(): Promise<boolean> {
        if (owned.complete) return Promise.resolve(true);
        if (operation) return operation;
        operation = Promise.resolve().then(() => engine.dispose()).then(disposed => {
          if (disposed !== true) throw new Error('connect_native_factory_release_unconfirmed');
          owned.complete = true; return true;
        }).finally(() => { operation = null; });
        return operation;
      } };
      engines.add(owned); return owned;
    });
    creating.add(pending);
    // Retain failed allocations too: their native side effects are unknown.
    void pending.then(() => { creating.delete(pending); }, () => undefined);
    return pending;
  };
  return { provider, async release() {
    retired = true;
    await Promise.all([...creating]);
    await Promise.all([...engines].map(engine => engine.dispose()));
  } };
}
