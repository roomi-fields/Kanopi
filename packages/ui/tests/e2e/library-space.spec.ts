import { test, expect } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The dedicated full-width library space (brief lot 2): opening the Library
// activity icon swaps the editor for a category rail + filter bar + scene grid.
// Filtering by category and by search narrows the grid.
test('library space filters scenes by category and search', async ({ page }) => {
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // Open the dedicated library space.
  await page.locator('.ab-btn[title="Factory"]').click();
  await expect(page.locator('.space')).toBeVisible({ timeout: 5_000 });

  // Every bundled scene shows under "All".
  const cards = page.locator('.card');
  const total = await cards.count();
  expect(total).toBeGreaterThan(6);

  // The BP3 category narrows to the bundled `.gr` grammars — 14 since the
  // iso-proven-only ruling [827]: 7 historical iso grammars + 7 Phase B [826];
  // the 14 non-iso ones moved to library/unpublished/bp3 (out of the glob).
  // `hasNotText` disambiguates from the "BP3 Tests" rail entry, which arrived
  // with the conformance corpus [873] — plain `hasText: 'BP3'` matches both.
  await page.locator('.cat', { hasText: 'BP3', hasNotText: 'Tests' }).click();
  await expect(cards).toHaveCount(14);
  await expect(page.locator('.result-count')).toHaveText('14 scenes');

  // Search narrows further, within the active category.
  await page.locator('.search').fill('ames');
  await expect(cards).toHaveCount(1);
  await expect(cards.first().locator('.name')).toContainText('Ames');
});

// LA CATÉGORIE `samples` EST EN LIGNE, ET À SA PLACE — le cas que le banc unitaire de rang ne
// peut pas couvrir : lui lit `CATEGORY_ORDER` dans le source, donc il reste vert même si la
// catégorie n'existe pas. Ici on regarde le rail RENDU, qui dérive ses entrées des dossiers
// réels : ce vert-ci dit que les scènes sont bien dans le paquet.
//
// ⚠️ LE RANG SE LIT EN VOISINAGE, PAS EN INDICE : un indice en dur rougirait au prochain
// dossier ajouté avant, ce qui ferait passer un ajout légitime pour une régression. Ce qui est
// verrouillé est l'arc d'entrée — on apprend, on prend les bases, puis on voit une forme du
// langage à l'œuvre.
test('la catégorie Samples est dans le rail, juste après Learn et Basics', async ({ page }) => {
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });
  await page.locator('.ab-btn[title="Factory"]').click();
  await expect(page.locator('.space')).toBeVisible({ timeout: 5_000 });

  const labels = await page.locator('.rail .cat .cat-label').allTextContents();
  const rang = (nom: string) => labels.findIndex((l) => l.toLowerCase() === nom);
  expect(rang('samples'), `rail rendu : ${labels.join(' · ')}`).toBeGreaterThan(-1);
  expect(rang('samples')).toBe(rang('basics') + 1);
  expect(rang('basics')).toBe(rang('learn') + 1);

  // Et elle affiche TOUT ce que le dossier contient, ni plus ni moins.
  //
  // ⚠️ LE COMPTE SE DÉRIVE DU DISQUE, IL NE S'ÉCRIT PAS : figé à 14, ce banc rougissait déjà une
  // heure plus tard, quand bpscript a déposé dix scènes de plus — un ajout légitime aurait pris
  // la forme d'une régression. Compté depuis le dossier, il se tait sur un ajout et rougit sur ce
  // qui compte : un écart entre le dossier et l'écran. Mordant prouvé dans les deux sens — une
  // scène ajoutée au dossier fait suivre les deux côtés ensemble (vert à 25, donc l'accord à 24
  // n'était pas une coïncidence), la même scène rangée dans un sous-dossier n'est plus comptée
  // ici mais reste affichée, et le banc rougit (attendu 24, reçu 25).
  const surDisque = readdirSync(
    fileURLToPath(new URL('../../../library/scenes/samples', import.meta.url))
  ).filter((f) => f.endsWith('.bps') || f.endsWith('.gr')).length;
  expect(surDisque).toBeGreaterThan(0);

  await page.locator('.cat', { hasText: 'Samples' }).click();
  await expect(page.locator('.card')).toHaveCount(surDisque);
});
