import { describe, it, expect } from 'vitest';
import { compileToBPxAST } from 'bpscript/src/transpiler/index.js';
import { createSession } from 'bpx';
import { InternalClock, MaterializedTimeline, Scheduler } from '@kronos/core';
import type { RuntimeAdapter, ScheduledEvent, TimelineEvent, OutputRef } from '@kronos/core';
import { Kairos } from '@kairos/core';
import { startKronosAudio } from './kronos-audio';

// KAI-9 — orchestrated scenes route BY OUTPUT (not by a host actor→transport map). The
// address travels IN THE TREE: Kairos graves `event.output` per event (from the AST's
// `metadata.actors`), and Kronos selects the adapter on `output.runtime`. This proves,
// WITHOUT a browser (cv-verify-node), the two load-bearing claims of the big-bang:
//   1. the derived events carry their OWN output address — melody → {runtime:'midi',
//      channel:1}, bass → {runtime:'webaudio'} — straight off the real BPx→Kairos pipeline;
//   2. Kronos routes each event to the sink REGISTERED FOR ITS RUNTIME (midi vs webaudio):
//      melody reaches the 'midi' sink, bass the 'webaudio' sink, 2 DISTINCT sinks, 0 leak.
// (The arm/disarm gate is proven separately on the upstream Scheduler, below.)

// Mirrors `packages/library/bundled/demos/midi-actors.bps` (melody on MIDI ch1, bass on
// WebAudio) — inlined so the test needs no node:fs (the UI tsconfig has no node types).
const bps = `@core
@controls

@actor melody  alphabet:western  transport:midi(ch:1)
@actor bass    alphabet:western  transport:webaudio

S -> {Mel, Low}

Mel -> melody.C4 melody.E4 melody.G4 melody.C5 melody.B4 melody.G4 melody.E4 melody.C4
Low -> bass.C2(wave:sawtooth)(vel:80) - bass.G2 - bass.C2 - bass.E2 -
`;

// The REAL pipeline the host uses: compileToBPxAST → createSession → derive → Kairos.charger.
// Returns the LIVE Kairos (its `sourceStructure()` is what `startKronosAudio` binds), the
// materialized events WITH their graven `output`, and the actor→output table (`metadata.actors`).
function deriveArbre(src: string): {
  kairos: Kairos;
  events: TimelineEvent[];
  actors: Record<string, { runtime: string; params?: Record<string, unknown> }>;
} {
  const ast = compileToBPxAST(src, { tempo: 120 }).ast;
  const session = createSession(ast, { seed: 1, tempo: 120 });
  const tree = session.derive().tree;
  const kairos = new Kairos();
  kairos.charger(
    tree as unknown as Parameters<Kairos['charger']>[0],
    session.buildProjectionContext() as unknown as Parameters<Kairos['charger']>[1]
  );
  const tl = kairos.arbreCourant();
  const events = [...tl.query(0, tl.duration + 1)];
  const actors = ((tree as { metadata?: { actors?: unknown } }).metadata?.actors ?? {}) as Record<
    string,
    { runtime: string; params?: Record<string, unknown> }
  >;
  return { kairos, events, actors };
}

const tokenOf = (e: TimelineEvent) => String((e.content as { token?: string }).token ?? '');
const isNote = (e: TimelineEvent) => (e.kind ?? 'note') === 'note';

