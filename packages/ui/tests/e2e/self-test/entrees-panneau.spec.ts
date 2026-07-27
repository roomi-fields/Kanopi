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
//   1. une scène SANS clavier déclaré laisse le geste de prise GRISÉ — la scène n'attend rien ;
//   2. une scène qui déclare `@in touches transport.keyboard` l'ARME (cliquable) ;
//   3. le panneau des entrées LISTE le rôle déclaré, avec son canal — pas des appareils bruts ;
//   4. le clic PREND le focus, et une touche arrive alors VRAIMENT sur le bus (charge opaque :
//      `key <code> down`) — sans commande de développeur, sans lucarne `?events=1` ;
//   5. Échap rend le focus ET FERME le périphérique : plus rien n'arrive après.
//
// Le point 5 est le verrou qui compte : un périphérique qui continuerait d'écouter après le
// relâchement volerait les touches de l'éditeur, en silence.
//
// Sélecteurs, tous pris dans les composants (jamais devinés) :
//   `.sb-item.play-focus.armed` / `.pris` — Statusbar.svelte ·
//   `.activity-bar button[title="Hardware"]` — le bouton porte le nom accessible « 2 » (badge),
//   d'où le sélecteur par titre · `.hw .role` — HardwareView.svelte.

const SANS_CLAVIER = `@core
@alphabet.western:audio

S -> C4 D4 E4 G4
`;

const AVEC_CLAVIER = `@core
@alphabet.western:audio
@in touches transport.keyboard
@in pedale transport.midi

S -> C4 D4 E4 G4
`;

type Page = import('@playwright/test').Page;

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

test('la déclaration arme le focus, la prise ouvre le clavier, Échap le referme', async ({
  page
}) => {
  const noErrors = expectNoConsoleErrors(page);
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  const prise = page.locator('.sb-item.play-focus.armed');
  const pris = page.locator('.sb-item.play-focus.pris');

  // 1. SANS déclaration : l'affordance existe (on sait qu'elle existe) et reste INERTE.
  await ouvrirScene(page, 'entrees-sans-clavier.bps', SANS_CLAVIER);
  await expect(prise).toBeVisible({ timeout: 3_000 });
  await expect(prise).toBeDisabled();

  // 2. AVEC déclaration : la même affordance s'arme.
  await ouvrirScene(page, 'entrees-avec-clavier.bps', AVEC_CLAVIER);
  await expect(prise).toBeEnabled({ timeout: 3_000 });

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

  // 4. LE GESTE : on prend le focus, puis on tape. La touche doit ARRIVER sur le bus.
  await prise.click();
  await expect(pris).toBeVisible({ timeout: 2_000 });
  await quitterEdition(page);

  const avant = (await entreesVues(page)).length;
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(200);
  const apres = await entreesVues(page);
  expect(apres.length).toBeGreaterThan(avant);
  const frappe = apres[apres.length - 1];
  expect(frappe.device).toBe('keyboard');
  expect(frappe.signal.kind).toBe('key');

  // 5. Échap rend le focus ET ferme le périphérique — plus rien n'arrive ensuite.
  await page.keyboard.press('Escape');
  await expect(pris).toHaveCount(0, { timeout: 2_000 });
  const aprèsRelâche = (await entreesVues(page)).length;
  await page.keyboard.press('KeyW');
  await page.keyboard.press('KeyX');
  await page.waitForTimeout(300);
  expect((await entreesVues(page)).length).toBe(aprèsRelâche);

  noErrors();
});
