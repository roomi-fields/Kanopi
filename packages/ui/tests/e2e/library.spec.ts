import { test, expect } from '@playwright/test';
import { setupAudioCapture, evalBlockAt, expectNoConsoleErrors } from '../helpers';

// End-user path: open the app, switch to Library, click the bundled
// "01 — Strudel solo" starter card, confirm the load dialog, and verify the
// session ended up in the workspace. Unlike the tests under e2e/sessions/
// (which inject via `window.__kanopi.workspace.loadFiles`), this one walks
// the same UI flow a real user would — proving the bundled/*.kanopi files
// reach the Library panel via the ?raw imports added in starters.ts.
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
  await page.locator('button[title="Library"]').click();

  // The LibraryView panel renders one card per STARTERS entry. We added
  // "01 — Strudel solo" at the top of the list; click its `load` button.
  const card = page
    .locator('.card', { has: page.getByText('01 — Strudel solo', { exact: true }) })
    .first();
  await expect(card).toBeVisible({ timeout: 5_000 });
  await card.getByRole('button', { name: 'load' }).click();

  // After load, the .kanopi tab is opened by workspace.loadFiles and the
  // actor file is opened asynchronously by App.svelte's queueMicrotask
  // (see App.svelte:73). We verify via the visible DOM only — the dev-only
  // `window.__kanopi` hatch is not exposed in production builds.
  //
  // The session tab `01-strudel-solo.kanopi` opens first and is set active;
  // the actor tab `01-drums.strudel` appears once the queueMicrotask resolves.
  await expect(page.locator('.tab .name', { hasText: '01-strudel-solo.kanopi' })).toBeVisible({
    timeout: 10_000
  });
  const actorTab = page.locator('.tab', {
    has: page.locator('.name', { hasText: '01-drums.strudel' })
  });
  await expect(actorTab).toBeVisible({ timeout: 10_000 });

  // Activate the actor tab so the editor binds to its document. Without this
  // the session (.kanopi) doc is mounted and evaluating line 4 hits a comment.
  await actorTab.click();
  await expect(actorTab).toHaveClass(/active/, { timeout: 5_000 });

  // CMEditor mounts on the actor file once .cm-content is visible.
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // 01-drums.strudel: lines 1-3 are comments, line 4 is the
  // `note("c3 e3 g3 c4").s("sine").gain(0.7)` block.
  await evalBlockAt(page, 4);

  // The end-user check is "did sound come out" — same threshold + window
  // as session-strudel-solo.spec for consistency.
  const rms = await audio.getMaxRMS(2500);
  expect(rms).toBeGreaterThan(0.001);

  // Hush per feedback_hush_after_test.
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(500);
  noErrors();
});
