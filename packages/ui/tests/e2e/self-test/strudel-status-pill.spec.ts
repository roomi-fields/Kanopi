import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evalBlockAt } from '../../helpers';

// Bandeau strudel — OPTION 3 [785/789] : visible SSI (la scène ACTIVE utilise strudel) OU
// (strudel joue une voix vivante en fond). Honore les 2 décisions Romain à la fois :
//   [785] : une scène p5/mercury/csound SANS strudel ne doit JAMAIS montrer le bandeau —
//           avant le fix, le statut moteur (idle/loading/ready/error) était monotone et
//           session-wide, donc le bandeau restait affiché sur un onglet p5 dès que strudel
//           avait chargé une fois ailleurs dans la session (mensonge sur la voix chargée).
//   2026-07-14 (commentaire StrudelStatusPill.svelte, historique conservé) : strudel qui
//           joue EN FOND pendant qu'on regarde un autre onglet ne doit PAS faire disparaître
//           le bandeau — un gate "scène active" pur cassait ça.
//
// Chargement/éval : même hatch dev `__kanopi.workspace` que health-chip.spec.ts /
// audio-proof.spec.ts (API pilote, jamais d'import de store dans la page).

interface KanopiHatch {
  workspace: {
    openBundle: (f: { path: string; contents: string }[], focusPath?: string) => string | null;
    files: { id: string; path: string }[];
    openFile: (id: string) => void;
    setActive: (id: string) => void;
  };
}

const fixturesDir = fileURLToPath(new URL('../../fixtures', import.meta.url));
const strudelScene = readFileSync(join(fixturesDir, 'strudel.bps'), 'utf8');
const p5Scene = readFileSync(join(fixturesDir, 'p5.bps'), 'utf8');

async function loadBoth(page: import('@playwright/test').Page) {
  return page.evaluate(
    async ({ strudelScene, p5Scene }) => {
      const w = window as unknown as { __kanopi: KanopiHatch };
      const ws = w.__kanopi.workspace;
      ws.openBundle(
        [
          { path: 'strudel.bps', contents: strudelScene },
          { path: 'p5.bps', contents: p5Scene }
        ],
        'strudel.bps'
      );
      const strudelId = ws.files.find((f) => f.path === 'strudel.bps')?.id;
      const p5Id = ws.files.find((f) => f.path === 'p5.bps')?.id;
      if (!strudelId || !p5Id) throw new Error('fixtures did not land in the workspace');
      ws.openFile(p5Id);
      ws.setActive(strudelId);
      return { strudelId, p5Id };
    },
    { strudelScene, p5Scene }
  );
}

test('scène p5 active sans voix strudel vivante : le bandeau strudel est ABSENT [785]', async ({
  page
}) => {
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  const { p5Id } = await loadBoth(page);

  // Arme d'abord strudel (le statut moteur passe loading→ready) pour prouver que la
  // visibilité ne suit PAS le statut moteur seul — sinon ce test serait trivialement vrai
  // parce que strudel n'a jamais chargé.
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
  await evalBlockAt(page, 1);
  await expect(page.locator('.pill')).toBeVisible({ timeout: 10_000 });

  // Coupe la voix strudel (hush = plus aucune voix vivante) puis bascule sur l'onglet p5.
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);

  await page.evaluate((p5Id) => {
    const w = window as unknown as { __kanopi: KanopiHatch };
    w.__kanopi.workspace.setActive(p5Id);
  }, p5Id);

  await expect(page.locator('.pill')).not.toBeVisible({ timeout: 5_000 });
});

test('strudel joue en fond, onglet actif basculé sur p5 : le bandeau RESTE présent (non-régression 2026-07-14)', async ({
  page
}) => {
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  const { p5Id } = await loadBoth(page);

  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
  await evalBlockAt(page, 1);
  await expect(page.locator('.pill')).toBeVisible({ timeout: 10_000 });

  // Bascule l'onglet actif sur p5 SANS couper strudel : la voix reste armée/vivante.
  await page.evaluate((p5Id) => {
    const w = window as unknown as { __kanopi: KanopiHatch };
    w.__kanopi.workspace.setActive(p5Id);
  }, p5Id);

  await expect(page.locator('.pill')).toBeVisible({ timeout: 5_000 });

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);
});
