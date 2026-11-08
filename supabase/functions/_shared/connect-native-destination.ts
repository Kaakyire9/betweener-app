export interface NativeDestinationJob {
  token_hash: string; token: string; platform: 'ios' | 'android'; user_id: string | null;
  possible_users: string[]; generation: number; lease: string;
}
export async function reconcileNativeDestination(job: NativeDestinationJob, input: {
  remove(token: string, user: string): Promise<void>;
  register(token: string, user: string, platform: 'ios' | 'android'): Promise<void>;
  current(job: NativeDestinationJob): Promise<boolean>;
  complete(job: NativeDestinationJob, success: boolean): Promise<boolean>;
}) {
  let success = false;
  try {
    // Remove every possible former owner before adding the current desired one.
    // Unknown outcomes remain durable and are reconciled again, not assumed done.
    for (const user of new Set(job.possible_users)) await input.remove(job.token, user);
    if (job.user_id) {
      if (!await input.current(job)) throw Error('connect_native_destination_retired');
      await input.register(job.token, job.user_id, job.platform);
    }
    success = true;
  } catch { /* Never log a provider payload or push token. */ }
  if (await input.complete(job, success) !== true) throw Error('connect_native_destination_conflict');
  return { success };
}
