export const nativeSetupTimingFields = ['ownerPreparationMs', 'encryptionPreparationMs', 'providerReadMs', 'keyPreparationMs',
  'mediaJoinMs', 'microphoneInputMs', 'systemCallActivationMs'] as const;
type Stage = typeof nativeSetupTimingFields[number];
export type NativeSetupTimings = Partial<Record<Stage, number | null>>;

/** Process-local observations only. Nested spans overlap and must not be summed.
 * No clock synchronization, network request, payload or native module is used. */
export function createNativeSetupTimings(now = () => globalThis.performance?.now() ?? Date.now()) {
  const values: NativeSetupTimings = {};
  const clock = () => { try { return now(); } catch { return NaN; } };
  const finish = (stage: Stage, start: number) => {
    const end = clock();
    if (!(stage in values)) values[stage] = Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.round(end - start) : null;
  };
  return {
    start: clock, finish,
    async measure<T>(stage: Stage, action: () => Promise<T>): Promise<T> {
      const start = clock();
      try { return await action(); } finally { finish(stage, start); }
    },
    snapshot: (): NativeSetupTimings => ({ ...values }),
  };
}
