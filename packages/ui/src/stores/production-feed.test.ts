import { describe, it, expect } from 'vitest';
import type { Kairos } from '@kairos/core';
import { productionFeed } from './production-feed.svelte';

// The store is a read-only projection of the live Kairos instance: structure()/plat()
// must DELEGATE to the handle (never recompute), set(null) clears, arbreCourant() that
// THROWS yields plat()=null, and (re)load/swap bumps `generation` so the views re-render.

const fakeStructure = {
  root: { type: 'event', name: 'a', span: { start: 0, end: 1 } },
  durationSec: 4
};
const fakeTimeline = { query: () => [], duration: 4 };

function fakeKairos(opts: { throwsFlat?: boolean } = {}): Kairos {
  return {
    structureCourante: () => fakeStructure,
    arbreCourant: () => {
      if (opts.throwsFlat) throw new Error('rien chargé');
      return fakeTimeline;
    }
  } as unknown as Kairos;
}

describe('productionFeed — projection read-only de Kairos vivant', () => {
  it('set(kairos) → structure()/plat() délèguent au handle', () => {
    productionFeed.set(fakeKairos());
    expect(productionFeed.structure()).toBe(fakeStructure);
    expect(productionFeed.plat()).toBe(fakeTimeline);
  });

  it('set(null) → structure()/plat() rendent null', () => {
    productionFeed.set(null);
    expect(productionFeed.structure()).toBeNull();
    expect(productionFeed.plat()).toBeNull();
  });

  it('arbreCourant() qui lève → plat() rend null (try/catch), structure() inchangée', () => {
    productionFeed.set(fakeKairos({ throwsFlat: true }));
    expect(productionFeed.plat()).toBeNull();
    expect(productionFeed.structure()).toBe(fakeStructure);
  });

  it('set() et swapped() bumpent generation ; swapped() sans handle ne bump pas', () => {
    productionFeed.set(fakeKairos());
    const g0 = productionFeed.generation;
    productionFeed.swapped();
    expect(productionFeed.generation).toBe(g0 + 1);

    productionFeed.set(null);
    const gNull = productionFeed.generation;
    productionFeed.swapped(); // pas de handle → pas de bump
    expect(productionFeed.generation).toBe(gNull);
  });
});
