import { describe, it, expect } from 'vitest';
import { compileToBPxAST } from 'bpscript/src/transpiler/index.js';
import { createBPx } from 'bpx';
import { buildModulators } from '@kronos/core';
import modLibJson from 'bpscript/lib/mod.json';
import { modulatorsFromAst } from './bpx-adapter';
import { composeCvBindings, treeToDispatchEvents, type DispatchEvent } from './tree-dispatch';
import { startKronosAudio } from './kronos-audio';

// END-TO-END Node proof (no browser): derive the REAL bundled demo `cv-adsr.bps`,
// build the FULL production timeline + CV bindings exactly as the adapter does, then
// drive the Kronos audio path once as full Play and once per STEP beat — capturing the
// cutoff curve the transport receives. Asserts the core claim:
//
//   STEP auditions one beat IN PLACE — the CV at a beat's scene position is IDENTICAL
//   whether read for a STEP of that beat or during full Play. STEP does NOT re-window
//   or shrink-to-note the envelope.
//
// The bug fixed: the old band-aid sliced + re-zeroed the beat and rendered CV over the
// note's own window, distorting the envelope and muting successive steps.

// Verbatim copy of `packages/library/bundled/demos/cv-adsr.bps` (inlined so the app
// tsconfig needs no node fs types — same convention as cv-subject.test.ts).
const SRC = [
  '@core',
  '@controls',
  '@alphabet.western:browser',
  '@mm:138',
  '',
  'cv env1   : mod.adsr(attack:5, decay:150, sustain:0.2, release:400)',
  'cv env2   : mod.adsr(attack:100, decay:500, sustain:0.8, release:400)',
  'cv env3   : mod.adsr(attack:500, decay:150, sustain:0.5, release:400)',
  'cv panLfo : mod.lfo(rate:0.3, amplitude:0.45, shape:sine)',
  '',
  'S -> {Bass Bass Bass Bass, Env Env Env Env }',
  '',
  '-----',
  '',
  '@mode:random',
  '',
  'Bass -> C2 C2 C3 C2 - C2 Eb2 C2 (*:cutoff:Env, pan: panLfo, wave:sawtooth, vel:100, filterQ:8) [weight:40]',
  'Bass -> C2 - Eb2 F2 F#2 F2 Eb2 - (cutoff:env1, pan: panLfo, wave:sawtooth, vel:100, filterQ:8) [weight:30]',
  'Bass -> C2 C2 C2 - G2 - Eb2 C2 (C2:cutoff:env1, pan: panLfo, wave:sawtooth, vel:100, filterQ:8)',
  'Env -> env1',
  'Env -> env2',
  'Env -> env3'
].join('\n');

const BPM = 138;
const BEAT = 60 / BPM;

// Build the FULL production dispatch events (with CV bindings) exactly as the adapter
// does: derive → compose CV bindings on the tree → flatten to events.
function buildFullProduction(): DispatchEvent[] {
  const ast = compileToBPxAST(SRC).ast as { cvInstances?: unknown[] };
  const bpx = createBPx({ seed: 7 });
  bpx.loadGrammar(ast);
  const tree = bpx.derive({ output: 'complete' }).tree as unknown;
  const symbols = (bpx as { grammar?: { symbols?: { getName?: (id: number) => string } } }).grammar
    ?.symbols;
  const nameOf = (sid: number) => symbols?.getName?.(sid);
  // symbolId → name table for the flatten (mirrors buildSymbolNames in the adapter).
  const symbolNames: Record<number, string> = {};
  const collect = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    const node = n as { symbolId?: number; children?: unknown[]; voices?: unknown[] };
    if (typeof node.symbolId === 'number' && node.symbolId >= 0 && symbolNames[node.symbolId] === undefined) {
      const nm = nameOf(node.symbolId);
      if (nm) symbolNames[node.symbolId] = nm;
    }
    for (const c of node.children ?? []) collect(c);
    for (const v of node.voices ?? []) collect(v);
  };
  collect((tree as { root?: unknown }).root ?? tree);

  const registry = {
    ...modulatorsFromAst(ast),
    ...buildModulators((ast.cvInstances ?? []) as never, modLibJson as never)
  };
  // composeCvBindings reads the modulator curves; buildModulators is Kronos's own
  // registry (the one startKronosAudio expects). Compose stamps __cvBindings on leaves.
  composeCvBindings(tree, nameOf, registry as never);
  return treeToDispatchEvents(
    tree as Parameters<typeof treeToDispatchEvents>[0],
    symbolNames
  ).filter((e) => e.type !== 'rest');
}

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

