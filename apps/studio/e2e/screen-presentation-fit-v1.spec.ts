import { expect, test } from '@playwright/test';

const cards = [
  ...(['portrait_9_16', 'square_1_1', 'landscape_16_9'] as const).flatMap((canvas) =>
    (['auto', 'fit', 'fill'] as const).map((mode) => ({
      id: `fit-lab-${canvas}-${mode}-media-screen_full`,
      file: `${canvas}-${mode}.png`,
    }))).filter(({ file }) => file !== 'portrait_9_16-fit.png'),
  ...(['document', 'presentation', 'subtitle', 'edge_text'] as const).map((fixture) => ({
    id: `fit-lab-portrait_9_16-fit-${fixture}-screen_full`,
    file: `fixture-${fixture}.png`,
  })),
  ...(['screen_plus_host', 'screen_plus_panel', 'screen_discussion'] as const).map((scene) => ({
    id: `fit-lab-landscape_16_9-fit-media-${scene}`,
    file: `${scene}.png`,
  })),
];

test('captures the complete Screen Presentation Fit V1 review book', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto('/?e2eHarness=screen-fit-lab');
  const lab = page.getByTestId('screen-fit-lab');
  await expect(lab).toBeVisible();
  await expect(lab).toHaveScreenshot('screen-presentation-fit-v1-lab.png', {
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
  });
});

for (const card of cards) {
  test(`captures ${card.file}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.goto('/?e2eHarness=screen-fit-lab');
    await expect(page.getByTestId(card.id)).toHaveScreenshot(card.file, {
      animations: 'disabled', caret: 'hide', scale: 'css',
    });
  });
}
