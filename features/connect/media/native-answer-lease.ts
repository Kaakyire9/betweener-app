/** Explicit system Answer permits one exact call's background setup. It never
 * certifies server admission or camera permission. Native ongoing ownership
 * must take over before this short startup lease expires. */
export function createNativeAnswerLease(current: () => boolean, now = Date.now) {
  let permit: { cid: string; expires: number; ready?: () => void; fulfilled: boolean } | null = null;
  return {
    allowed: (cid: string) => current() && permit?.cid === cid && permit.expires > now(),
    ready(cid: string) {
      if (!current() || permit?.cid !== cid || permit.expires <= now() || permit.fulfilled) return;
      permit.fulfilled=true; permit.ready?.();
    },
    begin(cid: string, ready?: () => void) {
      if (!current() || !/^betweener_connect:[0-9a-f-]{36}$/.test(cid) || permit) throw Error('connect_native_answer_unavailable');
      const own = { cid, expires: now() + 20_000, ready, fulfilled: false }; permit = own;
      return () => { if (permit === own) permit = null; };
    },
  };
}