// Run the Kronos audio path once; capture each dispatched note's cutoff curve, keyed
// by `onset|token` (onset disambiguates repeated tokens). Optionally a STEP window.
function capture(events: DispatchEvent[], step?: { fromSec: number; durSec: number }) {
  const out: Record<string, number[]> = {};
  const transport = {
    send(event: Record<string, unknown>) {
      const mc = event.__modCurves as Record<string, number[]> | undefined;
      if (mc?.cutoff) {
        const key = `${Number(event.startSec).toFixed(4)}|${String(event.token)}`;
        out[key] = mc.cutoff;
      }
    }
  };
  const total = Math.max(...events.map((e) => e.startSec + e.durSec), 0);
  const h = startKronosAudio({
    events,
    durationSec: total,
    audioCtx: captureCtx(),
    derivedTempo: BPM,
    loop: false,
    dispatcher: { duration: total, transports: { default: transport } },
    soundsFn: (t) => /^[A-G]/.test(t), // notes sound; env names are rests
    step
  });
  h.stop();
  return out;
}

describe('cv-adsr.bps — STEP CV == full-production CV (real demo, end-to-end, Node)', () => {
  it('the demo derives a cutoff-modulated bass timeline', () => {
    const events = buildFullProduction();
    const modulated = events.filter(
      (e) => (e.modulations ?? []).some((b) => b.input === 'cutoff')
    );
    expect(modulated.length).toBeGreaterThan(0);
  });

  it('each beat: STEP curve === the full-production curve at that beat (no re-window)', () => {
    const events = buildFullProduction();
    const full = capture(events); // full Play: synchronous pump emits the first beat(s)

    // For every beat index present at/after the timeline start, a STEP of that beat
    // must hand the transport the EXACT same cutoff curve full Play would at that
    // scene position. We compare the FIRST note dispatched by each STEP (the note at
    // the seek point) against the same key captured in full Play when present, and
    // ALWAYS assert the curve is a real OPENING envelope (not held / not shrunk).
    const beats = new Set(events.map((e) => Math.round(e.startSec / BEAT)));
    let proven = 0;
    for (const idx of [...beats].sort((a, b) => a - b)) {
      const fromSec = idx * BEAT;
      const step = capture(events, { fromSec, durSec: BEAT });
      const keys = Object.keys(step);
      if (keys.length === 0) continue; // a rest-only beat — nothing to audition
      for (const k of keys) {
        // The curve OPENS (real envelope): rises above a closed floor. A shrunk /
        // held-closed band-aid would stay flat near 0.
        expect(Math.max(...step[k]), `beat ${idx} key ${k} opens`).toBeGreaterThan(0.3);
        // And it is bit-for-bit the full-production curve when full Play emitted it.
        if (full[k]) {
          expect(step[k], `beat ${idx} key ${k} == full Play`).toEqual(full[k]);
          proven++;
        }
      }
    }
    // At least the timeline-start beat is comparable to full Play and matched.
    expect(proven).toBeGreaterThan(0);
  });

  it('the FIRST beat is identical between STEP and full Play (head-to-head)', () => {
    const events = buildFullProduction();
    const full = capture(events);
    const step0 = capture(events, { fromSec: 0, durSec: BEAT });
    // Same keys, same curves for the beat at scene 0.
    const fullHead = Object.fromEntries(
      Object.entries(full).filter(([k]) => Number(k.split('|')[0]) < BEAT)
    );
    expect(Object.keys(step0).length).toBeGreaterThan(0);
    for (const [k, curve] of Object.entries(step0)) {
      if (Number(k.split('|')[0]) >= BEAT) continue;
      expect(fullHead[k], `full Play has beat-0 key ${k}`).toBeDefined();
      expect(curve).toEqual(fullHead[k]);
    }
  });
});
