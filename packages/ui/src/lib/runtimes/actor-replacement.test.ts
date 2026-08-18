import { describe, it, expect, beforeEach, vi, afterEach, beforeAll } from 'vitest';
import { bpscriptAdapter, setActorsSink, type PublishedActor } from './bpx-adapter';
import { createRealCore } from '../core-real/real-core';
import { createEventBus } from '../events/bus';
import { initAdapters } from './registry';
import * as registry from './registry';

// LE REGISTRE SE CONSTRUIT AVEC LE BUS — comme le cœur le fait en vrai. Ce banc lit des
// adaptateurs AVANT de construire son cœur, il les initialise donc lui-même. C'est le cri
// fail-loud du registre qui l'a révélé ; l'affaiblir pour faire passer le banc aurait rendu au
// produit un « aucune voix reconnue » silencieux.
beforeAll(() => initAdapters(createEventBus()));

class FakeGain {
  gain = { value: 1, setValueAtTime() {} };
  connect() {
    return this;
  }
  disconnect() {}
}
class FakeOsc {
  frequency = { value: 0, setValueAtTime() {} };
  type = 'sine';
  connect() {
    return this;
  }
  start() {}
  stop() {}
  disconnect() {}
}
beforeEach(() => {
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
});

const ORCH = `actor groove eval.strudel
actor viz eval.hydra
S -> { groove_r, viz_r }
groove_r -> groove.\`stack(note("c2*4"))\`
viz_r -> viz.\`osc(60).out()\`
`;

// A plain non-orchestrated program (no actor) — the kind that must REPLACE the
// previous orchestrator's voices with nothing.
//
// LES TERMINAUX SONT DÉCLARÉS, et le choix de `@var` n'est pas indifférent : depuis la
// décision `hub/decisions/2026-07-29-les-formes-declaratives-de-bpscript.md` §5, un terminal ni
// déclaré ni présent dans un alphabet en portée est REFUSÉ — le repli implicite sur lequel
// cette fixture s'appuyait (`c d e f` en lettres nues) n'existe plus.
// POURQUOI `@var` ET NON un alphabet de notes : ce banc mesure la liste d'acteurs publiée, pas
// la musique. `@var` déclare un terminal qui « ne sonne pas » (§5) — la scène redevient
// analysable sans rien envoyer à la synthèse. L'essai avec de vraies notes le prouve a
// contrario : il fait entrer le banc dans le runtime audio, où le faux nœud de gain n'a pas de
// rampe et casse pour une raison qui n'a aucun rapport avec ce qu'on veut prouver.
const PLAIN = `@var c
@var d
@var e
@var f
S -> tone
tone -> c d e f
`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('outgoing code-voice teardown (Hydra canvas leak)', () => {
  it('stops the previous orchestrator hydra voice when a NON-orchestrated scene loads', async () => {
    setActorsSink(() => {});
    const hydra = registry.getAdapter('hydra')!;
    const stopSpy = vi.spyOn(hydra, 'stop').mockResolvedValue(undefined);

    // Orchestrator with a hydra (viz) code voice on file h1.bps.
    await bpscriptAdapter.evaluate(ORCH, { actorId: 'h1.bps', fileId: 'h1.bps' }, () => {});
    await new Promise((r) => setTimeout(r, 20));
    stopSpy.mockClear();

    // Load a DIFFERENT, non-orchestrated program: the outgoing viz voice must be
    // stopped (canvas + rAF), else it keeps rendering on top of the new scene.
    await bpscriptAdapter.evaluate(PLAIN, { actorId: 'h2.bps', fileId: 'h2.bps' }, () => {});
    await new Promise((r) => setTimeout(r, 20));
    expect(stopSpy).toHaveBeenCalled();
    expect(stopSpy.mock.calls[0][0]).toMatchObject({ actorId: 'h1.bps::viz' });

    await bpscriptAdapter.stop({ actorId: '__hush__', fileId: 'h2.bps' }, () => {});
  });

  it('does NOT tear down a hydra voice when the SAME orchestrator re-evaluates', async () => {
    setActorsSink(() => {});
    const hydra = registry.getAdapter('hydra')!;

    await bpscriptAdapter.evaluate(ORCH, { actorId: 's.bps', fileId: 's.bps' }, () => {});
    await new Promise((r) => setTimeout(r, 20));
    const stopSpy = vi.spyOn(hydra, 'stop').mockResolvedValue(undefined);

    // Re-eval the SAME file (Ctrl+Enter again) — its own viz must survive.
    await bpscriptAdapter.evaluate(ORCH, { actorId: 's.bps', fileId: 's.bps' }, () => {});
    await new Promise((r) => setTimeout(r, 20));
    expect(stopSpy).not.toHaveBeenCalled();

    await bpscriptAdapter.stop({ actorId: '__hush__', fileId: 's.bps' }, () => {});
  });

  it('tears down the OUTGOING orchestrator voice (kills the re-firing loop)', async () => {
    setActorsSink(() => {});
    const hydra = registry.getAdapter('hydra')!;
    const stopSpy = vi.spyOn(hydra, 'stop').mockResolvedValue(undefined);

    // Load orchestrator d1.bps — its hydra (viz) voice loops and re-fires each cycle.
    await bpscriptAdapter.evaluate(ORCH, { actorId: 'd1.bps', fileId: 'd1.bps' }, () => {});
    await new Promise((r) => setTimeout(r, 20));
    stopSpy.mockClear();

    // Load a DIFFERENT orchestrator d2.bps: the outgoing d1 voice must be torn down
    // so it stops re-firing d1's hydra/strudel voices (the 19-re-fire leak this fixes).
    await bpscriptAdapter.evaluate(ORCH, { actorId: 'd2.bps', fileId: 'd2.bps' }, () => {});
    await new Promise((r) => setTimeout(r, 20));
    expect(stopSpy).toHaveBeenCalled();
    expect(stopSpy.mock.calls[0][0]).toMatchObject({ actorId: 'd1.bps::viz' });

    await bpscriptAdapter.stop({ actorId: '__hush__', fileId: 'd2.bps' }, () => {});
  });
});

