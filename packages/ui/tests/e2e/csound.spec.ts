import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupAudioCapture, evalBlockAt, expectNoConsoleErrors } from '../helpers';

// Csound is the slowest of the audio runtimes to come up: the wasm module
// loads ~3 MB, the worker handshake takes a beat, and start() doesn't return
// until the engine is actually streaming (csound.ts:136-139). Allocate a
// longer pre-RMS wait than for Strudel / Mercury.
//
// extractBlock for csound walks the Lezer AST (extract-block.ts:67-112): the
// cursor placed inside instr 1…endin returns *that* block to compileOrc,
// which after the first compileCSD has booted the engine works as a live
// instrument redefinition. To boot the engine cleanly on the first eval, we
// position the cursor on the <CsoundSynthesizer> opening (line 1) — that
// falls outside any AST block and the adapter receives the whole file
// (extract-block.ts:24-30), triggering compileCSD which loads instruments
// AND the score f0/i-events (so the two i-event lines in the fixture play).
test('csound evaluates a block and produces audio', async ({ page }) => {
  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));
  const sessionContents = readFileSync(join(fixturesDir, 'csound.kanopi'), 'utf8');
  const actorContents = readFileSync(join(fixturesDir, 'tone.csd'), 'utf8');

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
          { path: 'csound.kanopi', contents: session },
          { path: 'tone.csd', contents: actor }
        ],
        'csound.kanopi'
      );
    },
    { session: sessionContents, actor: actorContents }
  );
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __kanopi?: { workspace: { files: { path: string; id: string }[] } };
    };
    return !!w.__kanopi?.workspace.files.find((f) => f.path === 'tone.csd');
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
    const target = w.__kanopi.workspace.files.find((f) => f.path === 'tone.csd');
    if (target) {
      w.__kanopi.workspace.openFile(target.id);
      w.__kanopi.workspace.setActive(target.id);
    }
  });

  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // Line 1 is `<CsoundSynthesizer>` — outside any AST instrument block, so
  // the extractor returns the whole CSD and the adapter dispatches it
  // through compileCSD (csound.ts:106-111). That path both registers
  // instruments AND runs the score events declared in <CsScore>, which is
  // what makes audible output.
  await evalBlockAt(page, 1);

  // Csound boot path: import wasm → spawn worker → compileCSD → start() →
  // first audio frame. Sample peak RMS over 2s — the score events render
  // their 2-second notes once start() resolves, and we want to catch any
  // peak that lands during that window.
  const rms = await audio.getMaxRMS(2000);
  expect(rms).toBeGreaterThan(0.001);

  await page.keyboard.press('ControlOrMeta+Period');

  // Csound's reset() returns a Promise — let it settle before asserting no
  // console errors. The adapter logs an "info: stopped" line on hush.
  await page.waitForTimeout(300);
  noErrors();
});
