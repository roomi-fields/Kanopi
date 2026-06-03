import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupAudioCapture, evalBlockAt, expectNoConsoleErrors } from '../../helpers';

// Starter session 01 (packages/library/bundled/01-strudel-solo.kanopi) - the
// "no regression vs strudel.cc" demo. Loads the bundled session + its actor
// body, evaluates the `note(...)` block, asserts audio comes through.
//
// Bundled sessions are loaded from disk here (no in-app loader scans the
// bundled/ dir yet; the LibraryView lists `STARTERS` from
// packages/ui/src/lib/library/starters.ts).
const BUNDLED = fileURLToPath(new URL('../../../../library/bundled', import.meta.url));

test('session 01 - strudel solo evaluates and produces audio', async ({ page }) => {
  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  const sessionContents = readFileSync(join(BUNDLED, '01-strudel-solo.kanopi'), 'utf8');
  const actorContents = readFileSync(join(BUNDLED, '01-drums.strudel'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // Inject via the dev-only `window.__kanopi` hatch (main.ts:25-35).
  // loadFiles replaces every file and focuses the .kanopi - the App.svelte
  // effect (lines 73-87) then opens the actor file via queueMicrotask.
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
          { path: '01-strudel-solo.kanopi', contents: session },
          { path: '01-drums.strudel', contents: actor }
        ],
        '01-strudel-solo.kanopi'
      );
    },
    { session: sessionContents, actor: actorContents }
  );

  await page.waitForFunction(() => {
    const w = window as unknown as {
      __kanopi?: { workspace: { files: { path: string }[] } };
    };
    return !!w.__kanopi?.workspace.files.find((f) => f.path === '01-drums.strudel');
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

  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // 01-drums.strudel: lines 1-3 are `//` comments, line 4 is the
  // `note("c3 e3 g3 c4").s("sine").gain(0.7)` block.
  await evalBlockAt(page, 4);

  // Strudel schedules patterns one cycle ahead - peak-sample over 2.5s to
  // catch the loudest moment (see strudel.spec.ts:96-101 for the rationale).
  const rms = await audio.getMaxRMS(2500);
  expect(rms).toBeGreaterThan(0.001);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(500);
  noErrors();
});