describe('orchestrated → non-orchestrated actor replacement', () => {
  it('publishes the actor list for an orchestrator and an EMPTY list for a plain scene', async () => {
    const publishes: PublishedActor[][] = [];
    setActorsSink((a) => publishes.push(a));

    await bpscriptAdapter.evaluate(ORCH, { actorId: 'o.bps', fileId: 'o.bps' }, () => {});
    await bpscriptAdapter.evaluate(PLAIN, { actorId: 'p.bps', fileId: 'p.bps' }, () => {});

    expect(publishes.length).toBeGreaterThanOrEqual(2);
    expect(publishes[0].map((p) => p.name).sort()).toEqual(['groove', 'viz']);
    // The plain scene publishes an empty list → the panel drops groove/viz.
    expect(publishes[publishes.length - 1]).toEqual([]);

    await bpscriptAdapter.stop({ actorId: '__hush__', fileId: 'o.bps' }, () => {});
  });
});

describe('real-core actors sink: empty publish clears only orchestrator actors', () => {
  it('clears groove/viz on an empty publish after an orchestrator published them', async () => {
    // The real core installs its own actors sink in the constructor; the last
    // constructed core wins the module-global `setActorsSink`. Build it, then
    // drive the sink through the adapter evals.
    const core = createRealCore();

    await bpscriptAdapter.evaluate(ORCH, { actorId: 'o.bps', fileId: 'o.bps' }, () => {});
    expect(
      core.actors
        .list()
        .map((a) => a.name)
        .sort()
    ).toEqual(['groove', 'viz']);

    await bpscriptAdapter.evaluate(PLAIN, { actorId: 'p.bps', fileId: 'p.bps' }, () => {});
    // The Actors panel no longer shows the orchestrator voices.
    expect(core.actors.list()).toEqual([]);

    await bpscriptAdapter.stop({ actorId: '__hush__', fileId: 'o.bps' }, () => {});
  });
});
