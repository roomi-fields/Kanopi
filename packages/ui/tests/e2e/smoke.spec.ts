import { test, expect } from '@playwright/test';
import { expectNoConsoleErrors } from '../helpers';

test('app boots without console errors', async ({ page }) => {
  const assertNoErrors = expectNoConsoleErrors(page);
  await page.goto('/');
  // The IDE shell mounts immediately regardless of whether any file is open:
  // top bar with the KANOPI brand, sidebar list, footer status. No file is
  // opened by default — the editor itself shows "no file open" until you click
  // one in the Files sidebar. We assert the shell is up.
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('no file open').first()).toBeVisible();
  // Give deferred adapters (Strudel imports its core on demand, p5 boots its
  // canvas lazily) a chance to throw before we assert silence.
  await page.waitForTimeout(2000);
  assertNoErrors();
});
