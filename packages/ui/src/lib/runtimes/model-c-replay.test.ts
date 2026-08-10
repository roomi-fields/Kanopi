import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bpscriptAdapter, setActorsSink, __getBpxDeriveCount } from './bpx-adapter';
import { kronosCursor } from '../../stores/kronos-cursor.svelte';
import { core } from '../core';
import { AudioRuntime } from 'runtime-audio';
import type { KronosAudioHandle } from './kronos-audio';
import { createEventBus } from '../events/bus';
import { initAdapters } from '../runtimes/registry';

// LE REGISTRE SE CONSTRUIT AVEC LE BUS — comme le cœur le fait dans son constructeur. Chaque banc
// qui le lit l'initialise LUI-MÊME : un fichier d'amorce global instancierait toute la chaîne
// AVANT les simulacres et rendrait des espions aveugles (mesuré le 2026-08-10, sept causes).
initAdapters(createEventBus());

// Model C — the DERIVED timeline PERSISTS. Stop returns the playhead to 0 and cuts the
// sound but KEEPS the handle; Play replays the SAME scheduler from 0 with ZERO re-derivation.
// Only a CONTENT change (re-eval/edit) re-derives. This proves it WITHOUT a browser
// (cv-verify-node): drive the real bpx adapter `evaluate` (real BPx derive in jsdom), then
// the Model-C sentinels (`__stop_in_place__` / `__replay__`), and read the derive counter.

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
class FakeFilter {
  frequency = fakeParam();
  Q = fakeParam();
  type = 'lowpass';
  connect() {
    return this;
  }
  disconnect() {}
}
class FakePanner {
  pan = fakeParam();
  connect() {
    return this;
  }
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
    createBiquadFilter() {
      return new FakeFilter();
    }
    createStereoPanner() {
      return new FakePanner();
    }
  };
  (globalThis as unknown as { requestAnimationFrame: () => number }).requestAnimationFrame = () =>
    0;
});
afterEach(() => {
  kronosCursor.set(null);
  vi.restoreAllMocks();
});

// A plain mono scene (no @actor): four notes, loops by default.
const SCENE = `@core
S -> C4 E4 G4 C5
`;

