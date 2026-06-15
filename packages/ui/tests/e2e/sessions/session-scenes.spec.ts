import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupAudioCapture, expectNoConsoleErrors } from '../../helpers';

// Scenes panel — Kanopi's structural differentiator: a scene switch atomically
// swaps what plays. Migrated to the `.bps` multi-file form: the parent
// `scenes.bps` declares `@scene calm "calm.bps"` / `@scene full "full.bps"`
// (compileBPS → sceneTable). Kanopi feeds the right-panel Scenes cards from that
// table; activating a card loads + plays the referenced CHILD `.bps`.
//
// calm.bps = drums only, full.bps = drums + lead. We assert the cards render,
// activation flips the active card atomically, and the child program actually
// plays (audio RMS) — the scene IS the child here, so audio proves activation
// armed the right program.
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
  // parent — the file-scenes effect in App.svelte feeds the Scenes panel from
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

  // RightPanel defaults to the Actors tab; ScenesPanel only mounts on the Scenes
  // tab. Switch before asserting on `.scenes .card`.
  await page.locator('.rp-tab', { hasText: 'Scenes' }).click();
  await expect(page.locator('.scenes')).toBeVisible({ timeout: 2_000 });
  await expect(page.locator('.scenes .card .name', { hasText: 'calm' })).toBeVisible();
  await expect(page.locator('.scenes .card .name', { hasText: 'full' })).toBeVisible();

  // Activate `calm` — the click is also the user gesture that unlocks the
  // AudioContext (handleSceneActivate starts the clock, then evals the child).
  const calmCard = page.locator('.scenes .card', {
    has: page.locator('.name', { hasText: 'calm' })
  });
  const fullCard = page.locator('.scenes .card', {
    has: page.locator('.name', { hasText: 'full' })
  });
  await calmCard.click();

  // Card picks up `.active` (atomic — only one scene active at a time).
  await expect(calmCard).toHaveClass(/active/, { timeout: 3_000 });
  await expect(fullCard).not.toHaveClass(/active/);

  // The calm child program (drums) actually plays.
  let rms = await audio.getMaxRMS(2500);
  expect(rms).toBeGreaterThan(0.001);

  // Switch to `full` — active flips atomically, the full child program plays.
  await fullCard.click();
  await expect(fullCard).toHaveClass(/active/, { timeout: 3_000 });
  await expect(calmCard).not.toHaveClass(/active/);

  rms = await audio.getMaxRMS(2500);
  expect(rms).toBeGreaterThan(0.001);

  // Hush before yielding — Strudel may still be scheduling.
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(500);
  noErrors();
});
