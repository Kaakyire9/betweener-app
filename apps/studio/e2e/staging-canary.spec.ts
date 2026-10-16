import { expect, test } from '@playwright/test';

const email = process.env.STUDIO_CANARY_EMAIL;
const password = process.env.STUDIO_CANARY_PASSWORD;
const sessionId = process.env.STUDIO_CANARY_SESSION_ID;

test('staging operator can authenticate and read an approved Stream programme', async ({ page }) => {
  test.skip(!email || !password || !sessionId,
    'Set STUDIO_CANARY_EMAIL, STUDIO_CANARY_PASSWORD and STUDIO_CANARY_SESSION_ID.');

  await page.goto(`/?session=${sessionId}`);
  await page.getByLabel('Email').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: 'Open Studio' }).click();
  await expect(page.getByText('BETWEENER STUDIO').first()).toBeVisible();
  await expect(page.getByTestId('studio-preflight')).toBeVisible();

  // Media publication is intentionally not automatic. An operator must complete
  // MFA and explicitly set STUDIO_CANARY_ALLOW_MEDIA=1 for a supervised canary.
  if (process.env.STUDIO_CANARY_ALLOW_MEDIA === '1') {
    await page.getByRole('button', { name: 'Connect studio media' }).click();
    await expect(page.getByRole('dialog', { name: /Confirm Connect studio media/i })).toBeVisible();
  }
});
