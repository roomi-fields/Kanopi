import { test, expect } from '@playwright/test';
import { expectNoConsoleErrors } from '../../helpers';

// Scenes panel — Kanopi's structural differentiator: a scene switch atomically
// arms a different set of actors. This feature lives in the `.kanopi` session
// model and is UNCHANGED by the lot-4 `.bps` starter migration; the bundled
// starter 03 no longer ships as a multi-scene `.kanopi` (it became a sequenced
// `.bps`), so this test defines its own small INLINE `.kanopi` scene session
// rather than reading a bundled file. The assertions (calm/full cards, atomic
// arming, scene-active state) are exactly the Scenes-panel coverage we keep.
//
// Audio is not asserted here - session 01 already covers "audio comes through".
// Here we care about the structural state.

// Inline two-scene `.kanopi` fixture. Two Strudel actors, two scenes: `calm`
// arms drums only, `full` arms drums + lead. The actor bodies are inline so the
// fixture is self-contained and independent of any bundled file.
const SCENE_SESSION = `# Inline scenes fixture - calm arms drums, full arms drums + lead.

@actor drums drums.strudel strudel
@actor lead  lead.strudel  strudel

@scene calm drums
@scene full drums lead
`;
const DRUMS = `note("c2*4").s("sine").gain(0.6)\n`;
const LEAD = `note("e4 g4 b4 d5").s("triangle").gain(0.5)\n`;

test('session 03 - scenes A/B switch atomically arms different actor sets', async ({ page }) => {
  const noErrors = expectNoConsoleErrors(page);

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
          { path: 'scenes.kanopi', contents: session },
          { path: 'drums.strudel', contents: drums },
          { path: 'lead.strudel', contents: lead }
        ],
        'scenes.kanopi'
      );
    },
    { session: SCENE_SESSION, drums: DRUMS, lead: LEAD }
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
