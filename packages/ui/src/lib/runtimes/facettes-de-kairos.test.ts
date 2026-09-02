import { describe, it, expect } from 'vitest';
import { sceneQuiPasse } from '../library/scene-de-banc';
import { createSession } from 'bpx';
import { Kairos } from '@kairos/core';
import { contexteDeProjection } from './bpx-adapter';
import tabla from '../../../../library/scenes/BPScript-tests/kairos-voix-tabla.bps?raw';

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
// voulu : il verrouille l'ARRIVÉE. Le jour où le sac sort, ce banc doit rester vert SANS lui ;
// s'il rougit, le retrait est faux sur ma chaîne, quoi qu'en dise une confirmation reçue.

function facettes(src: string): { notes: number; hz: number; voix: number } {
  const ast = sceneQuiPasse(src, { tempo: 120 });
  const session = createSession(ast, { seed: 1 });
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

describe('les facettes de Kairos arrivent sur sa timeline par ma chaîne de production', () => {
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
