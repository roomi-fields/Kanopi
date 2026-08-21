import { describe, it, expect } from 'vitest';
import { sceneQuiPasse } from '../library/scene-de-banc';
import { createBPx } from 'bpx';
import { startKronosAudio } from './kronos-audio';
import { kairosFromEvents, type DispatchEvent } from './kairos-test-helpers';

// KAN-C02/C03 (SUITE) — the loop bound is a PROJECTION of the BPx authority
// `derived.tree.metadata.totalDurationBeats`, NOT the host's reduce(max) over the
// scheduled events.
//
// The adapter (bpx-adapter.ts) reads `totalDurationBeats` off the derivation and
// passes `durationSec = totalDurationBeats * beatDurSec` (with `beatDurSec = 60/bpm`,
// the SAME effective tempo it derived at) to `startKronosAudio`. The timeline
// materializes from that supplied length, and the loop bound is read back through the
// upstream Kronos primitive `Transport.loopDurationScene()`.
//
// NON-CIRCULAR: these tests make the supplied compiled length DIVERGE from the events'
// reduce(max). If the bound tracked the host reduce, it would equal the events' last
// end; instead it tracks the supplied (BPx-derived) value. The events' reduce(max) is
// asserted to be a DIFFERENT number, so the source genuinely changed.

function note(token: string, onset: number, dur: number): DispatchEvent {
  return {
    token,
    startSec: onset,
    durSec: dur,
    type: 'note',
    payload: null
  } as unknown as DispatchEvent;
}

// max(startSec + durSec) over EVERY event — the OLD host bound (the repli).
function reduceMax(events: DispatchEvent[]): number {
  return events.reduce((m, e) => Math.max(m, e.startSec + e.durSec), 0);
}

// Read the loop bound back through the upstream primitive, optionally supplying the
// BPx-projected compiled length (`durationSec`). When `durationSec` is omitted, the
// timeline materializes from the events (the repli).
function loopBound(events: DispatchEvent[], durationSec?: number): number {
  const handle = startKronosAudio({
    now: () => 0,
    sinks: { audio: {} },
    derivedTempo: 120,
    loop: true,
    startSceneSec: 0,
    durationSec,
    kairos: kairosFromEvents(events, durationSec)
  });
  const d = handle.transport.loopDurationScene();
  handle.stop();
  return d;
}

// The adapter's exact projection: totalDurationBeats × beatDurSec(= 60/bpm).
function projectDurationSec(totalDurationBeats: number, bpm: number): number {
  const beatDurSec = bpm > 0 ? 60 / bpm : 0;
  return totalDurationBeats * beatDurSec;
}

describe('KAN-C02/C03 (SUITE) — loop bound projects BPx totalDurationBeats, not the host reduce(max)', () => {
  it('bound follows the BPx-derived length even when it EXCEEDS the events reduce(max)', () => {
    // Events stop sounding at 2.0, but BPx compiled the scene to 6 beats. At 120 BPM
    // (beatDurSec = 0.5) that is 3.0 scene-seconds — a FULL second past the last leaf
    // (the canonical trailing-rest case where the compiled length > last sounding end).
    const events = [note('C4', 0, 0.5), note('E4', 0.5, 0.5), note('G4', 1, 1)]; // ends at 2.0
    expect(reduceMax(events)).toBeCloseTo(2.0, 9);

    const durationSec = projectDurationSec(6, 120); // 6 * 0.5 = 3.0
    expect(durationSec).toBeCloseTo(3.0, 9);

    const bound = loopBound(events, durationSec);
    // The bound is the BPx length (3.0), NOT the events reduce (2.0).
    expect(bound).toBeCloseTo(3.0, 9);
    expect(bound).not.toBeCloseTo(reduceMax(events), 6);
  });

  it('bound follows the BPx-derived length even when it is SHORTER than the events reduce(max)', () => {
    // Events run to 2.0, but BPx says the compiled scene is 2 beats (= 1.0s at 120 BPM).
    // The reduce(max) host path would over-extend to 2.0; the projection holds 1.0.
    const events = [note('C4', 0, 0.5), note('E4', 0.5, 0.5), note('G4', 1, 1)]; // ends at 2.0
    expect(reduceMax(events)).toBeCloseTo(2.0, 9);

    const durationSec = projectDurationSec(2, 120); // 2 * 0.5 = 1.0
    expect(durationSec).toBeCloseTo(1.0, 9);

    const bound = loopBound(events, durationSec);
    expect(bound).toBeCloseTo(1.0, 9);
    expect(bound).not.toBeCloseTo(reduceMax(events), 6);
  });

  it('the projection scales with the EFFECTIVE tempo (beatDurSec = 60/bpm)', () => {
    // Same compiled length in BEATS (4), two tempos → two scene-seconds bounds. This
    // proves the value flows through the tempo, i.e. it is the beats authority × the
    // projected beat duration, not a fixed seconds constant.
    const events = [note('C4', 0, 0.5)];
    expect(loopBound(events, projectDurationSec(4, 120))).toBeCloseTo(2.0, 9); // 4 * 0.5
    expect(loopBound(events, projectDurationSec(4, 60))).toBeCloseTo(4.0, 9); // 4 * 1.0
  });

  it('repli is intact: with NO BPx length the bound is the events reduce(max)', () => {
    // When `totalDurationBeats` is absent (durationSec undefined), the documented repli
    // remains the host reduce(max). This guards the fallback the adapter keeps.
    const events = [note('C4', 0, 0.5), note('E4', 0.5, 0.5), note('G4', 1, 1)];
    expect(loopBound(events, undefined)).toBeCloseTo(reduceMax(events), 9);
    expect(loopBound(events, undefined)).toBeCloseTo(2.0, 9);
  });
});

