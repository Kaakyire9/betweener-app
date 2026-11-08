/** Existing CallKit/Telecom registration only. Never creates or answers a call. */
export interface OngoingCallPort {
  readonly isSetup: boolean; readonly isOngoingCallsEnabled: boolean; readonly canPostNotifications: boolean;
  isCallTracked(cid: string): boolean;
  setCurrentCallActive(cid: string): Promise<void>;
  acquireBackgroundTask(owner: string): Promise<void>;
  releaseBackgroundTask(owner: string): Promise<void>;
}
export function createOngoingCallLease(input: { cid: string; platform: 'ios' | 'android'; port: OngoingCallPort; current(): boolean }) {
  let enabled = false, retired = false, acquired = false, changing = false, revision = 0;
  const owner = `connect-ongoing:${input.cid}`;
  const current = () => !retired && input.current();
  const release = async () => { enabled = false; if (acquired) { await input.port.releaseBackgroundTask(owner); acquired = false; } };
  return {
    active: () => enabled && current() && input.port.isCallTracked(input.cid),
    async set(enabledRequest: boolean) {
      if (!enabledRequest) { ++revision; await release(); return false; }
      if (changing || !current() || !input.cid.startsWith('betweener_connect:') || !input.port.isSetup
        || !input.port.isOngoingCallsEnabled || !input.port.isCallTracked(input.cid)
        || (input.platform === 'android' && !input.port.canPostNotifications)) throw Error('connect_background_unavailable');
      changing = true;
      const request = ++revision, valid = () => current() && request === revision;
      try {
        await input.port.setCurrentCallActive(input.cid);
        if (!valid()) throw Error('connect_native_owner_retired');
        if (input.platform === 'android') {
          acquired = true; await input.port.acquireBackgroundTask(owner);
          // End may have released while acquisition was still pending. Release
          // again after its acknowledgement, so a late native task cannot leak.
          acquired = true;
        }
        if (!valid() || !input.port.isCallTracked(input.cid)) throw Error('connect_native_owner_retired');
        enabled = true; return true;
      } catch { await release().catch(() => undefined); throw Error('connect_background_unavailable'); }
      finally { changing = false; }
    },
    async dispose() { retired = true; ++revision; await release(); },
  };
}
