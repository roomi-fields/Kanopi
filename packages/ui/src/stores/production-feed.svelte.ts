// The LIVE Kairos instance, surfaced from the eval path to the production views.
//
// Kairos owns the PROJECTION authority: its `structureCourante()` (tree view —
// nesting + resolved names + second spans) and `arbreCourant()` (the flat Kronos
// timeline) ARE the data the views read. Kanopi PROJECTS on it — this store holds a
// READ-ONLY handle on the live instance and exposes those two reads to the UI. It
// invents no shape, recomputes no loop bound / position / structure; everything is
// LU from Kairos (structure/flat) and Kronos (transport, via `kronosCursor`).
//
// A re-random SWAP at the loop edge re-`charger`s the SAME Kairos instance (the
// `#kairos` reference does not change), so a `generation` counter is the reactive
// signal that "the living tree changed" — bumped on every (re)load.

import type { Kairos } from '@kairos/core';
import type { ProductionStructure } from 'runtime-ui';

/** Retour natif de `Kairos.arbreCourant()` (la vue « flat » Kronos). Le type `FlatView`
 *  de runtime-ui a été retiré en v1 (amendement UI-8) : on lit directement le type Kairos,
 *  sans dépendre d'un type de vue amont (que la vue de production ne consomme plus). */
type KairosFlat = ReturnType<Kairos['arbreCourant']>;

class ProductionFeedStore {
  #kairos: Kairos | null = $state(null);
  /** Bumped on every (re)load of Kairos (eval + re-random swap at the loop edge) to
   *  retrigger the views' update: a swap does not change the `#kairos` REFERENCE, so
   *  this counter is the reactive "the living tree changed" signal. */
  generation = $state(0);

  /** Wire the live Kairos instance (eval) or unwire it (teardown). */
  set(kairos: Kairos | null): void {
    this.#kairos = kairos;
    this.generation++;
  }

  /** Signal a swap (re-random) on the SAME instance → re-render the views. */
  swapped(): void {
    if (this.#kairos) this.generation++;
  }

  /** Kairos tree view (structure + resolved names + second spans), or null (no scene
   *  / backtick voice). */
  structure(): ProductionStructure | null {
    return this.#kairos?.structureCourante() ?? null;
  }

  /** Kronos flat (`arbreCourant()`), lu depuis Kairos — exposé par `inspect.flat()` de
   *  l'API publique. Garde : `arbreCourant()` LÈVE quand rien n'est chargé → try/catch → null. */
  plat(): KairosFlat | null {
    if (!this.#kairos) return null;
    try {
      return this.#kairos.arbreCourant();
    } catch {
      return null;
    }
  }
}

export const productionFeed = new ProductionFeedStore();
