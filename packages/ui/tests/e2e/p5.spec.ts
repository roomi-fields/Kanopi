import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evalBlockAt, expectNoConsoleErrors } from '../helpers';

// p5 is a visual runtime. The adapter (packages/ui/src/lib/runtimes/p5.ts)
// mounts its container as a fixed full-viewport <div class="p5">; p5 in
// instance mode appends its <canvas> inside that container on evaluate().
test('p5 evaluates a sketch and paints non-background pixels', async ({ page }) => {
  const noErrors = expectNoConsoleErrors(page);

  const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));
  const sessionContents = readFileSync(join(fixturesDir, 'p5.kanopi'), 'utf8');
  const actorContents = readFileSync(join(fixturesDir, 'sketch.p5'), 'utf8');

  await page.goto('/');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // Same dev-hatch injection pattern as the strudel/hydra specs.
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
          { path: 'p5.kanopi', contents: session },
          { path: 'sketch.p5', contents: actor }
        ],
        'p5.kanopi'
      );
    },
    { session: sessionContents, actor: actorContents }
  );

  await page.waitForFunction(() => {
    const w = window as unknown as {
      __kanopi?: { workspace: { files: { path: string }[] } };
    };
    return !!w.__kanopi?.workspace.files.find((f) => f.path === 'sketch.p5');
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
    const target = w.__kanopi.workspace.files.find((f) => f.path === 'sketch.p5');
    if (target) {
      w.__kanopi.workspace.openFile(target.id);
      w.__kanopi.workspace.setActive(target.id);
    }
  });

  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // sketch.p5 fixture: comment header on lines 1-3, then `function setup()`
  // at line 4 — evaluating the surrounding paragraph block lifts setup/draw
  // onto the p5 instance via the adapter's `buildSketchBody` capture suffix.
  await evalBlockAt(page, 4);

  // Give p5 enough time to construct the instance, run setup, and produce
  // a first frame.
  await page.waitForTimeout(700);

  const litPixels = await page.evaluate(() => {
    const canvas = document.querySelector('.p5 canvas') as HTMLCanvasElement | null;
    if (!canvas) return -1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return -2;
    const w = Math.min(64, canvas.width);
    const h = Math.min(64, canvas.height);
    const x = Math.max(0, Math.floor(canvas.width / 2) - w / 2);
    const y = Math.max(0, Math.floor(canvas.height / 2) - h / 2);
    const img = ctx.getImageData(x, y, w, h);
    let lit = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      if (img.data[i] > 16 || img.data[i + 1] > 16 || img.data[i + 2] > 16) lit++;
    }
    return lit;
  });

  expect(litPixels).toBeGreaterThan(100);

  // REEVAL_DEDUP_MS=50 guard (p5.ts:58): two evals within 50ms must collapse
  // into one. We can't easily trigger them <50ms apart through the keymap;
  // back-to-back evalBlockAt is well above 50ms but still tests that a normal
  // re-eval keeps exactly one canvas (the previous instance is removed in
  // p5.ts:190-198).
  await evalBlockAt(page, 4);
  await page.waitForTimeout(300);
  const canvasCount = await page.locator('.p5 canvas').count();
  expect(canvasCount).toBe(1);

  // Ctrl+. stops the p5 instance + removes the canvas (p5.ts:219-237).
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);
  noErrors();
});
