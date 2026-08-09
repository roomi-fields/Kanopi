import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupAudioCapture, setupFakeMidi, evalBlockAt, expectNoConsoleErrors } from '../../helpers';

// CHAQUE SCÈNE D'EXEMPLE PRODUIT — la preuve de production, mandat architecte [1209].
//
// La décision de Romain sur ce chantier dit qu'un exemple est une VRAIE scène, qu'on a envie
// d'entendre, QUI PRODUIT. Une scène d'exemple muette ment à l'endroit exact où l'utilisateur
// clique pour entendre. Compiler et dériver ne prouvent pas cela : `corpus-compile.test.ts` dit
// qu'une scène s'analyse, jamais qu'elle sonne.
//
// ⚠️ LE BANC SE DÉRIVE DU DOSSIER, JAMAIS D'UNE LISTE ÉCRITE : bpscript dépose famille par
// famille — 14 scènes, puis 24, puis 30 en trois heures. Une liste à la main serait fausse avant
// d'être relue, et son vert continuerait de porter sur les scènes d'hier.
//
// ⚠️ ON EXIGE DE CHAQUE SCÈNE CE QU'ELLE DÉCLARE, PAS L'AUDIO PAR DÉFAUT : une scène en
// `@outputs: midi` est MUETTE à bon droit, et la compter comme un défaut ferait exactement le
// contraire du mandat — un faux rouge sur une scène juste, pendant qu'on croit mesurer.
const DOSSIER = fileURLToPath(new URL('../../../../library/scenes/samples', import.meta.url));

interface Scene {
  fichier: string;
  source: string;
  sorties: string[];
}

const SCENES: Scene[] = readdirSync(DOSSIER)
  .filter((f) => f.endsWith('.bps'))
  .sort()
  .map((fichier) => {
    const source = readFileSync(join(DOSSIER, fichier), 'utf8');
    const m = /^\/\/\s*@outputs:\s*(.*)$/m.exec(source);
    return {
      fichier,
      source,
      sorties: (m?.[1] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    };
  });

test('le dossier des scènes d’exemple n’est pas vide', () => {
  expect(SCENES.length).toBeGreaterThan(0);
});

for (const { fichier, source, sorties } of SCENES) {
  const attendAudio = sorties.includes('audio');
  const attendMidi = sorties.includes('midi');

  test(`${fichier} produit (${sorties.join(' + ')})`, async ({ page }) => {
    const audio = attendAudio ? await setupAudioCapture(page) : null;
    const midi = attendMidi ? await setupFakeMidi(page) : null;
    const noErrors = expectNoConsoleErrors(page);

    await page.goto('');
    await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

    // API pilote uniquement — jamais d'import de store dans la page, sinon on mesure une
    // seconde instance et le silence de la vraie passe inaperçu.
    await page.evaluate(
      async ({ fichier, source }) => {
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
        ws.openBundle([{ path: fichier, contents: source }], fichier);
        const cible = ws.files.find((f) => f.path === fichier);
        if (!cible) throw new Error(`${fichier} n'a pas atterri dans l'espace de travail`);
        ws.openFile(cible.id);
        ws.setActive(cible.id);
      },
      { fichier, source }
    );
    await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

    // ⚠️ LE MIDI NE SE CHOISIT JAMAIS TOUT SEUL — une sortie MIDI n'est atteinte qu'après que
    // l'utilisateur a désigné un port dans le panneau Matériel. Sans ce geste, une scène MIDI
    // PARFAITEMENT JUSTE reste muette, et le banc l'accuse. C'est arrivé : la première passe de
    // cette campagne a compté deux scènes muettes qui ne l'étaient pas, jusqu'à ce que le
    // scénario témoin de `bp3-midi.spec.ts`, passé verbatim ici, se taise lui aussi.
    if (midi) {
      await page.click('.ab-btn[title="Hardware"]');
      const sortie = page.locator('.hw section').filter({ hasText: 'MIDI Output' });
      await sortie.locator('button').first().click();
      await sortie.locator('select.port-select').selectOption({ label: 'Kanopi Fake MIDI Out' });
    }

    // Le clic d'evalBlockAt lève la porte d'autoplay (geste utilisateur) puis Ctrl+Entrée
    // évalue toute la scène — cas monobloc BPScript.
    await evalBlockAt(page, 1);

    if (audio) {
      // Fenêtre large et PIC sur la fenêtre : un instantané tombe dans un silence entre deux
      // notes et rend un zéro qui ne veut rien dire.
      const rms = await audio.getMaxRMS(3000);
      expect(rms, `${fichier} : aucun son mesuré sur le maître`).toBeGreaterThan(0.001);
    }

    if (midi) {
      await expect
        .poll(async () => (await midi!.getSent()).length, { timeout: 5_000 })
        .toBeGreaterThan(0);
    }

    // Romain est à la machine : on ne laisse jamais du son derrière soi.
    await page.keyboard.press('ControlOrMeta+Period');
    await page.waitForTimeout(200);
    noErrors();
  });
}
