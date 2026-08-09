import { test, expect } from '@playwright/test';
import { expectNoConsoleErrors } from '../../helpers';

// L'OUVERTURE PAR URL, VUE À L'ÉCRAN — ce que les bancs unitaires ne peuvent pas montrer.
// `scene-url.test.ts` prouve que le paramètre est LU ; il ne prouve pas qu'une scène s'OUVRE.
// Demande Romain (2026-08-09) : depuis un exemple de la doc, un clic amène l'utilisateur sur la
// scène ouverte et prête à produire. Tant que personne ne l'a vue s'ouvrir, ce n'est pas fait.
//
// ⚠️ LA SCÈNE VISÉE N'EST PAS DANS `samples` : cette catégorie n'existe pas encore (elle naîtra
// avec sa première scène, écrite par bpscript). On vise donc un tutoriel, qui est stable et
// bundlé. Quand `samples` existera, ce banc pourra viser une vraie scène d'exemple — le chemin
// testé est le même, seul l'identifiant change.
const SCENE = 'learn/tuto-01-first-note.bps';
const ONGLET = 'tuto-01-first-note.bps';

test('?scene=<id> ouvre la scène, et son onglet est là', async ({ page }) => {
  const noErrors = expectNoConsoleErrors(page);
  await page.goto(`?scene=${encodeURIComponent(SCENE)}`);
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // L'onglet porte le nom du fichier : c'est la preuve visible que la scène est OUVERTE, pas
  // seulement résolue.
  await expect(page.locator('.tab', { hasText: ONGLET })).toBeVisible({ timeout: 10_000 });
  noErrors();
});

// ⚠️ LE CAS QUI COMPTE AUTANT QUE LE PREMIER, et que rien d'autre ne couvre à l'écran : SANS le
// paramètre, l'application démarre comme avant. Une ouverture surprise ne rougirait nulle part —
// elle ajouterait juste un onglet que personne n'a demandé.
test('SANS le paramètre, aucun onglet de scène n’est ouvert en plus', async ({ page }) => {
  const noErrors = expectNoConsoleErrors(page);
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.tab', { hasText: ONGLET })).toHaveCount(0);
  noErrors();
});

// Un lien de doc périmé ne doit pas accueillir l'utilisateur par une erreur : l'application
// démarre normalement, simplement sans l'onglet demandé.
test('identifiant inconnu : l’application démarre quand même, sans bruit', async ({ page }) => {
  const noErrors = expectNoConsoleErrors(page);
  await page.goto('?scene=categorie-qui-nexiste-pas/rien.bps');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });
  noErrors();
});
