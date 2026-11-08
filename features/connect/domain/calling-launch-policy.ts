import type { ConnectAuthorization, ConnectSession } from './connect.ts';

/** First-release admission policy. Intent grants/history remain intact for later use. */
export const callingLaunchPolicy = Object.freeze({ matchedOnly: true });
export const launchAllowsCalling = (authorization: ConnectAuthorization | string, grant: string | null = null) =>
  authorization === 'matched' && grant === null;
export const launchAllowsSession = (call: Pick<ConnectSession, 'authorization' | 'grant_id'>) =>
  launchAllowsCalling(call.authorization, call.grant_id ?? null);
