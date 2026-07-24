import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupAudioCapture, evalBlockAt, expectNoConsoleErrors } from '../helpers';

// Strudel reached through a `.bps` code voice: the program declares a `beat`
// actor whose body is a Strudel backtick (`note(...).s(...).gain(...)`) plus an
// `@library.strudel "dirt-samples"` bank. Evaluating the whole `.bps` derives
// the `beat` terminal, the dispatcher fires its backtick sink at the scheduled
// time, and the Strudel adapter plays — pure WebAudio, observed by the
// AnalyserNode tap installed by setupAudioCapture.
test('a .bps strudel code voice evaluates and produces audio', async ({ page }) => {
  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));
  const program = readFileSync(join(fixturesDir, 'strudel.bps'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // Load the .bps as a standalone file and focus its editor (dev-only hatch).
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
      ws.openBundle([{ path: 'strudel.bps', contents }], 'strudel.bps');
      const target = ws.files.find((f) => f.path === 'strudel.bps');
      if (target) {
        ws.openFile(target.id);
        ws.setActive(target.id);
      }
    },
    { contents: program }
  );

  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // Ctrl+Enter anywhere evaluates the whole `.bps` (extract-block bpscript case).
  // The first click inside the editor also unlocks the AudioContext under autoplay.
  await evalBlockAt(page, 1);

  // The backtick voice boots Strudel's scheduler and schedules its pattern ahead
  // of the audio clock; the first audible hit lands ~1 cycle later. Sample peak
  // RMS over 2.5s — the sawtooth envelope dips between hits.
  const rms = await audio.getMaxRMS(2500);
  expect(rms).toBeGreaterThan(0.001);

  // Hush per feedback_hush_after_test — the user sits at the machine.
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(500);
  noErrors();
});
