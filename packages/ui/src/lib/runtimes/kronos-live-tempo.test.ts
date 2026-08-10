import { describe, it, expect } from 'vitest';
import { startKronosAudio } from './kronos-audio';
import { kairosFromEvents } from './kairos-test-helpers';
import type { DispatchEvent } from './kairos-test-helpers';

// #5 — live tempo warp must reach the Kronos engine.
// In kronos mode the Kronos handle (not the legacy dispatcher) drives the audio,
// so a live BPM/TAP change must call `handle.retune(bpm)`. On the Kairos path that
// routes through `kairos.demande({type:'tempo', quand:'immediat'})`: the Transport
// drains the op on its next `tick` (while running) and re-anchors the SAME
// InternalClock the scheduler + cursor read. This proves the warp on the PURE clock
// mapping (no audio): after retune + one transport tick the scene→audio rate changes,
// so the playhead advances faster/slower per audio second — WITHOUT re-deriving.
//
// We drive the hardware clock by hand (`now.t`) and read `handle.position()`
// (scene seconds = `musicalNow(now)`), measuring the scene advance per audio
// second before vs after the retune. We pump ONE `transport.tick(now.t)` after each
// retune — the exact thing the RealtimeDriver does — so the queued tempo op applies.

// Long single note so the playhead never folds on the loop during the window we
// measure (we keep loop OFF and stay well within the duration anyway).
const EVENTS: DispatchEvent[] = [
  { token: 'C4', startSec: 0, durSec: 100, type: 'note', payload: null }
] as unknown as DispatchEvent[];

describe('Kronos audio handle — live tempo retune warps the heard tempo', () => {
  it('retune(bpm) changes the scene→audio rate so the playhead advances at the new tempo', () => {
    const now = { t: 0 };
    const handle = startKronosAudio({
      durationSec: 100,
      now: () => now.t,
      sinks: { audio: {} },
      derivedTempo: 60, // events derived at 60 bpm → rate 1 at 60 bpm live
      loop: false,
      startSceneSec: 0,
      kairos: kairosFromEvents(EVENTS, 100)
    });
    try {
      // Phase 1: at the derived tempo (60 bpm live), 1 audio second === 1 scene
      // second (rate 1). Advance 1 audio second and read the scene advance.
      expect(handle.position()).toBeCloseTo(0, 6);
      now.t = 1.0;
      const sceneAt1 = handle.position();
      expect(sceneAt1).toBeCloseTo(1.0, 6); // rate 1 → scene === audio

      // Phase 2: live tempo to 120 bpm. retune re-anchors at the CURRENT instant
      // (scene 1.0, no jump) then doubles the heard tempo → rate 0.5, i.e. 2 scene
      // seconds per audio second. Position must be continuous at the retune instant.
      handle.retune(120);
      handle.transport.tick(now.t); // driver pump drains the queued tempo op
      expect(handle.position()).toBeCloseTo(sceneAt1, 6); // no jump at the retune

      // Advance another audio second: at 120 bpm the scene now advances TWICE as
      // fast, so position climbs by ~2.0 (not 1.0) → the audio time warped.
      now.t = 2.0;
      const sceneAfter = handle.position();
      expect(sceneAfter - sceneAt1).toBeCloseTo(2.0, 6);

      // Phase 3: slow down to 30 bpm (half the derived tempo) → rate 2, i.e. 0.5
      // scene seconds per audio second. Continuity preserved, slope halved.
      const sceneAt2 = handle.position();
      handle.retune(30);
      handle.transport.tick(now.t); // driver pump drains the queued tempo op
      expect(handle.position()).toBeCloseTo(sceneAt2, 6); // continuous
      now.t = 4.0; // +2 audio seconds
      const sceneSlow = handle.position();
      expect(sceneSlow - sceneAt2).toBeCloseTo(1.0, 6); // 2 audio s × 0.5 = 1 scene s
    } finally {
      handle.stop();
    }
  });
});
