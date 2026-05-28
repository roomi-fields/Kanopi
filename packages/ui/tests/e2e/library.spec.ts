import { test, expect } from '@playwright/test';
import { setupAudioCapture, evalBlockAt, expectNoConsoleErrors } from '../helpers';

// End-user path: open the app, switch to Library, click the bundled
// "01 — Strudel solo" starter card, confirm the load dialog, and verify the
// session ended up in the workspace. Unlike the tests under e2e/sessions/
// (which inject via `window.__kanopi.workspace.loadFiles`), this one walks
// the same UI flow a real user would — proving the bundled/*.kanopi files
// reach the Library panel via the ?raw imports added in starters.ts.
test('library: bundled starter loads via the Library panel and evaluates', async ({ page }) => {
  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  // LibraryView.load() uses window.confirm() — auto-accept it.
  page.on('dialog', (dialog) => {
    void dialog.accept();
  });

  await page.goto('/');
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
  // actor file is opened asynchronously by App.svelte's queueMicrotask.
  // Wait for both files to be present in the workspace, then switch the
  // editor to the actor body before evaluating.
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __kanopi?: { workspace: { files: { path: string }[] } };
    };
    const paths = w.__kanopi?.workspace.files.map((f) => f.path) ?? [];
    return paths.includes('01-strudel-solo.kanopi') && paths.includes('01-drums.strudel');
  });
  await page.evaluate(() => {
    const w = window as unknown as {
      __kanopi: {
        workspace: {
          files: { id: string; path: string }[];
          openFile: (id: string) => void;
          setActive: (id: string) => void;
        };
      };
    };
    const target = w.__kanopi.workspace.files.find((f) => f.path === '01-drums.strudel');
    if (target) {
      w.__kanopi.workspace.openFile(target.id);
      w.__kanopi.workspace.setActive(target.id);
    }
  });

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
