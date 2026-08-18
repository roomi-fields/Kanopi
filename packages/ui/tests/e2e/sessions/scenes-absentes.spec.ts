import { test, expect } from '@playwright/test';

// ⛔ CE BANC EST UN VERROU RETOURNÉ, PAS UN BANC SUPPRIMÉ.
//
// Il prouvait, jusqu'au 2026-07-29, que les « scènes-fichier » d'un `.bps` (`@scene calm
// "calm.bps"`) basculaient atomiquement et jouaient leur programme enfant. Deux choses ont
// mis fin à cette capacité, dans cet ordre :
//
//   1. BPScript a SUPPRIMÉ `@scene` de la graphie (commit f60cd68, décision Romain du
//      2026-07-29, `hub/decisions/2026-07-29-les-formes-declaratives-de-bpscript.md` §4) :
//      « on n'a ni la maturité ni le besoin de déclarer des sous-scènes ».
//   2. Romain a tranché ce que devenait mon code (2026-07-30,
//      `hub/decisions/2026-07-30-les-scenes-sortent-de-l-ui-alt-chiffres-vise-les-acteurs.md`) :
//      « on a déjà supprimé les scènes de l'UI, donc si Kanopi les a encore c'est qu'il n'a
//      pas correctement fait le ménage ».
//
// CE QUI A ÉTÉ MESURÉ, ET QUI JUSTIFIE L'AMPLEUR : `setScenes` n'avait qu'UN SEUL appelant
// dans tout le dépôt — `loadBpsFileScenes`, alimenté par la seule table `@scene`. Donc
// `@scene` était l'UNIQUE PRODUCTEUR de scènes de Kanopi : sa suppression ne laissait pas une
// fixture cassée mais un sous-système entier sans entrée (magasin, afficheur de la barre
// d'état, entrées de palette, restauration de la scène active, champ `Scene.file`).
//
// POURQUOI RETOURNER LE VERROU AU LIEU DE LE JETER : un banc qui verrouillait une voie morte
// doit verrouiller son ABSENCE, sinon la voie revient sans que rien ne s'allume. C'est
// exactement ainsi que ce code avait survécu à la sortie des scènes de l'interface : plus
// rien ne l'appelait, et aucun banc ne le disait.
//
// LES TROIS CHOSES QUE CE BANC TIENT DÉSORMAIS :
//   (a) une scène qui déclare `@scene` est REFUSÉE, avec sa raison NOMMÉE (pas « ligne non
//       reconnue ») — le voyant de santé passe au rouge et son infobulle porte le motif ;
//   (b) l'interface n'a plus d'afficheur de scène, et la trappe de banc n'expose plus de
//       surface `scenes` — une réintroduction silencieuse échoue ici ;
//   (c) Alt+chiffres n'a PAS disparu : il a changé de cible et arme désormais un ACTEUR.

interface KanopiHatch {
  workspace: {
    openBundle: (f: { path: string; contents: string }[], focusPath?: string) => string | null;
    files: { id: string; path: string }[];
    openFile: (id: string) => void;
    setActive: (id: string) => void;
  };
  openBlocks: {
    produceLoadedProgram: (fileId: string) => Promise<void>;
  };
  actors: { list: { name: string; active: boolean }[] };
}

const AVEC_SCENE = `// Ce que le langage refuse désormais — conservé ICI, dans le banc qui
// verrouille le refus, et NULLE PART dans le corpus (aucune scène de la
// bibliothèque ne doit porter une forme supprimée).
@scene calm "calm.bps"

S -> calm
`;

