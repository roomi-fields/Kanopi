import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setupAudioCapture, evalBlockAt, expectNoConsoleErrors } from '../../helpers';

// LA PREUVE DU CHANTIER BUS — un événement ordonnancé arrive à une sortie PAR LE BUS.
//
// ⚠️ CE QUI REND CETTE MESURE VALIDE, ET SANS QUOI ELLE NE DIT RIEN : IL N'EXISTE PLUS AUCUN AUTRE
// CHEMIN. `send` a été retirée des quatre sorties (runtime-audio, MIDI, OSC, codevoices) ET de
// l'interface `RuntimeAdapter` de Kronos (leur `b0a2d5a`), le 2026-08-10. Kronos PUBLIE sur le bus
// commun ; chaque sortie s'y abonne, filtre sur sa clé et retranche sa latence.
// Donc du son qui sort prouve la TRAVERSÉE COMPLÈTE : ordonnancement → publication → bus →
// abonnement de runtime-audio → filtre de clé → rendu. Sans cette phrase, un lecteur futur croira
// que ce banc mesure « le son marche » ; il mesure LE CHEMIN.
//
// ⚠️ ET IL PORTE SON TÉMOIN NÉGATIF, parce qu'un RMS n'est JAMAIS exactement nul : sans un scénario
// qui doit se taire, un niveau non nul ne distingue pas « la chaîne passe » de « l'instrument
// mesure du bruit de fond ». Les deux chiffres sont dans le rapport, pas seulement le bon.
const SONNANTE = fileURLToPath(
  new URL('../../../../library/scenes/samples/silences-et-prolongations.bps', import.meta.url)
);

// Le témoin négatif : une scène SANS aucune note — que des silences. Elle traverse exactement la
// même chaîne (analyse, dérivation, ordonnancement, publication) et ne doit RIEN faire sonner.
// Ce n'est donc pas « une page vide » : c'est le même chemin, sans matière à rendre.
const MUETTE = 'core\nalphabet.western\ntempo:120\n\n-----\nS -> Rien\nRien -> - - - -\n';

async function charger(page: import('@playwright/test').Page, nom: string, contents: string) {
  await page.evaluate(
    ({ nom, contents }) => {
      const w = window as unknown as {
        __kanopi: {
          workspace: {
            openBundle: (f: { path: string; contents: string }[], focus?: string) => unknown;
            files: { id: string; path: string }[];
            openFile: (id: string) => void;
            setActive: (id: string) => void;
          };
        };
      };
      const ws = w.__kanopi.workspace;
      ws.openBundle([{ path: nom, contents }], nom);
      const cible = ws.files.find((f) => f.path === nom)!;
      ws.openFile(cible.id);
      ws.setActive(cible.id);
    },
    { nom, contents }
  );
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
}

test('un événement ordonnancé ARRIVE à la sortie audio par le bus', async ({ page }) => {
  const noErrors = expectNoConsoleErrors(page);
  const audio = await setupAudioCapture(page);

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });
  await charger(page, 'preuve.bps', readFileSync(SONNANTE, 'utf8'));
  await evalBlockAt(page, 1);

  await expect.poll(async () => audio.getMaxRMS(1500), { timeout: 15_000 }).toBeGreaterThan(0.001);

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(200);
  noErrors();
});

test('TÉMOIN NÉGATIF — une scène sans note ne fait rien sonner', async ({ page }) => {
  const noErrors = expectNoConsoleErrors(page);
  const audio = await setupAudioCapture(page);

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });
  await charger(page, 'muette.bps', MUETTE);
  await evalBlockAt(page, 1);

  // On va jusqu'au bout de la fenêtre : un silence ne se prouve pas en s'arrêtant tôt.
  const rms = await audio.getMaxRMS(6000);
  expect(rms, 'une scène sans note a fait du son : l’instrument mesure autre chose').toBeLessThan(
    0.001
  );

  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(200);
  noErrors();
});
