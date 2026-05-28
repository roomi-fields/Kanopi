import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupAudioCapture, evalBlockAt, expectNoConsoleErrors } from '../helpers';

// Strudel is the easiest of the three to bring up — it's pure WebAudio under
// the hood, AudioContext unlocks on the first user gesture (we click the
// editor before eval), and audio is rendered on the main thread so the
// AnalyserNode tap installed by setupAudioCapture observes it directly.
//
// The eval-block detector at packages/ui/src/components/editor/CMEditor.svelte
// uses paragraph extraction for Strudel: a blank-line-delimited block under
// the cursor. The fixture's evaluable block sits on line 4 (the note(...)
// call); the cursor is moved there via CM's view API rather than synthetic
// arrow presses (helpers.ts:135-148).
test('strudel evaluates a block and produces audio', async ({ page }) => {
  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));
  const sessionContents = readFileSync(join(fixturesDir, 'strudel.kanopi'), 'utf8');
  const actorContents = readFileSync(join(fixturesDir, 'beat.strudel'), 'utf8');

  await page.goto('/');
  // Shell is ready when the KANOPI brand is visible — same gate smoke.spec uses.
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // Push the session + actor body into the workspace via the dev-only handle
  // installed by main.ts:25-35. `loadFiles` replaces everything, focuses the
  // .kanopi session, and the App.svelte effect (lines 73-87) opens the actor
  // file in a tab through queueMicrotask. We then explicitly setActive on the
  // actor file so the CMEditor mounts on its body — the Mod-Enter handler in
  // CMEditor.svelte:137-144 evaluates *blocks* on a non-.kanopi file, but
  // would only *activate a scene* on a .kanopi one (so we must be on the
  // actor file before triggering eval).
  await page.evaluate(
    ({ session, actor }) => {
      const w = window as unknown as {
        __kanopi?: {
          workspace: {
            loadFiles: (f: { path: string; contents: string }[], focus?: string) => void;
            files: { id: string; path: string }[];
            setActive: (id: string) => void;
          };
        };
      };
      const ws = w.__kanopi!.workspace;
      ws.loadFiles(
        [
          { path: 'strudel.kanopi', contents: session },
          { path: 'beat.strudel', contents: actor }
        ],
        'strudel.kanopi'
      );
    },
    { session: sessionContents, actor: actorContents }
  );
  // The actor tab is opened asynchronously by App.svelte's queueMicrotask;
  // wait for the file to be present, then switch the active tab to it.
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __kanopi?: { workspace: { files: { path: string; id: string }[] } };
    };
    return !!w.__kanopi?.workspace.files.find((f) => f.path === 'beat.strudel');
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
    const target = w.__kanopi.workspace.files.find((f) => f.path === 'beat.strudel');
    if (target) {
      w.__kanopi.workspace.openFile(target.id);
      w.__kanopi.workspace.setActive(target.id);
    }
  });

  // Wait for CMEditor to mount on the actor file — `.cm-content` only exists
  // once the editor view is created (CMEditor.svelte:208).
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // Eval the block at line 4 (the note(...).s(...).gain(...) statement,
  // directly after the leading comments). The Strudel adapter's `return (...)`
  // wrapping defeats ASI so leading `//` comments are now safe; the paragraph
  // extractor returns comments + note together, and the wrapper evaluates the
  // expression correctly. The first click inside the editor also satisfies
  // the user-gesture requirement to unlock the AudioContext under autoplay.
  await evalBlockAt(page, 4);

  // Strudel boots its scheduler then schedules patterns ahead of the audio
  // clock. The first audible sound lands one cycle later, which at the
  // default cps (~0.5) is ~2s. Sample peak RMS over a 2.5s window — the
  // sawtooth's envelope dips between hits, so a point-in-time read races
  // against zero crossings.
  const rms = await audio.getMaxRMS(2500);
  expect(rms).toBeGreaterThan(0.001);

  // Hush per feedback_hush_after_test — the user sits at the machine.
  await page.keyboard.press('ControlOrMeta+Period');

  // Strudel's onEvalError fires DURING evaluate() but it also has a delayed
  // 'strudel.log' DOM-event path (strudel.ts:510-525) that could surface
  // after we left evalBlockAt. Give it 500ms of grace before asserting.
  await page.waitForTimeout(500);
  noErrors();
});
