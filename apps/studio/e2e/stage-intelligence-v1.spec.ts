import { expect, test } from './fixtures';

const scenarios = [
  ['host-1', 'Host focus'],
  ['host-2', 'Host + guest'],
  ['host-5', 'Host-led six'],
  ['screen', 'Screen + panel'],
  ['pair', 'Pair focus'],
  ['pool', 'Host + room'],
  ['pulse', 'Audience pulse'],
  ['quiet', 'Odo moment'],
] as const;

for (const [scenario, expectedFirst] of scenarios) {
  test(`${scenario} shows contextual ranked recommendations`, async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 760 });
    await page.goto(`/?e2eHarness=stage-intelligence-v1&scenario=${scenario}`);
    const review = page.getByTestId('stage-intelligence-review');
    const recommendations = page.getByTestId('stage-intelligence-v1');
    await expect(review).toBeVisible();
    await expect(recommendations.getByTestId('stage-recommendation-1')).toContainText(expectedFirst);
    const expectedCount = scenario === 'quiet' || scenario === 'host-1' ? 1
      : scenario === 'host-2' || scenario === 'pulse' ? 2 : 3;
    await expect(recommendations.locator('.stage-recommendation-card')).toHaveCount(expectedCount);
    await expect(recommendations.locator('.stage-safety-fallback')).toContainText('Branded intermission');
    await expect(review).toHaveScreenshot(`stage-intelligence-${scenario}.png`, {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    });
  });
}
