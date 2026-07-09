import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupAudioCapture, expectNoConsoleErrors } from '../../helpers';

// Scenes — Kanopi's structural differentiator: a scene switch atomically
// swaps what plays. Migrated to the `.bps` multi-file form: the parent
// `scenes.bps` declares `@scene calm "calm.bps"` / `@scene full "full.bps"`
// (compileBPS → sceneTable). The file-scenes effect in App.svelte feeds the
// scenes store from that table; activating a scene loads + plays the
// referenced CHILD `.bps`.
//
// The Scenes cards panel was removed (KAN-UX1) — the user-facing activation
// path is now Alt+1..9 (bindings.ts, same `core.scenes.activate` entry the
// cards delegated to) or the command palette. We drive Alt+1/Alt+2 and assert
// the active scene through the statusbar readout (`scene <name>`,
// Statusbar.svelte), which projects `scenes.active` — exactly one scene at a
// time. calm.bps = drums only, full.bps = drums + lead; audio RMS proves the
// child program actually plays.
test('session 03 - .bps file-scenes switch atomically and play their child program', async ({
  page
}) => {
  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  const fixturesDir = fileURLToPath(new URL('../../fixtures', import.meta.url));
  const scenes = readFileSync(join(fixturesDir, 'scenes.bps'), 'utf8');
  const calm = readFileSync(join(fixturesDir, 'calm.bps'), 'utf8');
  const full = readFileSync(join(fixturesDir, 'full.bps'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // Load the parent .bps + its two child .bps into the workspace and focus the
  // parent — the file-scenes effect in App.svelte feeds the scenes store from
  // the active parent's sceneTable, resolving children against the workspace.
  await page.evaluate(
    ({ parent, child1, child2 }) => {
      const w = window as unknown as {
        __kanopi: {
          workspace: {
            loadFiles: (f: { path: string; contents: string }[], focus?: string) => void;
            files: { id: string; path: string }[];
            openFile: (id: string) => void;
            setActive: (id: string) => void;
          };
        };
      };
      const ws = w.__kanopi.workspace;
      ws.loadFiles(
        [
          { path: 'scenes.bps', contents: parent },
          { path: 'calm.bps', contents: child1 },
          { path: 'full.bps', contents: child2 }
        ],
        'scenes.bps'
      );
      const target = ws.files.find((f) => f.path === 'scenes.bps');
      if (target) {
        ws.openFile(target.id);
        ws.setActive(target.id);
      }
    },
    { parent: scenes, child1: calm, child2: full }
  );

  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // Wait until the sceneTable actually fed the scenes store (calm first, full
  // second — declaration order), so Alt+1/Alt+2 have targets to resolve.
  await page.waitForFunction(() => {
    const w = window as unknown as {
      __kanopi?: { scenes: { list: { name: string }[] } };
    };
    return w.__kanopi?.scenes.list.length === 2;
  });

  // The statusbar projects `scenes.active?.name` next to the "scene" label —
  // the single active-scene authority readout left in the chrome.
  const sceneReadout = page
    .locator('.statusbar .sb-item', { has: page.getByText('scene', { exact: true }) })
    .locator('.accent');
  await expect(sceneReadout).toHaveText('—');

  // Click the editor first — the user gesture that unlocks the AudioContext
  // (the card click used to double as that gesture).
  await page.locator('.cm-content').first().click();

  // Activate `calm` via Alt+1 (bindings.ts — activate scene N).
  await page.keyboard.press('Alt+1');

  // Statusbar flips to the single active scene (atomic — one name at a time).
  await expect(sceneReadout).toHaveText('calm', { timeout: 3_000 });

  // The calm child program (drums) actually plays.
  let rms = await audio.getMaxRMS(2500);
  expect(rms).toBeGreaterThan(0.001);

  // Switch to `full` — active flips atomically, the full child program plays.
  await page.keyboard.press('Alt+2');
  await expect(sceneReadout).toHaveText('full', { timeout: 3_000 });

  rms = await audio.getMaxRMS(2500);
  expect(rms).toBeGreaterThan(0.001);

  // Hush before yielding — Strudel may still be scheduling.
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(500);
  noErrors();
});
