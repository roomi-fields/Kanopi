import { test, expect } from '@playwright/test';
import { setupAudioCapture, evalBlockAt, expectNoConsoleErrors } from '../helpers';

// End-user path: open the app, switch to Library, click the bundled
// "01 — Strudel solo" starter card, confirm the load dialog, and verify the
// session ended up in the workspace. Unlike the tests under e2e/sessions/
// (which inject via `window.__kanopi.workspace.openBundle`), this one walks
// the same UI flow a real user would — proving the bundled starter files
// reach the Library panel via the ?raw imports in starters.ts. Starter 01 is
// now a self-contained `.bps` (lot 4): one file, evaluated in place.
test('library: bundled starter loads via the Library panel and evaluates', async ({ page }) => {
  // Prod adds ~10-15s of network latency over dev (Strudel core lazy-loaded,
  // SW warm-up, HTTPS handshake). Bump per-test timeout to 60s so the full
  // load-evaluate-audio-RMS chain fits with margin against the live URL.
  test.setTimeout(60_000);

  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  // LibraryView.load() uses window.confirm() — auto-accept it.
  page.on('dialog', (dialog) => {
    void dialog.accept();
  });

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // Activity bar button: every entry renders an <ActivityItem> whose
  // <button> carries the `title` attribute set in ActivityBar.svelte. The
  // `title=Library` selector is stable.
  await page.locator('button[title="Factory"]').click();

  // The LibraryView panel renders one card per STARTERS entry. We added
  // "01 — Strudel solo" at the top of the list; click its `load` button.
  const card = page
    .locator('.card', { has: page.getByText('01 — Strudel solo', { exact: true }) })
    .first();
  await expect(card).toBeVisible({ timeout: 5_000 });
  await card.getByRole('button', { name: 'load' }).click();

  // After load, the self-contained `.bps` tab is opened and set active by
  // workspace.openBundle. We verify via the visible DOM only — the dev-only
  // `window.__kanopi` hatch is not exposed in production builds.
  const sessionTab = page.locator('.tab', {
    has: page.locator('.name', { hasText: '01-strudel-solo.bps' })
  });
  await expect(sessionTab).toBeVisible({ timeout: 10_000 });
  await sessionTab.click();
  await expect(sessionTab).toHaveClass(/active/, { timeout: 5_000 });

  // CMEditor mounts on the `.bps` once .cm-content is visible.
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // A `.bps` is one runnable block; Ctrl+Enter on any line evaluates the whole
  // session — the inlined Strudel backtick voice is placed in time and fires
  // the Strudel adapter (lot-4 cross-runtime routing).
  await evalBlockAt(page, 5);

  // The end-user check is "did sound come out" — same threshold + window
  // as session-strudel-solo.spec for consistency.
  const rms = await audio.getMaxRMS(2500);
  expect(rms).toBeGreaterThan(0.001);

  // Hush per feedback_hush_after_test.
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(500);
  noErrors();
});
