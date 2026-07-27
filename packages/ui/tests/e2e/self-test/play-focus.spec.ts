import { test, expect } from '@playwright/test';
import { expectNoConsoleErrors } from '../../helpers';

// FOCUS DE JEU — banc permanent de l'ARBITRAGE clavier, à l'écran.
// Décision `hub/decisions/2026-07-26-clavier-le-focus-decide-pas-une-priorite-globale.md` :
// ni le transport ni le contenu ne gagne dans l'absolu, c'est le CONTEXTE FOCALISÉ qui décide.
//
// CE QUE CE BANC PROUVE, dans l'ordre où l'utilisateur le vit :
//   1. hors focus de jeu, Espace démarre le transport (le comportement d'avant ne bouge pas) ;
//   2. focus pris, le badge « focus jeu » APPARAÎT dans la barre d'état — un mode qui capte les
//      touches nues doit se voir, sinon Espace ne fait rien et rien ne dit pourquoi ;
//   3. focus pris, Espace ne démarre PLUS le transport — la touche nue revient à la performance ;
//   4. Échap rend le focus, le badge disparaît et Espace redevient le transport.
//
// L'unité (`src/lib/keybindings/play-focus.test.ts`) garde en plus le NON-preventDefault (l'hôte
// s'abstient au lieu de consommer) et le hush qui reste atteignable en jouant — deux choses qu'un
// banc navigateur ne lit pas directement.
//
// Sélecteurs, tous pris dans les composants (jamais devinés) :
//   - `.tbtn[title="Play"]` / `.tbtn.playing` — TransportCluster.svelte, comme transport.spec.ts ;
//   - `.sb-item.play-focus.pris` — Statusbar.svelte, le badge de mode PRIS (l'affordance de PRISE,
//     elle, est toujours présente et porte `.armed` — voir `entrees-panneau.spec.ts`).
// La PRISE du focus passe ici par la façade pilote (`window.kanopi.setPlayFocus`), qui délègue au
// MÊME point d'entrée que le badge (`stores/play-focus`). Ce banc mesure l'ARBITRAGE de l'hôte ;
// le branchement du périphérique et le geste de prise sont mesurés par `entrees-panneau.spec.ts`.

// Même sonde que transport.spec.ts : 8 hauteurs occidentales en `:audio` (pas `:midi` — le garde
// fail-loud MIDI bloquerait l'éval sans périphérique). Kronos est la seule autorité de transport :
// sans scène armée il n'y a pas de Transport, donc Espace ne pourrait rien démarrer et le test
// ne prouverait rien.
const PROBE_SCENE = `@core
@controls
@alphabet.western:audio

S -> C4 D4 E4 G4 C5 G4 E4 C4
`;

async function loadAndArm(page: import('@playwright/test').Page) {
  await page.evaluate((contents) => {
    const w = window as unknown as {
      __kanopi: {
        workspace: {
          openBundle: (
            f: { path: string; contents: string }[],
            focusPath?: string
          ) => string | null;
        };
      };
    };
    w.__kanopi.workspace.openBundle(
      [{ path: 'play-focus-probe.bps', contents }],
      'play-focus-probe.bps'
    );
  }, PROBE_SCENE);
  const id = await page.evaluate(() => {
    const w = window as unknown as {
      __kanopi: {
        workspace: {
          files: { id: string; path: string }[];
          openFile: (id: string) => void;
          setActive: (id: string) => void;
        };
      };
    };
    const t = w.__kanopi.workspace.files.find((f) => f.path === 'play-focus-probe.bps');
    if (t) {
      w.__kanopi.workspace.openFile(t.id);
      w.__kanopi.workspace.setActive(t.id);
    }
    return t?.id ?? '';
  });
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
  await page.evaluate(async (fid) => {
    const w = window as unknown as {
      __kanopi: { openBlocks: { produceLoadedProgram: (id: string) => Promise<void> } };
    };
    await w.__kanopi.openBlocks.produceLoadedProgram(fid);
  }, id);
  await page.waitForTimeout(300);
}

/** Sortir du focus d'ÉDITION : après la production, le curseur est dans l'éditeur, et le focus
 *  d'édition est LE PLUS SPÉCIFIQUE des deux contextes — Espace y taperait un espace. Ce banc
 *  mesure l'arbitrage focus de jeu ↔ interface, pas celui-là (l'unité couvre le cas éditable). */
async function leaveEditFocus(page: import('@playwright/test').Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

test('le focus de jeu décide à qui appartient Espace, et il se voit', async ({ page }) => {
  const noErrors = expectNoConsoleErrors(page);
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await loadAndArm(page);
  await leaveEditFocus(page);

  const badge = page.locator('.sb-item.play-focus.pris');
  const playing = page.locator('.tbtn.playing');

  // 1. HORS focus de jeu : Espace est à l'interface, il démarre le transport.
  await expect(badge).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect(playing).toBeVisible({ timeout: 3_000 });

  await page.locator('.tbtn[title="Stop"]').click();
  await expect(playing).toHaveCount(0, { timeout: 3_000 });

  // 2. Focus de jeu PRIS (façade pilote → même point d'entrée que le badge) : le mode se voit.
  await page.evaluate(() => {
    const w = window as unknown as {
      kanopi: { setPlayFocus: (held: boolean, source?: string) => void };
    };
    w.kanopi.setPlayFocus(true, 'banc');
  });
  await expect(badge).toBeVisible({ timeout: 2_000 });
  await leaveEditFocus(page);

  // 3. Espace ne démarre PLUS le transport : la touche nue revient à la performance. On laisse
  //    une seconde pleine — un démarrage qui « arriverait juste après » serait quand même un vol.
  await page.keyboard.press('Space');
  await page.waitForTimeout(1000);
  await expect(playing).toHaveCount(0);

  // 4. Échap rend le focus : le badge disparaît, Espace redevient le transport.
  await page.keyboard.press('Escape');
  await expect(badge).toHaveCount(0, { timeout: 2_000 });
  await page.keyboard.press('Space');
  await expect(playing).toBeVisible({ timeout: 3_000 });

  await page.locator('.tbtn[title="Stop"]').click();
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);
  noErrors();
});
