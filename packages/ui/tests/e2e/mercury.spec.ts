import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupAudioCapture, evalBlockAt, expectNoConsoleErrors } from '../helpers';

// Mercury runs on Tone.js — its AudioContext is created lazily on the first
// resume() call (mercury.ts:80-85). Since setupAudioCapture patches the
// AudioContext constructor before page.goto, Tone's context (wrapped via
// standard-audio-context) still gets an AnalyserNode tapped at creation.
//
// Mercury treats the entire file as a single eval target (extract-blocks.ts:
// 38-39 and 58-61 — extractWholeFile), so the line we pass to evalBlockAt
// is mostly a cursor-placement matter; the whole .mercury file is sent
// through instance.code(). The `set tempo` directive on line 1 means the
// synth voice is driven at 120 BPM, eighth-note rate.
//
// Mercury's `visual()` hook is intentionally a no-op in Kanopi (mercury.ts:
// 33-35, 51-62). The fixture doesn't use visual(), so the one-shot hint
// won't fire.
test('mercury evaluates a block and produces audio', async ({ page }) => {
  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));
  const sessionContents = readFileSync(join(fixturesDir, 'mercury.kanopi'), 'utf8');
  const actorContents = readFileSync(join(fixturesDir, 'melody.mercury'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await page.evaluate(
    ({ session, actor }) => {
      const w = window as unknown as {
        __kanopi: {
          workspace: {
            loadFiles: (f: { path: string; contents: string }[], focus?: string) => void;
          };
        };
      };
      w.__kanopi.workspace.loadFiles(
        [
          { path: 'mercury.kanopi', contents: session },
          { path: 'melody.mercury', contents: actor }
        ],
        'mercury.kanopi'
      );
    },
    { session: sessionContents, actor: actorContents }
  );
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __kanopi?: { workspace: { files: { path: string; id: string }[] } };
    };
    return !!w.__kanopi?.workspace.files.find((f) => f.path === 'melody.mercury');
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
    const target = w.__kanopi.workspace.files.find((f) => f.path === 'melody.mercury');
    if (target) {
      w.__kanopi.workspace.openFile(target.id);
      w.__kanopi.workspace.setActive(target.id);
    }
  });

  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // Line 3 is the `new synth saw …` declaration. Mercury sends the whole
  // file regardless, but cursor position is required for evalBlockAt.
  await evalBlockAt(page, 3);

  // Mercury via Tone.Transport schedules ahead by ~0.1-0.2s, then plays. At
  // tempo 120 with eighth-note time, a note fires every 250ms. Sample peak
  // RMS over 1.5s — each Tone envelope dips back to silence between hits, so
  // we need a window read rather than a snapshot to catch a peak above the
  // 0.001 threshold.
  const rms = await audio.getMaxRMS(1500);
  expect(rms).toBeGreaterThan(0.001);

  await page.keyboard.press('ControlOrMeta+Period');

  // Mercury's silence() is synchronous; no async error path. 200ms covers
  // the eval-flash detach window and any straggler 'eval ok' log.
  await page.waitForTimeout(200);
  noErrors();
});
