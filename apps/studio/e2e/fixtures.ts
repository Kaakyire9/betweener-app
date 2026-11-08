import { expect, test as base } from '@playwright/test';

// Mocked browser suites must never contact hosted APIs or calling providers.
export const test = base.extend<{ offlineNetworkGuard: void }>({
  offlineNetworkGuard: [async ({ context }, runTest) => {
    const blockedHosts = new Set<string>();
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      // Operational telemetry is a local test stub, never a hosted write.
      if (url.hostname === 'xsgzxadwuxuziubglvps.supabase.co'
        && url.pathname === '/rest/v1/rpc/rpc_studio_record_operational_event_v1') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
      } else if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
        await route.continue();
      } else {
        blockedHosts.add(url.hostname);
        await route.abort('blockedbyclient');
      }
    });
    await runTest();
    expect([...blockedHosts], 'Mocked suites attempted external network access').toEqual([]);
  }, { auto: true }],
});

export { expect };
