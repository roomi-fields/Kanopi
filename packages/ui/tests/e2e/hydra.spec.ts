import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evalBlockAt, expectNoConsoleErrors, readCanvasLitPixels } from '../helpers';

// Hydra reached through a `.bps` code voice: the program declares a `viz` actor
// whose body is a Hydra backtick (`osc(...).out()`). Evaluating the whole `.bps`
// derives the `viz` terminal, the dispatcher fires its backtick sink, and the
// Hydra adapter paints the full-viewport <canvas class="hydra"> mounted on every
// page load. Assertion: non-black GL pixels after eval.
test('a .bps hydra code voice evaluates and produces non-black GL pixels', async ({ page }) => {
  const noErrors = expectNoConsoleErrors(page);

  const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));
  const program = readFileSync(join(fixturesDir, 'hydra.bps'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await page.evaluate(
    ({ contents }) => {
      const w = window as unknown as {
        __kanopi: {
          workspace: {
            openBundle: (
              f: { path: string; contents: string }[],
              focusPath?: string
            ) => string | null;
            files: { id: string; path: string }[];
            openFile: (id: string) => void;
            setActive: (id: string) => void;
          };
        };
      };
      const ws = w.__kanopi.workspace;
      ws.openBundle([{ path: 'hydra.bps', contents }], 'hydra.bps');
      const target = ws.files.find((f) => f.path === 'hydra.bps');
      if (target) {
        ws.openFile(target.id);
        ws.setActive(target.id);
      }
    },
    { contents: program }
  );

  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // Whole-`.bps` eval — the `viz` backtick fires through the dispatcher sink.
  await evalBlockAt(page, 1);

  // Hydra renders inside a rAF loop; give a few frames before sampling.
  await page.waitForTimeout(700);

  // readCanvasLitPixels reads inside requestAnimationFrame so the back buffer
  // hasn't been wiped by the post-present clear.
  const litPixels = await readCanvasLitPixels(page, 'canvas.hydra');
  expect(litPixels).toBeGreaterThan(100);

  // Ctrl+. clears Hydra (instance.hush()) before yielding.
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);
  noErrors();
});
