import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  setupAudioCapture,
  evalBlockAt,
  expectNoConsoleErrors,
  readCanvasLitPixels
} from '../helpers';

// A multi-voice `.bps` orchestrator ties two code voices together: `beat`
// (Strudel → audio, with an `@library.strudel "dirt-samples"` bank) and `viz`
// (Hydra → video). Both are armed in one scene (`S -> { beat, viz }`).
// Evaluating the whole `.bps` derives both terminals; the dispatcher fires each
// backtick sink, so Strudel produces audio AND Hydra paints the GL canvas — the
// two-voice cross-runtime path proven end-to-end in a single eval.
test('a multi-voice .bps plays its strudel audio AND hydra video voices', async ({ page }) => {
  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));
  const program = readFileSync(join(fixturesDir, 'multi-actor.bps'), 'utf8');

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
      ws.openBundle([{ path: 'multi-actor.bps', contents }], 'multi-actor.bps');
      const target = ws.files.find((f) => f.path === 'multi-actor.bps');
      if (target) {
        ws.openFile(target.id);
        ws.setActive(target.id);
      }
    },
    { contents: program }
  );

  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // Whole-`.bps` eval — both `beat` (strudel) and `viz` (hydra) backticks fire.
  await evalBlockAt(page, 1);

  // Strudel voice → audio (peak RMS over a window catches the envelope peak).
  const rms = await audio.getMaxRMS(2500);
  expect(rms).toBeGreaterThan(0.001);

  // Hydra voice → non-black GL pixels (rAF-timed readback).
  await page.waitForTimeout(300);
  const litPixels = await readCanvasLitPixels(page, 'canvas.hydra');
  expect(litPixels).toBeGreaterThan(100);

  // Hush + clear before yielding.
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(400);
  noErrors();
});