describe('Model C — persisted timeline replays without re-deriving', () => {
  it('eval=1 derive; two Play-from-stopped (replay) stay at 1; a re-eval bumps to 2', async () => {
    setActorsSink(() => {});
    const src = { actorId: 'modelc.bps', fileId: 'modelc.bps' };

    const before = __getBpxDeriveCount();

    // 1) EVAL (Play from a never-derived scene) → derives ONCE and builds the persistent handle.
    await bpscriptAdapter.evaluate(SCENE, src, () => {});
    expect(__getBpxDeriveCount() - before).toBe(1);
    const handle = kronosCursor.active;
    expect(handle).not.toBeNull();
    expect(handle!.transport.state).toBe('running');

    // 2) STOP IN PLACE → playhead to 0, handle KEPT (not discarded), transport 'stopped'.
    await bpscriptAdapter.stop(
      { actorId: '__stop_in_place__', fileId: '__stop_in_place__' },
      () => {}
    );
    expect(kronosCursor.active).toBe(handle); // SAME handle persists
    expect(handle!.transport.state).toBe('stopped');
    expect(handle!.position()).toBeCloseTo(0, 6); // returned to 0
    expect(__getBpxDeriveCount() - before).toBe(1); // no derive on stop

    // 3) REPLAY (Play from stopped) twice → restarts the SAME scheduler, ZERO re-derivation.
    await bpscriptAdapter.stop({ actorId: '__replay__', fileId: '__replay__' }, () => {});
    expect(handle!.transport.state).toBe('running');
    expect(__getBpxDeriveCount() - before).toBe(1);

    await bpscriptAdapter.stop(
      { actorId: '__stop_in_place__', fileId: '__stop_in_place__' },
      () => {}
    );
    await bpscriptAdapter.stop({ actorId: '__replay__', fileId: '__replay__' }, () => {});
    expect(kronosCursor.active).toBe(handle); // STILL the same handle after 2 stop/replay cycles
    expect(handle!.transport.state).toBe('running');
    expect(__getBpxDeriveCount() - before).toBe(1); // two replays: STILL one derive

    // 4) RE-EVAL (an edit / content change) → derives AGAIN (+1) and the previous handle is
    //    fully torn down before the new one (no stacked emitter).
    await bpscriptAdapter.evaluate(SCENE, src, () => {});
    expect(__getBpxDeriveCount() - before).toBe(2);
    const handle2 = kronosCursor.active;
    expect(handle2).not.toBeNull();
    expect(handle2).not.toBe(handle); // a fresh handle replaced the old one
    expect(handle2!.transport.state).toBe('running');
  });

  it('PRODUCE/LOAD builds a PERSISTENT stopped handle; first Play replays with 0 derive', async () => {
    // Model C — a load is a content change: it must BUILD + PERSIST the timeline so the FIRST
    // Play is a replay (0 derivation). Before the fix, produce derived a preview but built NO
    // handle, so the first Play re-derived. Now produce builds a stopped, SILENT handle.
    setActorsSink(() => {});
    const src = { actorId: 'produce.bps', fileId: 'produce.bps', produceOnly: true };
    const before = __getBpxDeriveCount();

    // LOAD / PRODUCE → derives ONCE and builds a persistent handle in STOPPED state, no sound.
    await bpscriptAdapter.evaluate(SCENE, src, () => {});
    expect(__getBpxDeriveCount() - before).toBe(1);
    const handle = kronosCursor.active;
    expect(handle).not.toBeNull(); // handle PERSISTS after load (was null before the fix)
    expect(handle!.transport.state).toBe('stopped'); // built but NOT playing
    expect(handle!.position()).toBeCloseTo(0, 6); // parked at the top

    // FIRST Play (replay) → restarts the SAME scheduler, ZERO re-derivation.
    await bpscriptAdapter.stop({ actorId: '__replay__', fileId: '__replay__' }, () => {});
    expect(handle!.transport.state).toBe('running');
    expect(__getBpxDeriveCount() - before).toBe(1); // first Play: NO derive

    // SECOND Play (stop-in-place → replay) → still 0 derive.
    await bpscriptAdapter.stop(
      { actorId: '__stop_in_place__', fileId: '__stop_in_place__' },
      () => {}
    );
    await bpscriptAdapter.stop({ actorId: '__replay__', fileId: '__replay__' }, () => {});
    expect(kronosCursor.active).toBe(handle);
    expect(__getBpxDeriveCount() - before).toBe(1); // second Play: still NO derive

    // EDIT (re-produce / re-eval) → derives again (+1), fresh handle.
    await bpscriptAdapter.evaluate(SCENE, src, () => {});
    expect(__getBpxDeriveCount() - before).toBe(2);
    expect(kronosCursor.active).not.toBe(handle);
  });

  it('a transport Stop (playback.stop → core.stopInPlace) KEEPS the handle', async () => {
    // THE ROOT-CAUSE GUARD. A transport Stop must STOP IN PLACE, not full-discard: the
    // derived timeline PERSISTS in Kronos so the next Play replays it with zero re-derivation.
    // The host clock is gone — `playback.stop()` routes straight to `core.stopInPlace()`
    // (the `__stop_in_place__` sentinel), which must leave the handle live (kronosCursor.active
    // truthy, transport.state 'stopped'). Proven here through the REAL stop command, not the
    // sentinel directly.
    setActorsSink(() => {});
    const before = __getBpxDeriveCount();
    await bpscriptAdapter.evaluate(SCENE, { actorId: 'hook.bps', fileId: 'hook.bps' }, () => {});
    const handle = kronosCursor.active;
    expect(handle).not.toBeNull();
    expect(handle!.transport.state).toBe('running'); // the eval auto-played the Kronos transport
    expect(__getBpxDeriveCount() - before).toBe(1);

    await core.stopInPlace();
    // `stopInPlace` stops each runtime serially; poll until the transport reports stopped
    // (the handle persisting is the point).
    for (let i = 0; i < 50 && handle!.transport.state !== 'stopped'; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }

    // FIX PROVEN: the handle PERSISTS through the stop (was null before Model C).
    expect(kronosCursor.active).toBe(handle);
    expect(handle!.transport.state).toBe('stopped');
    expect(__getBpxDeriveCount() - before).toBe(1); // the stop did not re-derive
  });

  it('replay is a no-op after a full-teardown stop (handle discarded)', async () => {
    setActorsSink(() => {});
    const src = { actorId: 'teardown.bps', fileId: 'teardown.bps' };
    await bpscriptAdapter.evaluate(SCENE, src, () => {});
    const handle = kronosCursor.active!;
    expect(handle.transport.state).toBe('running');

    // Full discard (scene-change / panic): the handle's one-shot `stop()` poses the
    // teardown flag — a later replay must NOT resurrect it.
    await bpscriptAdapter.stop({ actorId: '__hush__', fileId: '__hush__' }, () => {});
    expect(kronosCursor.active).toBeNull();
    // `active` is the narrow store view at compile time, but at runtime it is the full handle.
    (handle as unknown as KronosAudioHandle).replay();
    expect(handle.transport.state).toBe('stopped'); // stayed down, no resurrection
  });

  it('CVA-INIT — replay RESETS the audio output pristine (so the 1st loop is cold-identical)', async () => {
    // The wiring proof (the pristine BEHAVIOUR is proven upstream: runtime-audio
    // adapter.test.js:447). A `stopInPlace` does NOT tear down the audio render graph, so the
    // PERSISTENT filter nodes (`ctrl::<controlId>`) + the `posed` dedup survive; without a reset
    // the next replay reuses them → the 1st loop is frozen on the previous play's state. The
    // handle's `replay()` must call the AudioRuntime's `reset()` FIRST → pristine 1st loop.
    setActorsSink(() => {});
    const resetSpy = vi.spyOn(AudioRuntime.prototype as unknown as { reset: () => void }, 'reset');
    const src = { actorId: 'cvainit.bps', fileId: 'cvainit.bps' };
    await bpscriptAdapter.evaluate(SCENE, src, () => {});
    const handle = kronosCursor.active!;
    expect(handle.transport.state).toBe('running');
    resetSpy.mockClear(); // ignore any reset during build/eval — isolate the REPLAY

    // STOP-IN-PLACE keeps the handle (audio graph NOT torn down), then REPLAY.
    await bpscriptAdapter.stop(
      { actorId: '__stop_in_place__', fileId: '__stop_in_place__' },
      () => {}
    );
    expect(resetSpy).not.toHaveBeenCalled(); // stopInPlace must NOT reset (that's replay's job)
    await bpscriptAdapter.stop({ actorId: '__replay__', fileId: '__replay__' }, () => {});
    expect(handle.transport.state).toBe('running');
    expect(resetSpy).toHaveBeenCalled(); // reset() fired on replay → pristine 1st loop
  });
});
