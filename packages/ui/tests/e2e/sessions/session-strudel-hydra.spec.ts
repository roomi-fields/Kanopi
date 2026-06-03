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

// Starter session 02 - Strudel + Hydra synced on the shared Kanopi transport.
// Asserts both that audio comes through (RMS > threshold) AND that the Hydra
// canvas has non-black pixels after the visuals are evaluated. This is the
// "first ooh moment" demo - one transport, two runtimes.
const BUNDLED = fileURLToPath(new URL('../../../../library/bundled', import.meta.url));

test('session 02 - strudel + hydra produce audio and visuals on a shared clock', async ({
  page
}) => {
  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  const sessionContents = readFileSync(join(BUNDLED, '02-strudel-hydra.kanopi'), 'utf8');
  const drumsContents = readFileSync(join(BUNDLED, '02-drums.strudel'), 'utf8');
  const vizContents = readFileSync(join(BUNDLED, '02-moire.hydra'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await page.evaluate(
    ({ session, drums, viz }) => {
      const w = window as unknown as {
        __kanopi?: {
          workspace: {
            loadFiles: (f: { path: string; contents: string }[], focus?: string) => void;
          };
        };
      };
      w.__kanopi!.workspace.loadFiles(
        [
          { path: '02-strudel-hydra.kanopi', contents: session },
          { path: '02-drums.strudel', contents: drums },
          { path: '02-moire.hydra', contents: viz }
        ],
        '02-strudel-hydra.kanopi'
      );
    },
    { session: sessionContents, drums: drumsContents, viz: vizContents }
  );

  await page.waitForFunction(() => {
    const w = window as unknown as {
      __kanopi?: { workspace: { files: { path: string }[] } };
    };
    return (
      !!w.__kanopi?.workspace.files.find((f) => f.path === '02-drums.strudel') &&
      !!w.__kanopi?.workspace.files.find((f) => f.path === '02-moire.hydra')
    );
  });

  // Switch to the drums tab and eval the stack(...) block.
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
    const target = w.__kanopi.workspace.files.find((f) => f.path === '02-drums.strudel');
    if (target) {
      w.__kanopi.workspace.openFile(target.id);
      w.__kanopi.workspace.setActive(target.id);
    }
  });
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
  // 02-drums.strudel: lines 1-2 are comments, line 3 starts `stack(...)`.
  await evalBlockAt(page, 3);

  // Switch to the moire tab and eval the osc(...) block.
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
    const target = w.__kanopi.workspace.files.find((f) => f.path === '02-moire.hydra');
    if (target) {
      w.__kanopi.workspace.openFile(target.id);
      w.__kanopi.workspace.setActive(target.id);
    }
  });
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
  // 02-moire.hydra: lines 1-5 are comments, line 6 starts `osc(60, ...)`.
  await evalBlockAt(page, 6);

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