describe('orchestrated scene — events carry their OUTPUT address (KAI-9)', () => {
  it('melody → {runtime:midi, channel:1}, bass → {runtime:webaudio}', () => {
    const { events, actors } = deriveArbre(bps);
    // The AST authority the host hands down (for OSC enumeration) — proven on pieces.
    // KAI-10: BPx now also carries the per-actor `alphabet` on `metadata.actors` (the
    // SceneContext that rides the tree, read by Kairos' pitch cascade) — both actors
    // declare `alphabet:western`, so it appears here alongside the KAI-9 output address.
    expect(actors.melody).toEqual({ runtime: 'midi', params: { ch: 1 }, alphabet: 'western' });
    expect(actors.bass).toEqual({ runtime: 'webaudio', params: {}, alphabet: 'western' });

    const out = (actor: string): OutputRef[] =>
      events.filter((e) => isNote(e) && e.actor === actor).map((e) => e.output as OutputRef);
    const melody = out('melody');
    const bass = out('bass');
    expect(melody.length).toBe(8);
    expect(bass.length).toBe(4);
    // EVERY melody note routes to MIDI channel 1; EVERY bass note to WebAudio. No host choice.
    expect(melody.every((o) => o?.runtime === 'midi' && o?.channel === 1)).toBe(true);
    expect(bass.every((o) => o?.runtime === 'webaudio')).toBe(true);
  });

  it('Kronos routes each event to its RUNTIME sink (midi vs webaudio), 2 sinks, 0 leak', () => {
    const { kairos, events, actors } = deriveArbre(bps);
    // Expected token sets per runtime, READ from the events' own output (not hardcoded).
    const tokensFor = (rt: string) =>
      new Set(events.filter((e) => isNote(e) && e.output?.runtime === rt).map(tokenOf));
    const midiTokens = tokensFor('midi');
    const webaudioTokens = tokensFor('webaudio');

    // Two DISTINCT capture sinks, registered BY RUNTIME NAME via `startKronosAudio` (the
    // 'webaudio' sink overrides the built-in AudioRuntime; the 'midi' sink stands in for
    // the MidiTransport). The host registers them by name and chooses NO route.
    const midiHits: { token: string; chan?: number }[] = [];
    const audioHits: string[] = [];
    const midiSink = {
      send(e: Record<string, unknown>) {
        midiHits.push({ token: String(e.token), chan: e.chan as number | undefined });
      }
    };
    const webaudioSink = {
      send(e: Record<string, unknown>) {
        audioHits.push(String((e.content as { token?: string }).token));
      }
    };

    const handle = startKronosAudio({
      audioCtx: captureCtx(),
      derivedTempo: 120,
      loop: false,
      sinks: { midi: midiSink, webaudio: webaudioSink } as unknown as Parameters<
        typeof startKronosAudio
      >[0]['sinks'],
      actors,
      kairos
    });
    handle.stop();

    // The synchronous RealtimeDriver pump fires the events at scene 0 (+ lookahead): the
    // onset-0 note of each actor. Whatever fired MUST have gone to ITS runtime's sink only.
    expect(midiHits.length).toBeGreaterThan(0);
    expect(audioHits.length).toBeGreaterThan(0);
    // 0 LEAK: every MIDI hit is a melody (midi) token, never a bass (webaudio) one — and v.v.
    expect(midiHits.every((h) => midiTokens.has(h.token))).toBe(true);
    expect(midiHits.some((h) => webaudioTokens.has(h.token))).toBe(false);
    expect(audioHits.every((t) => webaudioTokens.has(t))).toBe(true);
    expect(audioHits.some((t) => midiTokens.has(t))).toBe(false);
    // The MIDI channel comes from the OUTPUT layer (ev.output.channel = 1), not the host.
    expect(midiHits.every((h) => h.chan === 1)).toBe(true);
    // The arm/disarm method is wired on the handle (orchestrated path).
    expect(typeof handle.setActorMuted).toBe('function');
  });
});

// ── The Kronos emission gate `setActorMuted` delegates to (AS-IS upstream) ──
class CaptureAdapter implements RuntimeAdapter {
  readonly sent: ScheduledEvent[] = [];
  send(ev: ScheduledEvent): void {
    this.sent.push(ev);
  }
}
function note(token: string, sceneOnset: number, actor: string): TimelineEvent {
  return { sceneOnset, sceneDuration: 0.05, actor, content: { token } } as TimelineEvent;
}

describe('orchestrated arm/disarm — Kronos mutes one actor, the other plays on', () => {
  it('disarming bass silences ITS notes; melody keeps emitting', () => {
    const ref = { t: 0 };
    const clock = new InternalClock({ now: () => ref.t });
    clock.setDerivedTempo(120);
    const tl = new MaterializedTimeline([note('C4', 0, 'melody'), note('C2', 0, 'bass')], 1);
    const out = new CaptureAdapter();
    const sched = new Scheduler({ clock, timeline: tl });
    sched.setDefaultAdapter(out);
    sched.addAdapter('melody', out);
    sched.addAdapter('bass', out);

    // Disarm bass BEFORE the first emission — the exact call the handle makes.
    sched.setActorMuted('bass', true);
    clock.start(0);
    sched.start(0);
    sched.tick(0.1); // pump the lookahead window [0, 0.1)

    const tokens = out.sent.map((e) => String(e.content.token));
    expect(tokens).toContain('C4'); // melody sounds
    expect(tokens).not.toContain('C2'); // bass is silenced

    // Re-arm bass → its note emits again (fresh scheduler = next eval cycle, the
    // same path a live re-arm takes when the host re-derives the orchestrated set).
    const out2 = new CaptureAdapter();
    const clock2 = new InternalClock({ now: () => 0 });
    clock2.setDerivedTempo(120);
    const sched2 = new Scheduler({ clock: clock2, timeline: tl });
    sched2.setDefaultAdapter(out2);
    sched2.addAdapter('melody', out2);
    sched2.addAdapter('bass', out2);
    sched2.setActorMuted('bass', false); // armed
    clock2.start(0);
    sched2.start(0);
    sched2.tick(0.1);
    const tokens2 = out2.sent.map((e) => String(e.content.token));
    expect(tokens2).toContain('C4');
    expect(tokens2).toContain('C2'); // bass back
  });
});

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
    outputLatency: 0,
    baseLatency: 0,
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
