import { test, expect } from '@playwright/test';
import { expectNoConsoleErrors } from '../../helpers';

// LE LOT DES ENTRÉES, à l'écran — le dernier maillon avant que Romain essaie lui-même.
//
// Deux décisions le cadrent :
//   • `2026-07-27-focus-de-jeu-la-declaration-arme-l-utilisateur-prend.md` — déclarer un
//     périphérique clavier ARME le focus (disponible, signalé) ; le PRENDRE reste un geste. C'est
//     le MIDI learn, pas un raccourci : un mode qui capte les touches nues doit s'entrer.
//   • `2026-07-27-forme-des-entrees-in-mapping-adresse-nue.md` — la scène nomme un RÔLE,
//     l'utilisateur associe l'appareil, et l'association vit HORS de la scène.
//
// CE QUE CE BANC PROUVE, dans l'ordre où l'utilisateur le vit :
//   1. une scène SANS clavier déclaré : le témoin le dit dans son infobulle — la scène n'attend
//      rien du clavier ;
//   2. une scène qui déclare `@var touches in.keyboard` : le témoin annonce ce rôle ;
//   3. le panneau des entrées LISTE le rôle déclaré, avec son canal — pas des appareils bruts ;
//   4. le clic PREND le focus, et une touche arrive alors VRAIMENT sur le bus (charge opaque :
//      `key <code> down`) — sans commande de développeur, sans lucarne `?events=1` ;
//   5. Échap rend le focus ET FERME le périphérique : plus rien n'arrive après.
//
// Le point 5 est le verrou qui compte : un périphérique qui continuerait d'écouter après le
// relâchement volerait les touches de l'éditeur, en silence.
//
// ⚠️ Le banc arme en envoyant des événements qui PORTENT le drapeau du verrou : l'automatisation ne
// sait pas basculer le vrai (mesuré). Même porte que le geste réel, clavier simulé — et comme un
// clavier verrouillé estampille TOUTES ses frappes, chaque touche de jeu porte le drapeau.
//
// Sélecteurs, tous pris dans les composants (jamais devinés) :
//   `.sb-item.play-focus.pris` / `.rendu` — Statusbar.svelte (un MIROIR du verrou, plus un
//   bouton : depuis 2026-07-28 c'est le VERROU DES MAJUSCULES qui arme, et l'écran le reflète) ·
//   `.activity-bar button[title="Hardware"]` — le bouton porte le nom accessible « 2 » (badge),
//   d'où le sélecteur par titre · `.hw .role` — HardwareView.svelte.

const SANS_CLAVIER = `core
alphabet.western:audio

-----
S -> C4 D4 E4 G4
`;

const AVEC_CLAVIER = `core
alphabet.western:audio
@var touches in.keyboard
@var pedale in.midi

-----
S -> C4 D4 E4 G4
`;

type Page = import('@playwright/test').Page;

/** Une frappe qui PORTE l'état du verrou des majuscules — c'est ainsi qu'un vrai clavier estampille
 *  ses touches. Envoyée sur `window`, là où écoutent le garde des raccourcis ET le périphérique. */
async function frappeVerrou(page: Page, code: string, verrou: boolean) {
  await page.evaluate(
    ({ c, v }) => {
      for (const type of ['keydown', 'keyup']) {
        window.dispatchEvent(
          new KeyboardEvent(type, {
            code: c,
            key: c,
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

async function ouvrirScene(page: Page, path: string, contents: string) {
  await page.evaluate(
    ({ p, c }) => {
      const w = window as unknown as {
        __kanopi: {
          workspace: {
            openBundle: (f: { path: string; contents: string }[], focus?: string) => string | null;
          };
        };
      };
      w.__kanopi.workspace.openBundle([{ path: p, contents: c }], p);
    },
    { p: path, c: contents }
  );
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
}

/** Sortir du focus d'ÉDITION : après l'ouverture le curseur est dans l'éditeur, et le focus
 *  d'édition est le plus spécifique des deux contextes — une touche y taperait du texte. */
async function quitterEdition(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

/** Les événements d'ENTRÉE vus sur le bus, par la façade publique (v15). Le banc passe par l'API
 *  et rien d'autre : importer un store dans la page donnerait une instance DUPLIQUÉE. */
async function entreesVues(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as {
      kanopi: { inspect: { inputs: () => { device: string; signal: { kind: string } }[] } };
    };
    return w.kanopi.inspect.inputs();
  });
}

test('le VERROU arme le focus, il ouvre le clavier, le relâcher le referme', async ({ page }) => {
  const noErrors = expectNoConsoleErrors(page);
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  const pris = page.locator('.sb-item.play-focus.pris');
  const rendu = page.locator('.sb-item.play-focus.rendu');

  // 1. SANS déclaration : le témoin dit que cette scène n'attend rien du clavier.
  await ouvrirScene(page, 'entrees-sans-clavier.bps', SANS_CLAVIER);
  await frappeVerrou(page, 'ShiftLeft', false);
  await expect(rendu).toBeVisible({ timeout: 3_000 });
  await expect(rendu).toHaveAttribute('title', /ne déclare aucun clavier/);

  // 2. AVEC déclaration : le témoin nomme le rôle qu'on jouerait.
  await ouvrirScene(page, 'entrees-avec-clavier.bps', AVEC_CLAVIER);
  await frappeVerrou(page, 'ShiftLeft', false);
  await expect(rendu).toHaveAttribute('title', /touches/, { timeout: 3_000 });

  // 3. Le panneau des entrées liste les RÔLES déclarés, pas des appareils bruts.
  await page.locator('.activity-bar button[title="Hardware"]').click();
  const roles = page.locator('.hw .role');
  await expect(roles).toHaveCount(2, { timeout: 3_000 });
  await expect(roles.filter({ hasText: 'touches' })).toContainText('keyboard');
  await expect(roles.filter({ hasText: 'pedale' })).toContainText('midi');

  // …et la façade dit la même chose que l'écran (même lecture de l'AST amont).
  expect(
    await page.evaluate(() => {
      const w = window as unknown as {
        kanopi: { inspect: { declaredInputs: () => { name: string; transport: string }[] } };
      };
      return w.kanopi.inspect.declaredInputs();
    })
  ).toEqual([
    { name: 'touches', transport: 'keyboard', mapping: null },
    { name: 'pedale', transport: 'midi', mapping: null }
  ]);

  // 4. LE GESTE : on enclenche le verrou, puis on tape. La touche doit ARRIVER sur le bus.
  await quitterEdition(page);
  await frappeVerrou(page, 'ShiftLeft', true);
  await expect(pris).toBeVisible({ timeout: 2_000 });

  const avant = (await entreesVues(page)).length;
  await frappeVerrou(page, 'KeyQ', true);
  await page.waitForTimeout(200);
  const apres = await entreesVues(page);
  expect(apres.length).toBeGreaterThan(avant);
  const frappe = apres[apres.length - 1];
  expect(frappe.device).toBe('keyboard');
  expect(frappe.signal.kind).toBe('key');

  // 5. RELÂCHER LE VERROU rend le focus ET ferme le périphérique — plus rien n'arrive ensuite.
  await frappeVerrou(page, 'ShiftLeft', false);
  await expect(pris).toHaveCount(0, { timeout: 2_000 });
  const aprèsRelâche = (await entreesVues(page)).length;
  await frappeVerrou(page, 'KeyW', false);
  await frappeVerrou(page, 'KeyX', false);
  await page.waitForTimeout(300);
  expect((await entreesVues(page)).length).toBe(aprèsRelâche);

  noErrors();
});
