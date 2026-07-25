// [769] RATTRAPAGE `_randomize` (décision Romain 2026-07-25, option (a) — voir
// `isRandomizeNeedsClock` + le site d'éval dans bpx-adapter.ts). Deux preuves, sur la VOIE
// ADAPTATEUR réelle (bp3Adapter.evaluate → createSession → derive) :
//
//   PREUVE A — une grammaire `_randomize` DÉRIVE via le retry : le produce pose d'abord la
//   graine FIGÉE ; la dérivation REFUSE (une grammaire à re-semis exige l'horloge) ; l'hôte
//   réessaie UNE fois SANS graine et la grammaire dérive. `createSession` est donc appelé
//   DEUX fois — 1er appel AVEC `seed`, 2e SANS.
//
//   PREUVE B — une grammaire ORDINAIRE garde sa graine : aucun refus `_randomize`, aucun
//   retry — `createSession` appelé UNE seule fois, AVEC `seed`. Le cas normal (99 % des
//   grammaires) ne bascule jamais en horloge.
//
// Espion transparent sur `createSession` (capture les options, dont `seed`, puis DÉLÈGUE au
// vrai — la dérivation réelle tourne). Mêmes mocks que trace-cablage.test.ts (barrel
// `runtime-ui` .svelte incompatible vitest → mock local ; audio factice).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { capturedOptions } = vi.hoisted(() => ({
  capturedOptions: [] as Array<Record<string, unknown> | undefined>
}));

vi.mock('bpx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bpx')>();
  return {
    ...actual,
    createSession: (ast: unknown, options?: Record<string, unknown>) => {
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

// Grammaire à re-semis : le `_randomize` en tête exige l'horloge à la dérivation → REFUSE
// sous une graine figée (BPx lcg.ts requireTime / session.ts:142).
const RANDOMIZE_GRAMMAR = `// @language: bp3
RND
gram#1[1] S --> _randomize {_rndseq C4 D4 E4 F4 G4}
`;

// Grammaire ORDINAIRE (déterministe, aucun re-semis) : dérive sous n'importe quelle graine.
const PLAIN_GRAMMAR = `// @language: bp3
ORD
gram#1[1] S --> C4 D4 E4 F4 G4
`;

const hasSeed = (o: Record<string, unknown> | undefined) =>
  o !== undefined && Object.prototype.hasOwnProperty.call(o, 'seed');

describe('[769] rattrapage `_randomize` — retry SANS graine sur le refus précis', () => {
  beforeEach(() => {
    installFakeAudio();
    setActorsSink(() => {});
    capturedOptions.length = 0;
  });
  afterEach(async () => {
    await bp3Adapter.stop({ actorId: '__hush__', fileId: 'seed-retry.gr' }, () => {});
    kronosCursor.set(null);
    productionFeed.set(null);
  });

  it('PREUVE A — une grammaire `_randomize` DÉRIVE : 1er createSession AVEC graine, retry SANS', async () => {
    // Sans le retry, ce produce lèverait (le refus `_randomize`) et l'éval échouerait.
    await expect(
      bp3Adapter.evaluate(
        RANDOMIZE_GRAMMAR,
        { actorId: 'seed-retry.gr', fileId: 'seed-retry.gr', produceOnly: true },
        () => {}
      )
    ).resolves.toBeUndefined();

    // Exactement deux sessions construites pour CE produce : figée (refusée) puis horloge.
    expect(capturedOptions.length).toBe(2);
    expect(hasSeed(capturedOptions[0])).toBe(true); // 1er essai : graine figée
    expect(hasSeed(capturedOptions[1])).toBe(false); // retry : SANS graine (horloge)
  });

  it('PREUVE B — une grammaire ORDINAIRE garde sa graine : createSession UNE fois, AVEC graine', async () => {
    await expect(
      bp3Adapter.evaluate(
        PLAIN_GRAMMAR,
        { actorId: 'seed-retry.gr', fileId: 'seed-retry.gr', produceOnly: true },
        () => {}
      )
    ).resolves.toBeUndefined();

    // Aucun refus `_randomize` ⇒ aucun retry : une seule session, avec sa graine figée.
    expect(capturedOptions.length).toBe(1);
    expect(hasSeed(capturedOptions[0])).toBe(true);
  });
});
