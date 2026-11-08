interface RingingCall { type: string; id: string; cid: string }
interface Permit { cid: string; current(): boolean }
// The entry-point hook may outlive a Fast Refresh of this module. Both copies
// must consult the same permits, whose callbacks still check the live Auth epoch.
const key = Symbol.for('betweener.connect.native-ringing-permits');
const storage = globalThis as unknown as Record<symbol, WeakMap<object, Permit> | undefined>;
const permits = storage[key] ?? (storage[key] = new WeakMap<object, Permit>());

/** A permit belongs to the exact SDK Call object, after server admission. */
export function registerConnectRingingOwner(call: RingingCall, current: () => boolean) {
  if (call.type !== 'betweener_connect' || call.cid !== `betweener_connect:${call.id}` || !current()) {
    throw new Error('connect_native_ringing_owner_invalid');
  }
  if (permits.has(call)) throw new Error('connect_native_ringing_owner_busy');
  const permit = { cid: call.cid, current }; permits.set(call, permit);
  return () => { if (permits.get(call) === permit) permits.delete(call); };
}

/** Entry-point hook: unrelated Live call types retain their existing behaviour.
 * Native incoming is separately gated. A push is never an admission grant. */
export async function assertConnectRingingOwner(call: RingingCall) {
  if (call.type !== 'betweener_connect') return;
  const permit = permits.get(call);
  if (!permit || permit.cid !== call.cid || call.cid !== `betweener_connect:${call.id}` || !permit.current()) {
    throw new Error('connect_native_accept_requires_authority');
  }
}
