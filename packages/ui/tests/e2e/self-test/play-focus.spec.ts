import { test, expect } from '@playwright/test';
import { expectNoConsoleErrors } from '../../helpers';

// FOCUS DE JEU — banc permanent de l'ARBITRAGE clavier, à l'écran.
// Décision Romain 2026-07-28 : « pour le focus on fait comme Bitwig » — c'est LE VERROU DES
// MAJUSCULES qui arme le clavier de jeu, et lui seul. Le badge cliquable et la sortie par Échap ont
// été retirés dans le même mouvement (deux façons d'armer un même mode = voie parallèle).
//
// CE QUE CE BANC PROUVE, dans l'ordre où l'utilisateur le vit :
//   1. verrou relâché, Espace démarre le transport (le comportement d'avant ne bouge pas) ;
//   2. verrou enclenché, le témoin « focus jeu » APPARAÎT dans la barre d'état — un mode qui capte
//      les touches nues doit se voir, sinon Espace ne fait rien et rien ne dit pourquoi ;
//   3. verrou enclenché, Espace ne démarre PLUS le transport — la touche nue va à la performance ;
//   4. ÉCHAP NE REND PLUS RIEN : c'est une touche ordinaire, et le témoin reste allumé. Seul le
//      relâchement du verrou rend la main — et Espace redevient alors le transport.
//
// L'unité (`src/lib/keybindings/play-focus.test.ts`) garde en plus le NON-preventDefault (l'hôte
// s'abstient au lieu de consommer), le hush qui reste atteignable en jouant, et l'état INCONNU
// tant qu'aucun geste n'a été observé — trois choses qu'un banc navigateur ne lit pas directement.
//
// ⚠️ COMMENT LE BANC ARME : l'automatisation ne sait PAS basculer le vrai verrou (mesuré : `press`,
// `down`/`up`, double frappe — l'état lu reste `false`). Il envoie donc des événements clavier
// PORTANT le drapeau, sur la fenêtre où écoutent le garde des raccourcis et le périphérique
// d'entrée : même porte, clavier simulé. Et comme un vrai clavier verrouillé estampille TOUTES ses
// frappes, chaque touche de ce banc porte le drapeau tant que le verrou est censé être enclenché.
//
// ✅ ET LE SIMULÉ VAUT LE RÉEL, C'EST ÉTABLI — pas supposé. Le 2026-07-28, Romain a essayé avec le
// VRAI verrou physique, au doigt : ça fonctionne. C'était le seul point que ce banc ne pouvait pas
// atteindre, et il est désormais confirmé. Si tu lis ceci en te demandant si la simulation prouve
// quelque chose : oui, elle a été confrontée au geste réel une fois, et elle disait vrai.
//
// Sélecteurs, tous pris dans les composants (jamais devinés) :
//   - `.tbtn[title="Play"]` / `.tbtn.playing` — TransportCluster.svelte, comme transport.spec.ts ;
//   - `.sb-item.play-focus.pris` — Statusbar.svelte, le témoin de mode (un MIROIR, plus un bouton).

// Même sonde que transport.spec.ts : 8 hauteurs occidentales en `:audio` (pas `:midi` — le garde
// fail-loud MIDI bloquerait l'éval sans périphérique). Kronos est la seule autorité de transport :
// sans scène armée il n'y a pas de Transport, donc Espace ne pourrait rien démarrer et le test
// ne prouverait rien.
const PROBE_SCENE = `@core
@alphabet.western:audio

S -> C4 D4 E4 G4 C5 G4 E4 C4
`;

/** Une frappe qui PORTE l'état du verrou — `verrou:true` simule un clavier dont la touche est
 *  allumée. Envoyée sur `window`, là où écoutent le garde et le périphérique d'entrée. */
async function frappe(page: import('@playwright/test').Page, code: string, verrou: boolean) {
  await page.evaluate(
    ({ c, v }) => {
      for (const type of ['keydown', 'keyup']) {
        window.dispatchEvent(
          new KeyboardEvent(type, {
            code: c,
            key: c === 'Space' ? ' ' : c,
            bubbles: true,
            cancelable: true,
            modifierCapsLock: v
          } as KeyboardEventInit)
        );
      }
    },
    { c: code, v: verrou }
  );
}

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

  // 2. VERROU ENCLENCHÉ : le témoin s'allume. L'hôte le LIT sur l'événement, il ne le pose pas.
  await frappe(page, 'ShiftLeft', true);
  await expect(badge).toBeVisible({ timeout: 2_000 });
  await leaveEditFocus(page);

  // 3. Espace ne démarre PLUS le transport : la touche nue revient à la performance. On laisse
  //    une seconde pleine — un démarrage qui « arriverait juste après » serait quand même un vol.
  await frappe(page, 'Space', true);
  await page.waitForTimeout(1000);
  await expect(playing).toHaveCount(0);

  // 4. ÉCHAP NE REND PLUS RIEN — le témoin reste allumé et Espace reste à la performance. Une
  //    sortie de secours au clavier serait une SECONDE façon de changer un état qu'on ne commande
  //    pas : l'écran mentirait aussitôt, puisqu'il reflète un voyant resté allumé.
  await frappe(page, 'Escape', true);
  await page.waitForTimeout(300);
  await expect(badge).toBeVisible();
  await frappe(page, 'Space', true);
  await page.waitForTimeout(500);
  await expect(playing).toHaveCount(0);

  // 5. SEUL LE RELÂCHEMENT DU VERROU rend la main : le témoin s'éteint, Espace redevient transport.
  await frappe(page, 'ShiftLeft', false);
  await expect(badge).toHaveCount(0, { timeout: 2_000 });
  await page.keyboard.press('Space');
  await expect(playing).toBeVisible({ timeout: 3_000 });

  await page.locator('.tbtn[title="Stop"]').click();
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);
  noErrors();
});
