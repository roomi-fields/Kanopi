import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  setupAudioCapture,
  setupFakeMidi,
  evalBlockAt,
  expectNoConsoleErrors
} from '../../helpers';

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

// LES ROUGES D'INTENTION — mesurés le 2026-08-10, chacun routé, aucun à moi.
//
// ⚠️ CE N'EST PAS UNE MISE EN SOMMEIL : l'attente est INVERSÉE. Tant que la scène échoue POUR SA
// RAISON, le banc passe ; le jour où elle produit, le banc ROUGIT et demande le retrait de sa
// ligne. Un défaut réparé en amont sans que personne le dise se signale donc tout seul, au lieu
// de dormir sous un vert.
//
// LA COUPURE N'EST PAS UNE RESSEMBLANCE, ELLE EST MESURÉE : les quatre muettes sont EXACTEMENT
// les quatre scènes qui déclarent un `@actor` sans `out.*`. Les deux seules scènes à acteurs QUI
// déclarent leur sortie produisent, et les vingt-huit sans acteur du tout produisent. Aucun
// contre-exemple dans un sens ni dans l'autre.
//
// CE N'EST PAS LE PORTIER D'APPAREIL DE L'HÔTE : un acteur sans sortie déclarée reçoit `'audio'`
// par défaut (`src/lib/runtimes/bpx-adapter.ts:741`), et le portier CRIE au lieu de sauter — or
// ces quatre-là ne produisent aucune erreur de console.
//
// ET CE N'EST PAS UNE CORRÉLATION, C'EST UNE CAUSE DÉMONTRÉE : ajouter `out.audio` sous les deux
// acteurs de `symboles-et-noms-lever-l-ambiguite.bps` la fait SONNER. La même injection prouve la
// morsure de l'inversion — le banc rougit alors en réclamant le retrait de sa ligne ; retrait de
// l'injection, retour au vert.
const MUETTES_DECLAREES: Record<string, { motif: string; attend: 'silence' | 'cris' }> = {
  'fondations-le-clavier-et-son-accordage.bps': {
    motif: 'deux `@actor` avec `tuning.<x>` et aucun `out.*` — la voix n’atteint aucune sortie',
    attend: 'silence'
  },
  'fondations-le-sargam-un-autre-clavier.bps': {
    motif: 'deux `@actor` avec `tuning.<x>` et aucun `out.*`',
    attend: 'silence'
  },
  'symboles-et-noms-lever-l-ambiguite.bps': {
    motif: 'deux `@actor` avec `tuning.<x>` et aucun `out.*`',
    attend: 'silence'
  },
  'jeu-le-code-natif-dans-le-flux.bps': {
    motif: 'un `@actor` avec `eval.strudel` et aucun `out.*`',
    attend: 'silence'
  },
  'jeu-transposer-quatre-gestes.bps': {
    motif:
      'elle SONNE, et elle crie : 32 fail-loud `[kairos.pitch]` — keyxpand.pivotStep=0, ' +
      'la coercition token-step attend un TOKEN de note (KAI-B03)',
    attend: 'cris'
  }
};

test('le dossier des scènes d’exemple n’est pas vide', () => {
  expect(SCENES.length).toBeGreaterThan(0);
});

test('aucune muette déclarée ne désigne un fichier disparu', () => {
  const presents = new Set(SCENES.map((s) => s.fichier));
  const fantomes = Object.keys(MUETTES_DECLAREES).filter((f) => !presents.has(f));
  expect(fantomes, 'lignes à retirer de MUETTES_DECLAREES').toEqual([]);
});

for (const { fichier, source, sorties } of SCENES) {
  const declaree = MUETTES_DECLAREES[fichier];
  const silenceAttendu = declaree?.attend === 'silence';
  const attendAudio = sorties.includes('audio');
  const attendMidi = sorties.includes('midi') && !silenceAttendu;

  const titre = declaree
    ? `${fichier} — rouge déclaré : ${declaree.motif}`
    : `${fichier} produit (${sorties.join(' + ')})`;

  test(titre, async ({ page }) => {
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
      if (silenceAttendu) {
        expect(
          rms,
          `${fichier} PRODUIT maintenant — le défaut est réparé en amont : retirer sa ligne de MUETTES_DECLAREES`
        ).toBeLessThanOrEqual(0.001);
      } else {
        expect(rms, `${fichier} : aucun son mesuré sur le maître`).toBeGreaterThan(0.001);
      }
    }

    if (midi) {
      await expect
        .poll(async () => (await midi!.getSent()).length, { timeout: 5_000 })
        .toBeGreaterThan(0);
    }

    // Romain est à la machine : on ne laisse jamais du son derrière soi.
    await page.keyboard.press('ControlOrMeta+Period');
    await page.waitForTimeout(200);

    if (declaree?.attend === 'cris') {
      // Elle sonne ET elle crie : c'est le cri qui est déclaré, donc son ABSENCE est ce qui doit
      // rougir — sinon la réparation amont passerait inaperçue sous un vert.
      expect(
        () => noErrors(),
        `${fichier} ne crie plus — le défaut amont est réparé : retirer sa ligne de MUETTES_DECLAREES`
      ).toThrow();
    } else {
      noErrors();
    }
  });
}