test('une scène qui déclare @scene est REFUSÉE avec sa raison nommée', async ({ page }) => {
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  await page.evaluate(async (contents) => {
    const w = window as unknown as { __kanopi: KanopiHatch };
    const ws = w.__kanopi.workspace;
    ws.openBundle([{ path: 'scene-supprimee.bps', contents }], 'scene-supprimee.bps');
    const cible = ws.files.find((f) => f.path === 'scene-supprimee.bps');
    if (!cible) throw new Error('la fixture n’a pas atterri dans l’espace de travail');
    ws.openFile(cible.id);
    ws.setActive(cible.id);
    await w.__kanopi.openBlocks.produceLoadedProgram(cible.id);
  }, AVEC_SCENE);

  // Le voyant de santé dit ROUGE, et son infobulle NOMME la faute : c'est la garantie que
  // l'utilisateur lit « @scene est supprimée » et pas un « ligne non reconnue » anonyme.
  const voyant = page.locator('.compile-chip').first();
  await expect(voyant).toBeVisible({ timeout: 5_000 });
  await expect(voyant).toHaveClass(/fail/, { timeout: 5_000 });
  await expect(voyant).not.toHaveClass(/ok/);
  await expect(voyant).toHaveAttribute('title', /@scene/);
});

test('l’interface n’a plus d’afficheur de scène et la trappe n’expose plus de scènes', async ({
  page
}) => {
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // La barre d'état portait un couple « scene <nom> ». Il n'existe plus.
  await expect(
    page.locator('.statusbar .sb-item', { has: page.getByText('scene', { exact: true }) })
  ).toHaveCount(0);

  // La trappe de banc exposait le magasin de scènes. Son absence est ce qui empêche
  // le sous-système de rentrer sans bruit.
  const surface = await page.evaluate(() => {
    const w = window as unknown as { __kanopi?: Record<string, unknown> };
    return { present: !!w.__kanopi, scenes: w.__kanopi ? 'scenes' in w.__kanopi : null };
  });
  expect(surface.present).toBe(true);
  expect(surface.scenes).toBe(false);
});

test('Alt+chiffre n’a pas disparu : il arme le Nᵉ ACTEUR', async ({ page }) => {
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // Une scène à DEUX acteurs, pour que « le Nᵉ acteur » ait un sens et que la bascule
  // porte sur un acteur précis et pas sur le seul disponible.
  const deuxActeurs = `actor un    eval.strudel
actor deux  eval.strudel

-----
S -> un_r deux_r

un_r   -> un.\`note("c2*4").s("sawtooth").gain(0.4)\`
deux_r -> deux.\`note("g3*4").s("triangle").gain(0.4)\`
`;

  await page.evaluate(async (contents) => {
    const w = window as unknown as { __kanopi: KanopiHatch };
    const ws = w.__kanopi.workspace;
    ws.openBundle([{ path: 'deux-acteurs.bps', contents }], 'deux-acteurs.bps');
    const cible = ws.files.find((f) => f.path === 'deux-acteurs.bps');
    if (!cible) throw new Error('la fixture n’a pas atterri dans l’espace de travail');
    ws.openFile(cible.id);
    ws.setActive(cible.id);
    await w.__kanopi.openBlocks.produceLoadedProgram(cible.id);
  }, deuxActeurs);

  // Attendre que les DEUX acteurs existent : sans eux, Alt+2 n'aurait aucune cible et le
  // banc passerait au vert en ne mesurant rien.
  await page.waitForFunction(() => {
    const w = window as unknown as { __kanopi?: { actors: { list: unknown[] } } };
    return (w.__kanopi?.actors.list.length ?? 0) >= 2;
  });

  await page.locator('.cm-content').first().click();

  const armement = () =>
    page.evaluate(() => {
      const w = window as unknown as { __kanopi: KanopiHatch };
      return w.__kanopi.actors.list.map((a) => a.active);
    });

  const avant = await armement();
  await page.keyboard.press('Alt+2');
  await expect.poll(armement, { timeout: 3_000 }).not.toEqual(avant);

  const apres = await armement();
  // C'est bien le DEUXIÈME acteur qui a basculé, et lui seul : la cible est indexée.
  expect(apres[1]).toBe(!avant[1]);
  expect(apres[0]).toBe(avant[0]);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);
});
