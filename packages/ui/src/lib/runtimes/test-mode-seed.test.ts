// [921] MODE TEST — graine figée au lancement (`?seed=N`). Preuves sur la VOIE ADAPTATEUR réelle
// (bp3Adapter.evaluate → createSession → derive), espion transparent sur `createSession` capturant
// la valeur de `seed`. Le mode est lu sur `window.location` (jsdom) : chaque test pose/retire le
// paramètre autour du produce.
//
//   PREUVE 1 — `?seed=42` : DEUX produces d'affilée posent EXACTEMENT `seed:42` → la session est
//   reproductible (même graine ⇒ même suite). C'est le pont vers le comparateur.
//
//   PREUVE 2 — SANS paramètre : deux produces posent des graines DIFFÉRENTES (freshSeed) → le
//   défaut vivant est strictement intact, zéro régression.
//
//   PREUVE 3 — `?seed=42` + grammaire `_randomize` : le produce REFUSE (rejette), et `createSession`
//   n'est appelé QU'UNE fois, AVEC `seed:42` — le retry sans graine NE s'arme PAS en mode test
//   (reproductibilité tenue OU refus honnête, jamais un retry silencieux).
//
// (Le badge visible + la suite EXACTE `a a b b …` sur flags.gr sont prouvés à l'écran, pas ici.)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { capturedOptions } = vi.hoisted(() => ({
  capturedOptions: [] as Array<Record<string, unknown> | undefined>
}));

vi.mock('bpx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bpx')>();
  return {
    ...actual,
    // L'espion ne RE-DECLARE pas le type de l'arbre : il le prend a la source
    // (`Parameters<…>[0]`). Le typer `unknown` ici effaçait `SceneAST` pour tout
    // l'appel en aval — c'est ce qui avait fait imputer l'erreur a BPx a tort ([951]).
    createSession: (
      ast: Parameters<typeof actual.createSession>[0],
      options?: Record<string, unknown>
    ) => {
      capturedOptions.push(options);
      return actual.createSession(ast, options as Parameters<typeof actual.createSession>[1]);
    }
  };
});

vi.mock('runtime-ui', () => ({
  traceEnabled: () => false,
  setTraceEnabled: () => {}
}));

import { bp3Adapter, setActorsSink } from './bpx-adapter';
import { kronosCursor } from '../../stores/kronos-cursor.svelte';
import { productionFeed } from '../../stores/production-feed.svelte';

const fakeParam = () => ({
  value: 0,
  setValueAtTime() {},
  setValueCurveAtTime() {},
  linearRampToValueAtTime() {},
  exponentialRampToValueAtTime() {},
  cancelScheduledValues() {}
});
class FakeGain {
  gain = fakeParam();
  connect() {
    return this;
  }
  disconnect() {}
}
class FakeOsc {
  frequency = fakeParam();
  detune = fakeParam();
  type = 'sine';
  connect() {
    return this;
  }
  start() {}
  stop() {}
  disconnect() {}
}
function installFakeAudio() {
  (globalThis as unknown as { AudioContext: unknown }).AudioContext = class {
    currentTime = 0;
    state = 'running';
    destination = {};
    resume() {
      return Promise.resolve();
    }
    createGain() {
      return new FakeGain();
    }
    createOscillator() {
      return new FakeOsc();
    }
  };
  (globalThis as unknown as { requestAnimationFrame: () => number }).requestAnimationFrame = () =>
    0;
}

// Pose / retire `?seed=` sur l'URL de l'onglet (jsdom) — c'est CE que lit `lib/test-mode.ts`.
function setUrlSeed(seed: number | null) {
  const url = seed === null ? '/' : `/?seed=${seed}`;
  window.history.replaceState({}, '', url);
}

const PLAIN_GRAMMAR = `// @language: bp3
ORD
gram#1[1] S --> C4 D4 E4 F4 G4
`;
// Grammaire à re-semis : `_randomize` en tête exige l'horloge → REFUSE sous graine figée.
const RANDOMIZE_GRAMMAR = `// @language: bp3
RND
gram#1[1] S --> _randomize {_rndseq C4 D4 E4 F4 G4}
`;

const seedOf = (o: Record<string, unknown> | undefined) => o?.seed as number | undefined;

async function produce(src: string) {
  await bp3Adapter.evaluate(
    src,
    { actorId: 'test-mode.gr', fileId: 'test-mode.gr', produceOnly: true },
    () => {}
  );
}

describe('[921] mode test — `?seed=N` fige la graine sur tous les produces', () => {
  beforeEach(() => {
    installFakeAudio();
    setActorsSink(() => {});
    capturedOptions.length = 0;
  });
  afterEach(async () => {
    await bp3Adapter.stop({ actorId: '__hush__', fileId: 'test-mode.gr' }, () => {});
    kronosCursor.set(null);
    productionFeed.set(null);
    setUrlSeed(null);
  });

  it('PREUVE 1 — `?seed=42` : deux produces posent EXACTEMENT seed:42', async () => {
    setUrlSeed(42);
    await produce(PLAIN_GRAMMAR);
    await produce(PLAIN_GRAMMAR);
    const seeds = capturedOptions.map(seedOf);
    expect(seeds.length).toBeGreaterThanOrEqual(2);
    for (const s of seeds) expect(s).toBe(42);
  });

  it('PREUVE 2 — SANS paramètre : deux produces posent des graines DIFFÉRENTES (vivant intact)', async () => {
    setUrlSeed(null);
    await produce(PLAIN_GRAMMAR);
    const firstSeed = seedOf(capturedOptions[0]);
    capturedOptions.length = 0;
    await produce(PLAIN_GRAMMAR);
    const secondSeed = seedOf(capturedOptions[0]);
    expect(firstSeed).toBeTypeOf('number');
    expect(secondSeed).toBeTypeOf('number');
    expect(secondSeed).not.toBe(firstSeed);
  });

  it('PREUVE 3 — `?seed=42` + `_randomize` : REFUSE, une seule session AVEC seed, PAS de retry', async () => {
    setUrlSeed(42);
    await expect(produce(RANDOMIZE_GRAMMAR)).rejects.toThrow(/reseedOrShuffle|wall-clock/);
    // Une seule session construite : la figée, refusée. Aucun retry sans graine (≠ hors mode test).
    expect(capturedOptions.length).toBe(1);
    expect(seedOf(capturedOptions[0])).toBe(42);
  });
});
