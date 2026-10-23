import { expect, test } from '@playwright/test';

const reviewStates = [
  ['people', 'portrait_9_16'],
  ['people', 'landscape_16_9'],
  ['screen', 'portrait_9_16'],
  ['screen', 'landscape_16_9'],
  ['moments', 'portrait_9_16'],
  ['moments', 'landscape_16_9'],
  ['states', 'portrait_9_16'],
  ['states', 'landscape_16_9'],
] as const;

for (const [review, canvas] of reviewStates) {
  test(`captures ${review} ${canvas} visual review book`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.goto(`/?e2eHarness=m2-preview&review=${review}&canvas=${canvas}`);
    const book = page.getByTestId('m2-review-book');
    await expect(book).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(book).toHaveScreenshot(`m2-${review}-${canvas}.png`, {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    });
  });
}
