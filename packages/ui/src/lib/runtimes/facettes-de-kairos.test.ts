import { describe, it, expect } from 'vitest';
import { sceneQuiPasse } from '../library/scene-de-banc';
import { parseBP3 } from 'bp3-frontend';
import { createSession } from 'bpx';
import { Kairos } from '@kairos/core';
import { contexteDeProjection } from './bpx-adapter';
import tabla from '../../../../library/scenes/BPScript-tests/kairos-voix-tabla.bps?raw';
import melodyGr from '../../../tests/fixtures/melody.gr?raw';

// LES FACETTES ARRIVENT-ELLES SUR LA TIMELINE DE KAIROS PAR MA CHAÎNE ? — le témoin qui manquait.
//
// ⛔ CE QUI L'A FAIT NAÎTRE, LE 2026-09-02 À 22:50. J'avais retiré le sac `pitchLib` du contexte tendu
// à Kairos, sur sa confirmation mesurée et la décision de Romain (« l'arbre joint le contenu des
// librairies qu'il invoque »). Typage vert, 936 bancs verts, style vert — et `C4 E4 G4` sortait de
// Kairos SANS HAUTEUR : hz=0 sur trois notes. Aucun banc ne lisait `content.pitch.hz` sur la
// timeline ; le corpus prouve l'analyse et la dérivation, pas la facette ; seul l'écran l'aurait
// entendu, à la campagne. Une note sans hauteur est muette au runtime, sans une erreur nulle part.
//
// CE QU'IL LIT : la timeline de Kairos (`arbreCourant()`), chargée par MON `contexteDeProjection` —
// le câblage de production, jamais une copie. Deux facettes, deux scènes : la hauteur sur un
// alphabet occidental, la voix sur un alphabet de percussion. Un plancher > 0, jamais un compte.
//
// ⚠️ IL NE DIT PAS D'OÙ LA FACETTE VIENT — du sac transporté ou de la section de l'arbre. C'est
// voulu : il verrouille l'ARRIVÉE. Le sac est sorti le 2026-09-03 à 00:35, sur ce témoin rendu
// SANS lui (kairos `8d8d50a`, reconstruit 00:33:22) : hz=3 sur 3, voix=3 sur 3. S'il rougit un
// jour, c'est que la section a cessé d'arriver jusqu'à Kairos — chez BPx, chez kairos ou chez
// moi — et aucune confirmation reçue ne vaut contre lui.

/** Une grammaire BP3 native entre par bp3-frontend, jamais par le compilateur BPScript — c'est le
 *  chemin de `grFrontend` dans l'adaptateur. Le banc refuse une grammaire que le frontal refuse. */
function arbreDeGrammaire(src: string): unknown {
  const r = parseBP3(src) as { ast?: unknown; errors?: unknown[] };
  if (!r.ast || (r.errors ?? []).length > 0)
    throw new Error(
      `LA GRAMMAIRE DE CE BANC EST REFUSÉE par bp3-frontend : ${JSON.stringify(r.errors)}`
    );
  return r.ast;
}

function facettesDe(ast: unknown): { notes: number; hz: number; voix: number } {
  const session = createSession(ast as never, { seed: 1 });
  const tree = session.derive().tree;
  const kairos = new Kairos();
  kairos.charger(
    tree as unknown as Parameters<Kairos['charger']>[0],
    contexteDeProjection(session.buildProjectionContext())
  );
  const tl = kairos.arbreCourant();
  let notes = 0;
  let hz = 0;
  let voix = 0;
  for (const e of tl.query(0, tl.duration + 1)) {
    if ((e.kind ?? 'note') !== 'note') continue;
    notes++;
    const c = e.content as { pitch?: { hz?: unknown }; voice?: unknown };
    if (typeof c.pitch?.hz === 'number' && c.pitch.hz > 0) hz++;
    if (c.voice !== undefined && c.voice !== null) voix++;
  }
  return { notes, hz, voix };
}

function facettes(src: string): { notes: number; hz: number; voix: number } {
  return facettesDe(sceneQuiPasse(src, { tempo: 120 }));
}

describe('les facettes de Kairos arrivent sur sa timeline par ma chaîne de production', () => {
  // ⛔ LE TÉMOIN MINIMAL DE MA CHARTE NOMME UNE GRAMMAIRE `.gr`, ET CE BANC L'AVAIT OUBLIÉE. Le
  // 2026-09-03 à 00:40 j'ai retiré le sac sur deux témoins `.bps` verts ; la campagne a rendu
  // CINQ grammaires BP3 muettes (RMS 0 sur quatre vitrines et la tranche verticale). Mesuré ensuite
  // par ma chaîne : `melody.gr` — 8 notes, hz=0, `tree.metadata.librairies` ABSENTE, acteur
  // `default(alphabet="bp3_english")` — et hz=0 AUSSI avec le sac réinjecté : le paquet de kairos
  // (`8d8d50a`) ne lit plus que la section, et une grammaire `.gr` entre par bp3-frontend, qui n'en
  // joint aucune. Ce n'est pas le retrait qui l'a rendue muette, c'est le chemin `.gr` qui n'a
  // plus de source de hauteur. La question — qui joint les librairies d'une grammaire native ? —
  // est chez l'architecte ; ce cas reste ROUGE tant qu'elle n'est pas tranchée et câblée.
  it('la HAUTEUR d’une grammaire BP3 native (`.gr`, alphabet `bp3_english`) arrive aussi', () => {
    const f = facettesDe(arbreDeGrammaire(melodyGr));
    expect(f.notes, 'aucune note sur la timeline — la sonde ne mesure rien').toBeGreaterThan(0);
    expect(
      f.hz,
      `${f.hz} note(s) sur ${f.notes} portent une hauteur. Une grammaire \`.gr\` sans \`pitch.hz\` ` +
        'est MUETTE au runtime — quatorze vitrines BP3 de ma bibliothèque passent par ce chemin.'
    ).toBe(f.notes);
  });

  it('la HAUTEUR : chaque note d’un alphabet occidental porte un `pitch.hz` > 0', () => {
    const f = facettes('core\nalphabet.western:audio\n-----\nS -> C4 E4 G4\n');
    // ANTI-VACUITÉ : zéro note passerait un « toutes ont une hauteur ».
    expect(f.notes, 'aucune note sur la timeline — la sonde ne mesure rien').toBeGreaterThan(0);
    expect(
      f.hz,
      `${f.hz} note(s) sur ${f.notes} portent une hauteur. Une note sans \`pitch.hz\` est MUETTE au ` +
        'runtime, et rien ne le dit : ni le typage, ni le corpus, ni la dérivation.'
    ).toBe(f.notes);
  });

  it('la VOIX : chaque note d’un alphabet de percussion porte un `voice`', () => {
    const f = facettes(tabla);
    expect(f.notes, 'aucune note sur la timeline — la sonde ne mesure rien').toBeGreaterThan(0);
    expect(
      f.voix,
      `${f.voix} note(s) sur ${f.notes} portent une voix. Une scène de tabla sans facette voix ` +
        'est muette au runtime, et rien ne le dit.'
    ).toBe(f.notes);
  });
});