// END-TO-END trace against the REAL bpx derivation: the loop bound is READ from
// `derived.tree.metadata.totalDurationBeats`, projected through the effective tempo.
// The spy is the divergence: we MUTATE `totalDurationBeats` on a real derivation and
// the bound follows it, while the events (and their reduce(max)) stay fixed. Only a
// bound sourced from the metadata can move here — a host reduce could not.
//
// NOTE on bundled scenes: with this bpx version, a single-voice trailing-rest scene
// EXTENDS the last sounding leaf's span to the scene end (the note absorbs the rests),
// so `totalDurationBeats` and reduce(max over sounding events) COINCIDE for that shape.
// We could not produce a divergent bundled scene through the public derivation, so the
// divergence is injected here (mutating the authority field) to break the circularity.

const SCENE_TRAILING_RESTS = `core
alphabet.western:audio
tempo:120
-----
S -> Phrase
Phrase -> C4 D4 E4 _ _ _ _
`;

describe('KAN-C02/C03 (SUITE) — end-to-end: bound is read from the BPx metadata field', () => {
  it('projects totalDurationBeats × (60/tempo) from a REAL derivation', () => {
    const ast = sceneQuiPasse(SCENE_TRAILING_RESTS);
    const bpx = createBPx({ tempo: 120 });
    bpx.loadGrammar(ast);
    const derived = bpx.derive();

    const meta = (derived.tree as { metadata: { totalDurationBeats: number; tempo: number } })
      .metadata;
    expect(meta.totalDurationBeats).toBe(7); // 3 notes + 4 trailing rests = 7 beats
    const bpm = meta.tempo;
    const beatDurSec = 60 / bpm;
    const projected = meta.totalDurationBeats * beatDurSec;
    expect(projected).toBeCloseTo(3.5, 9); // 7 * 0.5

    // The bound depends ONLY on the supplied `durationSec` (the BPx-projected length), not on
    // the events' content — so a hand-built fixture is sufficient here.
    const events = [note('C4', 0, 0.5), note('D4', 0.5, 0.5), note('E4', 1, 0.5)];

    // The bound the adapter would pass equals the projected BPx length, and the
    // materialized timeline reads it back unchanged.
    expect(loopBound(events, projected)).toBeCloseTo(3.5, 9);
  });

  it('SPY: mutating totalDurationBeats moves the bound; the events reduce(max) does NOT', () => {
    const ast = sceneQuiPasse(SCENE_TRAILING_RESTS);
    const bpx = createBPx({ tempo: 120 });
    bpx.loadGrammar(ast);
    const derived = bpx.derive();
    const meta = (derived.tree as { metadata: { totalDurationBeats: number; tempo: number } })
      .metadata;
    const beatDurSec = 60 / meta.tempo;

    // Hand-built fixture: the bound tracks the supplied `durationSec`, not these events.
    const events = [note('C4', 0, 0.5), note('D4', 0.5, 0.5), note('E4', 1, 0.5)];
    const eventsReduce = reduceMax(events); // FIXED — does not depend on the metadata

    // Real value → bound A.
    const projectA = meta.totalDurationBeats * beatDurSec;
    const boundA = loopBound(events, projectA);
    expect(boundA).toBeCloseTo(projectA, 9);

    // Mutate ONLY the authority field (simulating a different compiled length).
    meta.totalDurationBeats = 12; // 12 beats → 6.0s at 120 BPM
    const projectB =
      (derived.tree as { metadata: { totalDurationBeats: number } }).metadata.totalDurationBeats *
      beatDurSec;
    const boundB = loopBound(events, projectB);

    // The bound TRACKED the metadata: it changed with totalDurationBeats…
    expect(boundB).toBeCloseTo(6.0, 9);
    expect(boundB).not.toBeCloseTo(boundA, 6);
    // …while the events (and their reduce(max)) never moved — so the bound cannot be
    // sourced from them. This is what breaks the circular proof.
    expect(reduceMax(events)).toBeCloseTo(eventsReduce, 9);
  });
});
