import { test, expect } from '@playwright/test';
import { setupAudioCapture, evalBlockAt, expectNoConsoleErrors } from '../helpers';

// Lot 3 — at least one working demo per category. The BPScript category is
// populated from the shared catalogue; loading one from the library space and
// evaluating it produces audio through the BPScript adapter.
test('a BPScript demo loads from the library and plays', async ({ page }) => {
  // The library load replaces the workspace behind a confirm() — accept it.
  page.on('dialog', (d) => d.accept());
  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await page.locator('.ab-btn[title="Library"]').click();
  await page.locator('.cat', { hasText: 'BPScript' }).click();
  // The BPScript category carries the bundled demos.
  await expect(page.locator('.card').first()).toBeVisible();

  // Load the polymetric-rhythm demo (plain western notes — renders correctly).
  await page.locator('.search').fill('polymetric');
  await expect(page.locator('.card')).toHaveCount(1);
  await page.locator('.card .load').click();

  // Back in the editor with the .bps open; evaluate it.
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
  await evalBlockAt(page, 1);

  const rms = await audio.getMaxRMS(2500);
  expect(rms).toBeGreaterThan(0.001);

  await page.keyboard.press('ControlOrMeta+Period'); // hush
  await page.waitForTimeout(200);
  noErrors();
});
