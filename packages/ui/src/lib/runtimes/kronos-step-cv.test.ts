import { describe, it, expect } from 'vitest';
import { BreakpointModulation, type ModulationBinding } from '@kronos/core';
import { startKronosAudio } from './kronos-audio';
import type { DispatchEvent } from './tree-dispatch';

// BUG 2 — STEP is inaudible in kronos mode. A stepped beat is sliced and RE-ZEROED
// (onset ≈ 0) but its CV bindings still carry FULL-scene windows. The default render
// anchors on the (re-zeroed) leaf onset, sampling BEFORE the binding window → the
// envelope sits HELD at its closed value → the filter never opens → no sound.
//
// `cvPerNote: true` (set for a sliced step) anchors the render on the binding's OWN
// window so the envelope opens fresh over the note. We capture the curve the adapter
// hands the transport (`event.__modCurves`) — the RealtimeDriver pumps once
// synchronously at `start()`, so the single step note dispatches immediately.

function captureCtx(): AudioContext {
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
      return 0;
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

// An attack-led cutoff envelope, windowed at scene 1.0 s (the note's ORIGINAL
// pre-slice position). After the step slice the note's own onset is re-zeroed to 0.
function cutoffBinding(): ModulationBinding {
  const source = new BreakpointModulation(
    [
      { tSec: 0, value: 0, shape: 'lin' },
      { tSec: 0.1, value: 1, shape: 'lin' },
      { tSec: 0.5, value: 0.3, shape: 'lin' }
    ],
    1.0 // windowStartScene — full-scene window, NOT the re-zeroed onset
  );
  return {
    input: 'cutoff',
    clock: 'signal',
    windowStartScene: 1.0,
    windowEndScene: 1.5,
    source
  } as ModulationBinding;
}

function runStep(cvPerNote: boolean): number[] | undefined {
  let captured: number[] | undefined;
  const transport = {
    send(event: Record<string, unknown>) {
      const mc = event.__modCurves as Record<string, number[]> | undefined;
      if (mc?.cutoff) captured = mc.cutoff;
    }
  };
  // Sliced + re-zeroed step note: onset 0, but the binding keeps its scene-1.0 window.
  const events: DispatchEvent[] = [
    {
      token: 'C4',
      startSec: 0,
      durSec: 0.5,
      type: 'note',
      payload: null,
      modulations: [cutoffBinding()]
    }
  ] as unknown as DispatchEvent[];
  const handle = startKronosAudio({
    events,
    durationSec: 0.5,
    audioCtx: captureCtx(),
    derivedTempo: 60,
    loop: false,
    dispatcher: { duration: 0.5, transports: { default: transport } },
    startSceneSec: 0,
    cvPerNote
  });
  handle.stop();
  return captured;
}

describe('Kronos audio — STEP renders CV per-note (filter opens)', () => {
  it('the BUG: onset-anchored render sits HELD at the closed value (inaudible)', () => {
    const curve = runStep(false);
    expect(curve).toBeDefined();
    const max = Math.max(...curve!);
    // Sampling [0, 0.5] against a window at 1.0 → all before the window → held at 0.
    expect(max).toBeLessThan(1e-6);
  });

  it('the FIX: per-note render OPENS the envelope over the note (ramps up)', () => {
    const curve = runStep(true);
    expect(curve).toBeDefined();
    // Starts ~closed and ramps UP to the envelope peak — the filter opens.
    expect(curve![0]).toBeLessThan(0.05);
    expect(Math.max(...curve!)).toBeGreaterThan(0.9);
    // And it actually rises early (attack within the first 0.1 s of the note).
    const atAttack = curve![Math.floor(0.1 / 0.002)];
    expect(atAttack).toBeGreaterThan(0.9);
  });
});
