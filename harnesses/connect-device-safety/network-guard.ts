/** Standalone JS-runtime guard. Native/OS egress must ALSO be blocked externally. */
export function installNetworkDeny(target: Record<string, any>, development: boolean) {
  if (!development) throw new Error('device_harness_development_only');
  const attempts: { api: string; at: number }[] = [];
  for (const api of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']) {
    Object.defineProperty(target, api, { configurable: false, writable: false, value: function () {
      attempts.push({ api, at: Date.now() });
      // Deliberately do not retain URLs, headers, bodies or credentials.
      throw new Error('device_harness_network_forbidden');
    } });
  }
  if (target.navigator) Object.defineProperty(target.navigator, 'sendBeacon', {
    configurable: false, writable: false, value() {
      attempts.push({ api: 'sendBeacon', at: Date.now() });
      throw new Error('device_harness_network_forbidden');
    },
  });
  return { snapshot: () => attempts.map(attempt => ({ ...attempt })) };
}
