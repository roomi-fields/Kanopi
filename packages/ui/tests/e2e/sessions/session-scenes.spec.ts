import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectNoConsoleErrors } from '../../helpers';

// Starter session 03 - two scenes, one session. Demonstrates Kanopi's
// structural differentiator: a scene switch atomically arms a different set
// of actors. The test exercises the click path (Scenes panel card) and
// asserts the active scene + armed actor state after each switch.
//
// Audio is left to play briefly between switches but RMS is not asserted -
// session 01 already covers "audio comes through". Here we care about the
// structural state.
const BUNDLED = fileURLToPath(new URL('../../../../library/bundled', import.meta.url));

test('session 03 - scenes A/B switch atomically arms different actor sets', async ({ page }) => {
  const noErrors = expectNoConsoleErrors(page);

  const sessionContents = readFileSync(join(BUNDLED, '03-scenes-A-B.kanopi'), 'utf8');
  const drumsContents = readFileSync(join(BUNDLED, '03-drums.strudel'), 'utf8');
  const leadContents = readFileSync(join(BUNDLED, '03-lead.strudel'), 'utf8');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await page.evaluate(
    ({ session, drums, lead }) => {
      const w = window as unknown as {
        __kanopi?: {
          workspace: {
            loadFiles: (f: { path: string; contents: string }[], focus?: string) => void;
          };
        };
      };
      w.__kanopi!.workspace.loadFiles(
        [
          { path: '03-scenes-A-B.kanopi', contents: session },
          { path: '03-drums.strudel', contents: drums },
          { path: '03-lead.strudel', contents: lead }
        ],
        '03-scenes-A-B.kanopi'
      );
    },
    { session: sessionContents, drums: drumsContents, lead: leadContents }
  );

  // Both actors render in the ActorsPanel (li.actor / .name).
  await expect(page.locator('li.actor .name', { hasText: 'drums' })).toBeVisible({
    timeout: 5_000
  });
  await expect(page.locator('li.actor .name', { hasText: 'lead' })).toBeVisible();
  // RightPanel defaults to the Actors tab (ui.svelte:`rightPanelTab='actors'`);
  // ScenesPanel only mounts when the Scenes tab is selected (RightPanel.svelte:34).
  // Switch tabs before asserting on `.scenes .card`.
  await page.locator('.rp-tab', { hasText: 'Scenes' }).click();
  await expect(page.locator('.scenes')).toBeVisible({ timeout: 2_000 });
  await expect(page.locator('.scenes .card .name', { hasText: 'calm' })).toBeVisible();
  await expect(page.locator('.scenes .card .name', { hasText: 'full' })).toBeVisible();

  // Activate `calm` by clicking the scene card. The click is also the user
  // gesture that unlocks the AudioContext (handleSceneActivate calls
  // clock.play() first, then toggles actors - real-core.ts:107).
  const calmCard = page.locator('.scenes .card', {
    has: page.locator('.name', { hasText: 'calm' })
  });
  await calmCard.click();

  // Scene gets `.active` class (ScenesPanel.svelte:32). Switch back to the
  // Actors tab to assert on actor.active — ActorsPanel only mounts when
  // ui.rightPanelTab === 'actors' (RightPanel.svelte:33).
  await expect(calmCard).toHaveClass(/active/, { timeout: 3_000 });
  await page.locator('.rp-tab', { hasText: 'Actors' }).click();
  await expect(
    page.locator('li.actor', { has: page.locator('.name', { hasText: 'drums' }) })
  ).toHaveClass(/active/);
  await expect(
    page.locator('li.actor', { has: page.locator('.name', { hasText: 'lead' }) })
  ).not.toHaveClass(/active/);

  // Switch to `full` - drums stay armed, lead joins. Back to Scenes tab to
  // click the card, then to Actors to assert.
  await page.locator('.rp-tab', { hasText: 'Scenes' }).click();
  const fullCard = page.locator('.scenes .card', {
    has: page.locator('.name', { hasText: 'full' })
  });
  await fullCard.click();

  await expect(fullCard).toHaveClass(/active/, { timeout: 3_000 });
  await expect(calmCard).not.toHaveClass(/active/);
  await page.locator('.rp-tab', { hasText: 'Actors' }).click();
  await expect(
    page.locator('li.actor', { has: page.locator('.name', { hasText: 'drums' }) })
  ).toHaveClass(/active/);
  await expect(
    page.locator('li.actor', { has: page.locator('.name', { hasText: 'lead' }) })
  ).toHaveClass(/active/);

  // Hush before yielding - Strudel may still be scheduling.
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(500);
  noErrors();
});
