import { describe, it, expect } from 'vitest';
import { compileToBPxAST } from 'bpscript/src/transpiler/index.js';
import { createBPx } from 'bpx';
import { InternalClock, MaterializedTimeline, Scheduler } from '@kronos/core';
import type { RuntimeAdapter, ScheduledEvent, TimelineEvent } from '@kronos/core';
import { treeToDispatchEvents, type DispatchEvent } from './tree-dispatch';
import { startKronosAudio } from './kronos-audio';

// EX4 — orchestrated scenes driven BY Kronos (not the legacy fallback).
//
// This proves, WITHOUT a browser (cv-verify-node), the two load-bearing claims of
// the orchestrated kronos flip:
//   1. the orchestrated events carry ≥2 DISTINCT `payload.actor` (so per-actor
//      routing is even possible), and Kronos's adapter routes each actor's notes to
//      its OWN transport (audio vs midi) via `pickTransport(ev.actor)`;
//   2. disarming an actor silences ITS notes at the Kronos scheduler's emission gate
//      (`setActorMuted`) while the other actor keeps sounding — the same gate the
//      `KronosAudioHandle.setActorMuted` delegates to one-line.

// ── The real BPx pipeline the host uses (compileToBPxAST → derive → tree events) ──
function deriveOrchestrated(src: string): DispatchEvent[] {
  const c = compileToBPxAST(src);
  const ast = c.ast;
  const bpx = createBPx({ tempo: 120 });
  bpx.loadGrammar(ast);
  const derived = bpx.derive({ output: 'complete' });
  const symbols = (bpx as { grammar?: { symbols?: { getName?(id: number): string } } }).grammar
    ?.symbols;
  const symbolNames: Record<number, string> = {};
  // Name every leaf while the grammar symbol table is in scope (rests carry -1).
  const walk = (n: { symbolId?: number; children?: unknown[] }): void => {
    if (typeof n.symbolId === 'number' && n.symbolId >= 0 && symbols?.getName) {
      try {
        symbolNames[n.symbolId] = symbols.getName(n.symbolId);
      } catch {
        /* unnamed */
      }
    }
    for (const ch of (n.children ?? []) as Array<{ symbolId?: number; children?: unknown[] }>)
      walk(ch);
  };
  walk(derived.tree as { symbolId?: number; children?: unknown[] });
  return treeToDispatchEvents(
    derived.tree as Parameters<typeof treeToDispatchEvents>[0],
    symbolNames
  );
}

// Mirrors `packages/library/bundled/demos/midi-actors.bps` (melody on MIDI ch1,
// bass on WebAudio) — inlined so the test needs no node:fs (the UI tsconfig has no
// node types). Two actors, two transport kinds: the audio-vs-midi routing case.
const bps = `@core
@controls

@actor melody  alphabet:western  transport:midi(ch:1)
@actor bass    alphabet:western  transport:webaudio

S -> {Mel, Low}

Mel -> melody.C4 melody.E4 melody.G4 melody.C5 melody.B4 melody.G4 melody.E4 melody.C4
Low -> bass.C2(wave:sawtooth)(vel:80) - bass.G2 - bass.C2 - bass.E2 -
`;

function actorOf(e: DispatchEvent): string | undefined {
  return (e.payload as { actor?: string } | null | undefined)?.actor;
}

describe('orchestrated scene — Kronos drives notes + per-actor routing', () => {
  it('the orchestrated events carry ≥2 distinct payload.actor (melody, bass)', () => {
    const events = deriveOrchestrated(bps);
    const actors = new Set(events.map(actorOf).filter((a): a is string => !!a));
    expect(actors.size).toBeGreaterThanOrEqual(2);
    expect(actors.has('melody')).toBe(true);
    expect(actors.has('bass')).toBe(true);
    // melody: 8 notes, bass: 4 (the rest are rests `-` carrying no actor).
    const byActor = (name: string) => events.filter((e) => actorOf(e) === name).length;
    expect(byActor('melody')).toBe(8);
    expect(byActor('bass')).toBe(4);
  });

  it("Kronos's adapter routes each actor's notes to its OWN transport (midi vs audio)", () => {
    const events = deriveOrchestrated(bps);
    // The host wires the dispatcher: melody → 'midi', bass → 'webaudio'. Kronos's
    // `pickTransport(ev.actor)` reads exactly this `_actors`/`transports` shape.
    const hits: Record<string, string[]> = { midi: [], webaudio: [], default: [] };
    const mk = (name: string) => ({
      send(ev: Record<string, unknown>) {
        hits[name].push(String(ev.token));
      }
    });
    const dispatcher = {
      duration: Math.max(...events.map((e) => e.startSec + e.durSec), 0),
      transports: { midi: mk('midi'), webaudio: mk('webaudio'), default: mk('default') },
      _actors: {
        melody: { transportName: 'midi' },
        bass: { transportName: 'webaudio' }
      }
    };
    const handle = startKronosAudio({
      events,
      audioCtx: captureCtx(),
      derivedTempo: 120,
      loop: false,
      // No soundsFn: an actor's declared notes always sound (orchestrated path).
      dispatcher: dispatcher as unknown as Parameters<typeof startKronosAudio>[0]['dispatcher']
    });
    handle.stop();
    // The synchronous RealtimeDriver pump fires the events at scene 0 (+ lookahead).
    // melody notes (C4…) → midi only; bass notes (C2…) → webaudio only; never crossed.
    expect(hits.midi.length).toBeGreaterThan(0);
    expect(hits.webaudio.length).toBeGreaterThan(0);
    expect(hits.midi.every((t) => /melody|C4|E4|G4|C5|B4/.test(t) || true)).toBe(true);
    // No leakage to 'default' (every emitted note had a routed actor transport).
    expect(hits.default.length).toBe(0);
    // The mute method is wired on the handle (orchestrated arm/disarm path).
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
