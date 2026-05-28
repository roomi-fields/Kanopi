import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectNoConsoleErrors } from '../helpers';

// `.kanopi` is the cross-runtime session format that ties actors / scenes /
// maps together. This spec exercises the structural path: load the fixture,
// the parser emits actors into the store, the right panel renders them, and
// the transport accepts a Play command. Audio is not required to be heard —
// the actor files referenced by the fixture stay empty stubs (the auto-create
// effect in App.svelte:90-103 handles them) and no block is armed for eval.
test('multi-actor kanopi session parses, populates actors panel, and starts transport', async ({
  page
}) => {
  const noErrors = expectNoConsoleErrors(page);

  const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));
  const sessionContents = readFileSync(join(fixturesDir, 'multi-actor.kanopi'), 'utf8');

  await page.goto('/');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // Inject the session via the dev-only `window.__kanopi` hatch. Only the
  // .kanopi is loaded here — the auto-create effect will stub the declared
  // @actor files with empty bodies, which is enough for the structural test.
  await page.evaluate((session) => {
    const w = window as unknown as {
      __kanopi?: {
        workspace: {
          loadFiles: (f: { path: string; contents: string }[], focus?: string) => void;
        };
      };
    };
    w.__kanopi!.workspace.loadFiles(
      [{ path: 'multi-actor.kanopi', contents: session }],
      'multi-actor.kanopi'
    );
  }, sessionContents);

  // Actors panel: each declared @actor renders as <li class="actor">
  // containing a <span class="name">. multi-actor.kanopi declares two
  // (`beat` strudel + `viz` hydra).
  await expect(page.locator('li.actor .name', { hasText: 'beat' })).toBeVisible({
    timeout: 5_000
  });
  await expect(page.locator('li.actor .name', { hasText: 'viz' })).toBeVisible();
  const actorCount = await page.locator('li.actor').count();
  expect(actorCount).toBeGreaterThanOrEqual(2);

  // ActorsPanel renders the runtime tag with class `rt-<runtime>` (e.g.
  // rt-strudel, rt-hydra) — assert both kinds surface in the rendered list.
  await expect(page.locator('li.actor .rt-strudel')).toBeVisible();
  await expect(page.locator('li.actor .rt-hydra')).toBeVisible();

  // User gesture before transport.play() (the audio context resume needs it).
  await page.locator('body').click();

  // Play button: TransportCluster.svelte renders two .tbtn buttons — Stop
  // (title="Stop") and Play (title="Play" until it becomes "Playing").
  await page.locator('.tbtn[title="Play"]').click();

  // Transport state: the Play button picks up `.playing` once clock.play()
  // commits, and the statusbar dot drops its `.paused` modifier.
  await expect(page.locator('.tbtn.playing')).toBeVisible({ timeout: 3_000 });
  await expect(page.locator('.sb-dot:not(.paused)')).toBeVisible();

  // Stop everything before yielding (no audio is expected for empty actor
  // bodies, but Strudel may still emit scheduler-tick warnings).
  await page.keyboard.press('ControlOrMeta+Period');
  await page.locator('.tbtn[title="Stop"]').click();
  await page.waitForTimeout(300);
  noErrors();
});
