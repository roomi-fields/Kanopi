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

// LE ROUGE D'INTENTION — un seul, mesuré le 2026-08-10.
//
// ⚠️ CE N'EST PAS UNE MISE EN SOMMEIL : l'attente est INVERSÉE. Tant que la scène échoue POUR SA
// RAISON, le banc passe ; le jour où elle produit proprement, le banc ROUGIT et demande le
// retrait de sa ligne. Un défaut réparé en amont sans que personne le dise se signale tout seul.
//
// ⚠️ CE QUE CETTE TABLE A COMPTÉ HIER ET NE COMPTE PLUS, ET POURQUOI IL FAUT LE LIRE : elle a
// porté QUATRE scènes déclarées muettes, toutes celles qui déclaraient un `@actor` sans `out.*`.
// La coupure était nette et l'injection semblait la confirmer. Elle reposait pourtant sur une
// fenêtre de mesure FIXE de trois secondes — et sous la file des trente-quatre pages, le premier
// son de ces scènes arrivait après. Jouées seules, les trois dernières produisaient toutes.
//
// CE QU'ON NE PEUT PLUS DÉMÊLER, ET QU'ON N'AFFIRMERA DONC PAS : la réparation amont de la
// cascade (bpscript 01da55b) et l'élargissement de cette fenêtre sont arrivés le même jour. Le
// silence d'hier avait au moins une cause instrumentale ; savoir s'il en avait une autre
// demanderait de remesurer l'ancien état avec le nouvel instrument, ce que personne n'a demandé.
// La leçon qui reste vaut mieux que la conclusion perdue : une fenêtre trop courte MINIMISE, et
// un silence ressemble exactement à « rien à corriger ».
const MUETTES_DECLAREES: Record<string, { motif: string; attend: 'silence' | 'cris' }> = {
  // Réécrite en deux acteurs, elle PRODUIT — et elle crie. Elle appelle des sons de batterie
  // qu'aucune déclaration ne CHARGE.
  //
  // ⚠️ `.bank('X')` DANS LE CODE NE CHARGE RIEN, il choisit parmi ce qui est déjà chargé. Le
  // chargement se déclare sur l'ACTEUR — `eval.strudel(bank:"…")`, qui appelle `loadSampleBank`.
  // Mesuré : `s("bd hh")` criait « sound bd not found » 9 fois ; avec `.bank('RolandTR909')` elle
  // crie « sound RolandTR909_bd not found » 29 fois. Le préfixe change, le son manque toujours.
  // La scène dont la forme a été reprise (`strudel/05-filter-envelope-effects.bps:22-26`) ne
  // déclare pas de banque non plus — elle sonne par ses notes, pas par sa batterie, et n'est donc
  // pas une preuve de chargement.
  //
  // Le dépôt connaît le mur : `dirt-samples` est distante et inapte au portillon ; une scène
  // strudel a dû migrer vers une banque hébergée [809]. Défaut de contenu, il est à bpscript.
  'jeu-le-code-natif-dans-le-flux.bps': {
    motif: 'elle SONNE, et elle crie « sound RolandTR909_bd not found » — banque non chargée',
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
      // ⚠️ ON ATTEND LE SON, ON NE L'ÉCHANTILLONNE PAS UNE FOIS. Une fenêtre fixe de trois
      // secondes a menti dans les DEUX SENS le 2026-08-10 : trois scènes rendues MUETTES dans la
      // campagne complète produisaient toutes les trois quand on les jouait seules. Ce n'est pas
      // la scène qui variait, c'est l'instrument — sous une file de trente-quatre pages, le
      // premier son arrive après la fenêtre. Une fenêtre trop courte MINIMISE, et un silence
      // ressemble exactement à « rien à corriger ».
      //
      // Le sondage rend la mesure indépendante de la charge sans l'affaiblir : il s'arrête au
      // premier son, et une scène réellement muette échoue quand même, au bout du compte.
      if (silenceAttendu) {
        // Pour un silence déclaré, on va jusqu'au bout de la fenêtre : c'est la seule façon de
        // ne pas confondre « muette » avec « pas encore sonnée ».
        const rms = await audio.getMaxRMS(12_000);
        expect(
          rms,
          `${fichier} PRODUIT maintenant — le défaut est réparé en amont : retirer sa ligne de MUETTES_DECLAREES`
        ).toBeLessThanOrEqual(0.001);
      } else {
        await expect
          .poll(async () => audio.getMaxRMS(1500), { timeout: 15_000 })
          .toBeGreaterThan(0.001);
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
      // Elle produit ET elle crie : c'est le CRI qui est déclaré, donc son ABSENCE doit rougir.
      expect(
        () => noErrors(),
        `${fichier} ne crie plus — le défaut est réparé : retirer sa ligne de MUETTES_DECLAREES`
      ).toThrow();
    } else {
      noErrors();
    }
  });
}
