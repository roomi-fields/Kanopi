// Barrière de chargement des libs perso (trou timing, archi [729]#1).
//
// Prouve, de façon DÉTERMINISTE (ordre de résolution de promesses, sans navigateur), que
// `evaluate` ne peut PAS dériver sur une map perso vide pendant que le fetch cloud est en vol :
// tant qu'un (re)chargement est signalé (`markPersonalPitchLibLoading`) et non terminé
// (`setPersonalPitchLib`), la barrière `whenPersonalPitchLibReady()` reste EN VOL ; elle ne se
// résout qu'à la fin du chargement. C'est exactement l'attente que fait `evaluate` avant de
// dériver (bpx-adapter : `await personalPitchLibReady`).

import { describe, it, expect } from 'vitest';
import {
  markPersonalPitchLibLoading,
  setPersonalPitchLib,
  whenPersonalPitchLibReady
} from './bpx-adapter';

/** Laisse tourner la file des micro-tâches ET un tour de macro-tâche : si la barrière DEVAIT se
 *  résoudre, elle l'aurait fait ici. Un `done` encore faux après ça = barrière réellement en vol. */
const settle = () => new Promise<void>((r) => setTimeout(r, 0));

describe('barrière de chargement des libs perso (trou timing [729]#1)', () => {
  it('reste EN VOL tant que le chargement signalé n’est pas terminé, puis se résout', async () => {
    markPersonalPitchLibLoading(); // un fetch démarre (le composeur le signale AVANT l’async)
    let done = false;
    const waited = whenPersonalPitchLibReady().then(() => {
      done = true;
    });

    await settle();
    expect(done).toBe(false); // le derive attendrait ici — pas de résolution sur map vide

    setPersonalPitchLib({ ragas: '{"domain":"alphabet"}' }); // fin du fetch : map fournie
    await waited;
    expect(done).toBe(true);
  });

  it('est déjà résolue quand rien n’est en cours de chargement (régime établi)', async () => {
    setPersonalPitchLib({}); // aucune barrière en vol
    let done = false;
    whenPersonalPitchLibReady().then(() => {
      done = true;
    });

    await settle();
    expect(done).toBe(true); // attente négligeable — le derive passe sans délai
  });

  it('idempotente : plusieurs signaux de chargement = UNE barrière, résolue une seule fois', async () => {
    markPersonalPitchLibLoading();
    markPersonalPitchLibLoading(); // fires d’effet intermédiaires : ne recréent pas de promesse
    let count = 0;
    const waited = whenPersonalPitchLibReady().then(() => {
      count += 1;
    });

    await settle();
    expect(count).toBe(0); // toujours en vol

    setPersonalPitchLib({ a: '1' }); // une seule reconstruction gagnante lève la barrière
    await waited;
    expect(count).toBe(1);
  });
});
