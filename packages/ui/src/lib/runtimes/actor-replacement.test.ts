import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { bpscriptAdapter, setActorsSink, type PublishedActor } from './bp3';
import { createRealCore } from '../core-real/real-core';
import * as registry from './registry';

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

const ORCH = `@actor groove transport.audio eval.strudel
@actor viz transport.video eval.hydra
S -> { groove, viz }
groove -> \`stack(note("c2*4"))\`
viz -> \`osc(60).out()\`
`;

// A plain non-orchestrated program (no @actor) — the kind that must REPLACE the
// previous orchestrator's voices with nothing.
const PLAIN = `S -> tone
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

  it('stops the OUTGOING orchestrator dispatcher (kills the re-firing loop)', async () => {
    setActorsSink(() => {});
    const { Dispatcher } = await import('../../../../core/src/dispatcher/dispatcher.js');
    type DispatcherInstance = InstanceType<typeof Dispatcher>;
    const dispatcherStops: DispatcherInstance[] = [];
    const origStop = (Dispatcher.prototype as unknown as { stop: () => void }).stop;
    vi.spyOn(Dispatcher.prototype as unknown as { stop: () => void }, 'stop').mockImplementation(
      function (this: DispatcherInstance) {
        dispatcherStops.push(this);
        return origStop.call(this);
      }
    );

    // Load orchestrator d1.bps — its dispatcher loops and re-fires viz/groove.
    await bpscriptAdapter.evaluate(ORCH, { actorId: 'd1.bps', fileId: 'd1.bps' }, () => {});
    await new Promise((r) => setTimeout(r, 20));
    const d1Dispatcher = dispatcherStops.length; // record nothing-stopped baseline
    dispatcherStops.length = 0;

    // Load a DIFFERENT orchestrator d2.bps: the d1 dispatcher MUST be stopped so it
    // stops re-firing d1's hydra/strudel voices (the 19-re-fire leak this fixes).
    await bpscriptAdapter.evaluate(ORCH, { actorId: 'd2.bps', fileId: 'd2.bps' }, () => {});
    await new Promise((r) => setTimeout(r, 20));
    // At least one dispatcher (d1's) was stopped on the d2 load.
    expect(dispatcherStops.length).toBeGreaterThan(0);
    void d1Dispatcher;

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

  it('does NOT wipe a .kanopi session (flag false) on a non-orchestrated eval', async () => {
    const core = createRealCore();
    // A .kanopi session owns its actors via loadSession (sets the flag false).
    await core.loadSession('@actor melody melody.strudel strudel\n');
    const sessionActors = core.actors.list().map((a) => a.name);
    expect(sessionActors).toContain('melody');

    // A non-orchestrated `.bps` actor eval publishes an empty list — it must be a
    // no-op for the session-owned actors.
    await bpscriptAdapter.evaluate(PLAIN, { actorId: 'melody', fileId: 'melody' }, () => {});
    expect(core.actors.list().map((a) => a.name)).toContain('melody');

    await bpscriptAdapter.stop({ actorId: '__hush__', fileId: 'melody' }, () => {});
  });
});
