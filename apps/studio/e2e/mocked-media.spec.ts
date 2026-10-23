import { expect, test } from '@playwright/test';

test('preflight validates mocked camera, microphone and network readiness', async ({ page }) => {
  await page.addInitScript(() => {
    const makeTrack = (kind: 'audio' | 'video') => ({ kind, stop: () => undefined });
    const stream = {
      getTracks: () => [makeTrack('video'), makeTrack('audio')],
      getVideoTracks: () => [makeTrack('video')],
      getAudioTracks: () => [makeTrack('audio')],
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => stream },
    });
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { downlink: 10, effectiveType: '4g' },
    });
  });

  await page.goto('/?e2eHarness=preflight');
  await expect(page.getByTestId('preflight-result')).toHaveText('not-ready');
  await page.getByRole('button', { name: /Run camera, mic and network checks/i }).click();
  await expect(page.getByTestId('preflight-result')).toHaveText('ready');
  await expect(page.getByTestId('studio-preflight')).toContainText('Passed');
});

test('preflight blocks publishing readiness when microphone permission fails', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => { throw new DOMException('Denied', 'NotAllowedError'); } },
    });
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { downlink: 10, effectiveType: '4g' },
    });
  });
  await page.goto('/?e2eHarness=preflight');
  await page.getByRole('button', { name: /Run camera, mic and network checks/i }).click();
  await expect(page.getByTestId('preflight-result')).toHaveText('not-ready');
  await expect(page.getByTestId('studio-preflight')).toContainText('fail');
});
