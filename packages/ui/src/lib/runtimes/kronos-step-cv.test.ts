import { describe, it, expect } from 'vitest';
import { BreakpointModulation, renderToBreakpoints, type ModulationBinding } from '@kronos/core';
import { startKronosAudio } from './kronos-audio';
import type { DispatchEvent } from './tree-dispatch';

// STEP = audition ONE beat of the REAL production, in place — NOT a sliced + re-zeroed
// copy. The host builds the SAME full timeline as normal Play (real scene times, full
// CV windows) and asks Kronos to seek to the beat's scene-second and stop after one
// beat. So the CV the transport receives for a stepped beat must be IDENTICAL to what
// full Play sends for that same beat: the envelope opens for real (not shrunk-to-note),
// and a later beat auditions its OWN modulation (no mute).
//
// We capture the curve the adapter hands the transport (`event.__modCurves`). The
// RealtimeDriver pumps once synchronously at `start()`, so the note(s) within the seek
// window + lookahead dispatch immediately.

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

// An attack-led cutoff envelope on a note at scene `onset` s (its TRUE position in the
// full production). The binding window IS the note's scene window — exactly what the
// full-production composer produces (no re-window).
function cutoffEnvNote(token: string, onset: number, dur: number): DispatchEvent {
  const source = new BreakpointModulation(
    [
      { tSec: 0, value: 0, shape: 'lin' },
      { tSec: 0.1, value: 1, shape: 'lin' },
      { tSec: 0.5, value: 0.3, shape: 'lin' }
    ],
    onset // windowStartScene = the note's real scene onset
  );
  const binding: ModulationBinding = {
    input: 'cutoff',
    clock: 'signal',
    windowStartScene: onset,
    windowEndScene: onset + dur,
    source
  } as ModulationBinding;
  return {
    token,
    startSec: onset,
    durSec: dur,
    type: 'note',
    payload: null,
    modulations: [binding]
  } as unknown as DispatchEvent;
}

// Capture all cutoff curves the transport receives, keyed by the note token.
function capturePlay(opts: {
  events: DispatchEvent[];
  step?: { fromSec: number; durSec: number };
  loop?: boolean;
}): Record<string, number[]> {
  const curves: Record<string, number[]> = {};
  const transport = {
    send(event: Record<string, unknown>) {
      const mc = event.__modCurves as Record<string, number[]> | undefined;
      if (mc?.cutoff) curves[String(event.token)] = mc.cutoff;
    }
  };
  const totalDur = Math.max(...opts.events.map((e) => e.startSec + e.durSec), 0);
  const handle = startKronosAudio({
    events: opts.events,
    durationSec: totalDur,
    audioCtx: captureCtx(),
    derivedTempo: 60,
    loop: opts.loop ?? false,
    dispatcher: { duration: totalDur, transports: { default: transport } },
    step: opts.step
  });
  handle.stop();
  return curves;
}

describe('Kronos audio — STEP auditions one beat of the REAL production (no re-window)', () => {
  // A 3-beat scene at 60 bpm: one cutoff-enveloped note per beat (scene 0, 1, 2 s).
  const scene = (): DispatchEvent[] => [
    cutoffEnvNote('B0', 0, 0.5),
    cutoffEnvNote('B1', 1, 0.5),
    cutoffEnvNote('B2', 2, 0.5)
  ];

  it('the envelope OPENS for real (not held closed, not shrunk-to-note)', () => {
    // STEP beat 0: seek to scene 0, stop after one beat (60/60 = 1 s).
    const step = capturePlay({ events: scene(), step: { fromSec: 0, durSec: 1 } });
    expect(step.B0).toBeDefined();
    // Starts ~closed and ramps UP to the envelope peak — the filter opens.
    expect(step.B0[0]).toBeLessThan(0.05);
    expect(Math.max(...step.B0)).toBeGreaterThan(0.9);
    // Attack reached within the first 0.1 s of the note (true envelope, not shrunk).
    const atAttack = step.B0[Math.floor(0.1 / 0.002)];
    expect(atAttack).toBeGreaterThan(0.9);
  });

  it('STEP CV == full-Play CV for the first beat (bit-for-bit, no distortion)', () => {
    // Full Play and STEP-of-beat-0 both seek the timeline to scene 0, so the curve the
    // transport receives for beat 0 must be IDENTICAL — STEP does not re-window.
    // (The synchronous test pump only dispatches the beat at the seek point + lookahead;
    //  later beats fire on later real ticks, which a synchronous stop() never reaches —
    //  hence per-beat equality is asserted against the source render below.)
    const full = capturePlay({ events: scene() });
    const step0 = capturePlay({ events: scene(), step: { fromSec: 0, durSec: 1 } });
    expect(full.B0).toBeDefined();
    expect(step0.B0).toBeDefined();
    expect(step0.B0).toEqual(full.B0);
  });

  it('each stepped beat = its source over its TRUE scene window (not shrunk-to-note)', () => {
    // The exact full-production curve for a note at scene `onset`: its source rendered
    // over the note's REAL scene window [onset, onset+dur] (the same call the adapter
    // makes in full Play). STEP must reproduce it bit-for-bit — proving no re-window /
    // no shrink-to-note distortion.
    for (const [i, token] of ['B0', 'B1', 'B2'].entries()) {
      const onset = i;
      const note = scene()[i];
      const src = note.modulations![0].source;
      const expected = renderToBreakpoints(src, onset, onset + 0.5, 0.002).map((p) => p.value);
      const step = capturePlay({ events: scene(), step: { fromSec: onset, durSec: 1 } });
      expect(step[token], `beat ${i} (${token}) dispatched`).toBeDefined();
      expect(step[token]).toEqual(expected);
    }
  });

  it('successive steps each audition their OWN beat (later beats are NOT muted)', () => {
    // The bug a per-note re-window introduced: beat 0 sounded, beats 1+ came out muted.
    // Each step must produce a real (opening) envelope for its own note.
    for (const [i, token] of ['B0', 'B1', 'B2'].entries()) {
      const step = capturePlay({ events: scene(), step: { fromSec: i, durSec: 1 } });
      expect(step[token], `beat ${i} audible`).toBeDefined();
      expect(Math.max(...step[token]), `beat ${i} envelope opens`).toBeGreaterThan(0.9);
    }
  });

  it('a STEP seeks PAST earlier beats: only the stepped beat dispatches', () => {
    // Stepping beat 2 must not also fire beats 0/1 (the seek prunes earlier events).
    const step = capturePlay({ events: scene(), step: { fromSec: 2, durSec: 1 } });
    expect(step.B2).toBeDefined();
    expect(step.B0).toBeUndefined();
    expect(step.B1).toBeUndefined();
  });
});
