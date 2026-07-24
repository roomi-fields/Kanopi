import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupAudioCapture, evalBlockAt, expectNoConsoleErrors } from '../helpers';

// Csound reached through a `.bps` code voice: the program declares a `tone`
// actor whose body is a FULL CSD backtick (orchestra + score). Evaluating the
// whole `.bps` derives the `tone` terminal, the dispatcher fires its backtick
// sink, and the Csound adapter runs compileCSD — which both registers the
// instrument AND runs the <CsScore> i-events, producing audio.
//
// Csound is the slowest audio runtime to come up: the wasm module loads ~3 MB
// and start() doesn't return until the engine is streaming. Allocate a longer
// pre-RMS wait than Strudel.
test('a .bps csound code voice boots the engine and produces audio', async ({ page }) => {
  test.setTimeout(90_000);

  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));
  const program = readFileSync(join(fixturesDir, 'csound.bps'), 'utf8');

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
      ws.openBundle([{ path: 'csound.bps', contents }], 'csound.bps');
      const target = ws.files.find((f) => f.path === 'csound.bps');
      if (target) {
        ws.openFile(target.id);
        ws.setActive(target.id);
      }
    },
    { contents: program }
  );

  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // Whole-`.bps` eval — the `tone` CSD backtick fires through the dispatcher sink.
  await evalBlockAt(page, 1);

  // Csound boot: import wasm → spawn worker → compileCSD → start() → first audio
  // frame. The score's i-events render 2-second notes once the engine streams;
  // sample peak RMS over a wide window to catch a peak during that span (the
  // backtick fires after the dispatcher's first scheduled tick, so allow slack).
  const rms = await audio.getMaxRMS(6000);
  expect(rms).toBeGreaterThan(0.001);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);
  noErrors();
});
