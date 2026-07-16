import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startKronosAudio } from './kronos-audio';
import { kairosFromEvents } from './kairos-test-helpers';
import type { DispatchEvent } from './kairos-test-helpers';
import { AudioRuntime } from 'runtime-audio';

// seek-daw fix (décision architecte [735] + confirmation Kronos [736]) — BUG discriminé à
// l'écran : un SEEK depuis l'ARRÊT (`ProductionViewHost.svelte` appelle `transport.playFrom(sec)`
// DIRECTEMENT sur le Transport Kronos, PASSE-PLAT pur, jamais via le handle) fait bien passer le
// transport 'running' mais laissait l'AUDIO MUET — le pompage (`driver`) n'était (ré)établi que
// dans les commandes IMPÉRATIVES du handle (`replay()`/`resume()`/le Play initial), jamais sur la
// transition transport observée. Ce test PROUVE, SANS handle command (bypass total — exactement le
// chemin de la vue), que la transition stopped→running réétablit la sortie audio : `reset()` tourne
// (graphe périmé démonté) ET le pompage envoie à nouveau des événements au runtime audio.

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
  vi.restoreAllMocks();
});

// One note at the scene start — within the driver's lookahead window (0.12s default) so the
// very first pump sends it deterministically (fixed `now: () => 0` seam, no real-timer race).
// `output.runtime: 'audio'` (KAI-9 routing label) — WITHOUT it the scheduler has no route key
// (no `actor`, no default adapter registered) and silently drops the event, never reaching the
// AudioRuntime's `send()` the spy watches.
const EVENTS: DispatchEvent[] = [
  {
    token: 'C4',
    startSec: 0,
    durSec: 4,
    type: 'note',
    payload: null,
    output: { runtime: 'audio' }
  } as unknown as DispatchEvent
];

describe('seek-daw — transport.playFrom(sec) FROM STOPPED re-establishes the audio output', () => {
  it('bypassing the handle entirely (calling transport.playFrom directly, the ProductionViewHost path) still resets + re-pumps', () => {
    const resetSpy = vi.spyOn(AudioRuntime.prototype as unknown as { reset: () => void }, 'reset');
    const sendSpy = vi.spyOn(AudioRuntime.prototype as unknown as { send: () => void }, 'send');

    const handle = startKronosAudio({
      now: () => 0,
      derivedTempo: 120,
      loop: true,
      startSceneSec: 0,
      kairos: kairosFromEvents(EVENTS, 4)
    });

    // Initial play (construction) already sounds — the FIRST pump sent the note.
    expect(handle.transport.state).toBe('running');
    expect(sendSpy).toHaveBeenCalled();

    // STOP-IN-PLACE (Model C transport Stop): playhead to 0, driver parked, handle KEPT.
    handle.stopInPlace();
    expect(handle.transport.state).toBe('stopped');
    resetSpy.mockClear();
    sendSpy.mockClear();

    // THE BUG PATH: the view's seek calls `transport.playFrom(sec)` DIRECTLY on the Kronos
    // Transport — NOT `handle.replay()`, NOT any handle command. Before the fix, nothing in
    // `startKronosAudio` observed this transition, so the driver stayed parked (silent).
    handle.transport.playFrom(0);

    // FIX PROVEN: the reactive listener on `transport.onStateChange` sees the SAME
    // stopped→running transition Kronos confirms is identical to `stop()+play()` ([736]), and
    // re-establishes the output — reset() runs (pristine 1st loop, CVA-INIT) AND the pump
    // actually resumed sending (audio is NOT muted).
    expect(handle.transport.state).toBe('running');
    expect(resetSpy).toHaveBeenCalled();
    expect(sendSpy).toHaveBeenCalled();

    handle.stop();
  });

  it('a RESUME (paused→running) does NOT reset the render graph — only a REPLAY (stopped→running) does', () => {
    const resetSpy = vi.spyOn(AudioRuntime.prototype as unknown as { reset: () => void }, 'reset');

    // Degenerate (empty) timeline: `loopDurationScene() === 0` makes Kronos's quantized `pause()`
    // freeze IMMEDIATELY (`dur <= 0` branch, synchronous, no tick needed) — a deterministic
    // paused→running edge to exercise without racing the real ~25ms driver interval.
    const handle = startKronosAudio({
      now: () => 0,
      derivedTempo: 120,
      loop: true,
      startSceneSec: 0,
      kairos: kairosFromEvents([], 0)
    });
    expect(handle.transport.state).toBe('running');
    resetSpy.mockClear();

    handle.transport.pause();
    expect(handle.transport.state).toBe('paused');
    resetSpy.mockClear();

    // Reprise EN PLACE (Model C `resume`) — the paused→running edge must NOT reset (portamento /
    // persistent filter nodes survive a pause, per `resume()`'s own contract in kronos-audio.ts).
    handle.resume(0);
    expect(handle.transport.state).toBe('running');
    expect(resetSpy).not.toHaveBeenCalled();

    handle.stop();
  });
});
