import { describe, it, expect, vi } from 'vitest';
import { startKronosAudio } from './kronos-audio';
import type { Kairos } from '@kairos/core';

// BUG 1 — re-random / loop must respond to the LIVE transport toggle in kronos mode.
// On the KAIROS path (the single read path) the re-derive is armed on KAIROS
// (`kairos.setReDerive`), NOT the scheduler. The live `setReRandom`/`setLoop` toggle must
// re-arm it, gated by (re-random ⊗ loop), with the SAME host `reDeriveKairos` cb installed.
// (The earlier events-timeline legacy cases — `reDerive` + `scheduler.setReDerive` — were
// removed with that dead path; this Kairos-path case is their replacement.)

function fakeCtx(now: { t: number }): AudioContext {
  const param = () => ({
    setValueAtTime() {},
    setValueCurveAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
    value: 0
  });
  return {
    get currentTime() {
      return now.t;
    },
    createGain: () => ({ gain: param(), connect() {} }),
    createOscillator: () => ({
      frequency: param(),
      detune: param(),
      type: '',
      connect() {},
      start() {},
      stop() {}
    }),
    createBiquadFilter: () => ({ frequency: param(), Q: param(), type: '', connect() {} }),
    createStereoPanner: () => ({ pan: param(), connect() {} }),
    destination: {}
  } as unknown as AudioContext;
}

describe('Kronos audio handle — live re-random / loop toggle', () => {
  // KAN-orchestration P1 — on the KAIROS path the re-derive is armed on KAIROS
  // (`kairos.setReDerive`), not the scheduler. The live `setReRandom`/`setLoop` toggle must
  // re-arm it (the regression was `applyReDerive`'s `if (opts.kairos) return` leaving it inert).
  // We hand a fake Kairos that records every `setReDerive(cb|null)` and assert the arming
  // tracks (re-random ⊗ loop), with the SAME `cb` (the host `reDeriveKairos`) installed.
  it('KAIROS path: setReRandom / setLoop re-arm kairos.setReDerive with the host cb (gated by re-random ⊗ loop)', () => {
    const setReDerive = vi.fn<(cb: (() => void) | null) => void>();
    const fakeKairos = {
      setReDerive,
      // `startKronosAudio` binds this on the Transport; a minimal inert source is enough
      // (no loop edge is crossed in this test — we only assert the arming calls).
      sourceStructure: () => ({
        pullArbre: () => null,
        generation: () => 0,
        drainControlOps: () => [],
        auBord: () => {}
      }),
      demande: () => ({ accepté: true, cycleApplication: null })
    } as unknown as Kairos;

    const reDeriveKairos = vi.fn<() => void>();
    const now = { t: 0 };
    const handle = startKronosAudio({
      durationSec: 1.0,
      audioCtx: fakeCtx(now),
      derivedTempo: 60,
      loop: true,
      startSceneSec: 0,
      kairos: fakeKairos,
      reDeriveKairos,
      reRandom: false // OFF at start
    });
    try {
      // Construction armed with re-random OFF → installed `null` (no re-derive).
      expect(setReDerive).toHaveBeenCalledTimes(1);
      expect(setReDerive).toHaveBeenLastCalledWith(null);

      // Toggle re-random ON live (loop is ON) → re-arm with the host cb (non-null).
      handle.setReRandom(true);
      expect(setReDerive).toHaveBeenCalledTimes(2);
      expect(setReDerive).toHaveBeenLastCalledWith(reDeriveKairos);

      // Toggle re-random OFF live → disarm (null again).
      handle.setReRandom(false);
      expect(setReDerive).toHaveBeenCalledTimes(3);
      expect(setReDerive).toHaveBeenLastCalledWith(null);

      // Re-random ON but loop OFF → gated off (re-random ⊗ loop) → null.
      handle.setReRandom(true);
      expect(setReDerive).toHaveBeenLastCalledWith(reDeriveKairos);
      handle.setLoop(false);
      expect(setReDerive).toHaveBeenLastCalledWith(null);
      // Loop back ON with re-random still ON → re-arms.
      handle.setLoop(true);
      expect(setReDerive).toHaveBeenLastCalledWith(reDeriveKairos);
    } finally {
      handle.stop();
    }
  });
});
