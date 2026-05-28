import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evalBlockAt, expectNoConsoleErrors, readCanvasLitPixels } from '../helpers';

// Hydra is a visual runtime — the assertion is "after eval, the WebGL canvas
// has non-black pixels". The canvas is mounted by HydraCanvas.svelte as a
// fixed full-viewport <canvas class="hydra"> on every page load, regardless
// of session — so we can read it back via gl.readPixels after evaluating
// the actor body.
test('hydra evaluates a patch and produces non-black GL pixels', async ({ page }) => {
  const noErrors = expectNoConsoleErrors(page);

  const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));
  const sessionContents = readFileSync(join(fixturesDir, 'hydra.kanopi'), 'utf8');
  const actorContents = readFileSync(join(fixturesDir, 'viz.hydra'), 'utf8');

  await page.goto('/');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // Inject the fixture via the dev-only `window.__kanopi` hatch installed by
  // main.ts (DEV-guarded). `loadFiles` wipes the starter workspace, focuses
  // the .kanopi session, and the session-tracking effect in App.svelte opens
  // the declared @actor file via queueMicrotask.
  await page.evaluate(
    ({ session, actor }) => {
      const w = window as unknown as {
        __kanopi?: {
          workspace: {
            loadFiles: (f: { path: string; contents: string }[], focus?: string) => void;
          };
        };
      };
      w.__kanopi!.workspace.loadFiles(
        [
          { path: 'hydra.kanopi', contents: session },
          { path: 'viz.hydra', contents: actor }
        ],
        'hydra.kanopi'
      );
    },
    { session: sessionContents, actor: actorContents }
  );

  // Wait for the auto-opened actor file, then switch the active tab to it.
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __kanopi?: { workspace: { files: { path: string }[] } };
    };
    return !!w.__kanopi?.workspace.files.find((f) => f.path === 'viz.hydra');
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
    const target = w.__kanopi.workspace.files.find((f) => f.path === 'viz.hydra');
    if (target) {
      w.__kanopi.workspace.openFile(target.id);
      w.__kanopi.workspace.setActive(target.id);
    }
  });

  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // viz.hydra fixture: lines 1-2 are comment, line 3 is `osc(60, 0.1, 1.5).out()` —
  // the block we want to evaluate.
  await evalBlockAt(page, 3);

  // Hydra renders inside a rAF loop; give a few frames before sampling.
  await page.waitForTimeout(700);

  // readCanvasLitPixels reads inside requestAnimationFrame so the back
  // buffer hasn't been wiped by the post-present clear (Hydra/regl use the
  // default preserveDrawingBuffer:false; a plain readPixels after a settle
  // returns zeros even when the canvas is actually painted).
  const litPixels = await readCanvasLitPixels(page, 'canvas.hydra');
  expect(litPixels).toBeGreaterThan(100);

  // Ctrl+. clears Hydra (instance.hush() — see hydra.ts:181) before yielding.
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);
  noErrors();
});
