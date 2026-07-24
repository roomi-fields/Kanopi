import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  setupAudioCapture,
  evalBlockAt,
  expectNoConsoleErrors,
  readCanvasLitPixels
} from '../../helpers';

// Starter session 02 - Strudel + Hydra synced on the shared Kanopi transport,
// now a self-contained `.bps`: both code voices (Strudel → audio, Hydra →
// video) are inlined as backticks and routed by the lot-4 cross-runtime path
// (compileBPS → BPx → backtick sink → strudel/hydra adapters). Asserts both
// that audio comes through (RMS > threshold) AND that the Hydra canvas has
// non-black pixels after one evaluation of the whole session. This is the
// "first ooh moment" demo - one transport, two runtimes - and doubles as the
// lot-4 backtick-routing acceptance test for 02.
const BUNDLED = fileURLToPath(new URL('../../../../library/scenes/code-voices', import.meta.url));

test('session 02 - strudel + hydra produce audio and visuals on a shared clock', async ({
  page
}) => {
  // This is the only starter that boots BOTH a Strudel scheduler AND a Hydra
  // GL canvas in the same page. On the user's WSL2 dev box the cumulative
  // cost (goto + evalBlockAt with its flash-appear/detach waits + 700ms
  // hydra-rAF settle + 2.5s peak-RMS sample) routinely consumes 28-32s of
  // wall clock — exceeding Playwright's 30s default and flaking the test.
  // The full-suite library spec uses the same 60-90s budget for the same
  // reason; we mirror it here with margin.
  test.setTimeout(90_000);

  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  const sessionContents = readFileSync(join(BUNDLED, '02-strudel-hydra.bps'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await page.evaluate((session) => {
    const w = window as unknown as {
      __kanopi?: {
        workspace: {
          openBundle: (
            f: { path: string; contents: string }[],
            focusPath?: string
          ) => string | null;
        };
      };
    };
    w.__kanopi!.workspace.openBundle(
      [{ path: '02-strudel-hydra.bps', contents: session }],
      '02-strudel-hydra.bps'
    );
  }, sessionContents);

  await page.waitForFunction(() => {
    const w = window as unknown as {
      __kanopi?: { workspace: { files: { path: string }[] } };
    };
    return !!w.__kanopi?.workspace.files.find((f) => f.path === '02-strudel-hydra.bps');
  });

  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // One `.bps` block: evaluating the whole session places BOTH backtick voices
  // in time — the Strudel voice fires the strudel adapter, the Hydra voice the
  // hydra adapter, on the same transport.
  await evalBlockAt(page, 5);

  // Hydra needs a few frames inside rAF before the back-buffer is paintful.
  await page.waitForTimeout(700);

  const litPixels = await readCanvasLitPixels(page, 'canvas.hydra');
  expect(litPixels).toBeGreaterThan(100);

  // Audio: peak-sample over 2.5s.
  const rms = await audio.getMaxRMS(2500);
  expect(rms).toBeGreaterThan(0.001);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(500);
  noErrors();
});
