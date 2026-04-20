import { describe, it, expect } from 'vitest';
import { extractBlocks } from './extract-blocks';

describe('extractBlocks — Strudel', () => {
  it('names $: slots $0 $1 $2', () => {
    const code = `$: s("bd*4")\n\n$: s("~ cp")\n\n$: s("hh*8")`;
    const b = extractBlocks(code, 'strudel');
    expect(b.map((x) => x.name)).toEqual(['$0', '$1', '$2']);
    expect(b.every((x) => x.kind === 'slot')).toBe(true);
  });

  it('names top-level assignments', () => {
    const code = `drums = s("bd*4")\n\nconst bass = note("c2")`;
    const b = extractBlocks(code, 'strudel');
    expect(b.map((x) => x.name)).toEqual(['drums', 'bass']);
    expect(b.map((x) => x.kind)).toEqual(['assign', 'assign']);
  });

  it('falls back to #N for anonymous blocks', () => {
    const code = `stack(\n  s("bd*4"),\n  s("cp")\n)\n\nnote("c4 e4 g4")`;
    const b = extractBlocks(code, 'strudel');
    expect(b.map((x) => x.name)).toEqual(['#1', '#2']);
    expect(b.every((x) => x.kind === 'positional')).toBe(true);
  });

  it('mixes slots, assigns and positional', () => {
    const code = `$: s("bd")\n\ndrums = s("cp")\n\nstack(s("hh"))`;
    const b = extractBlocks(code, 'strudel');
    expect(b.map((x) => x.name)).toEqual(['$0', 'drums', '#3']);
    expect(b.map((x) => x.kind)).toEqual(['slot', 'assign', 'positional']);
  });

  it('returns blocks with correct from/to offsets', () => {
    const code = `drums = s("bd")\n\nbass = s("cp")`;
    const b = extractBlocks(code, 'strudel');
    expect(b[0].from).toBe(0);
    expect(b[0].to).toBe('drums = s("bd")'.length);
    expect(b[1].from).toBe('drums = s("bd")\n\n'.length);
  });
});

describe('extractBlocks — Tidal', () => {
  it('names d1..d16 slots', () => {
    const code = `d1 $ sound "bd"\n\nd12 $ sound "cp"`;
    const b = extractBlocks(code, 'tidal');
    expect(b.map((x) => x.name)).toEqual(['d1', 'd12']);
    expect(b.every((x) => x.kind === 'slot')).toBe(true);
  });

  it('ignores d17+ (out of range)', () => {
    const code = `d17 $ sound "bd"`;
    const b = extractBlocks(code, 'tidal');
    expect(b[0].name).toBe('#1');
  });
});

describe('extractBlocks — Hydra', () => {
  it('detects .out(o0..o3) as slot name', () => {
    const code = `osc(10).out(o0)\n\nnoise().out(o2)`;
    const b = extractBlocks(code, 'hydra');
    expect(b.map((x) => x.name)).toEqual(['o0', 'o2']);
    expect(b.every((x) => x.kind === 'slot')).toBe(true);
  });

  it('.out() without arg maps to o0 (Hydra convention)', () => {
    const code = `osc().out()`;
    const b = extractBlocks(code, 'hydra');
    expect(b[0].name).toBe('o0');
  });

  it('falls back to assign then positional', () => {
    const code = `const base = osc(10)\n\nnoise(3)`;
    const b = extractBlocks(code, 'hydra');
    expect(b.map((x) => x.name)).toEqual(['base', '#2']);
  });
});

describe('extractBlocks — SuperCollider', () => {
  it('detects ~env variables', () => {
    const code = `~kick = { SinOsc.ar(60) }\n\n~snare = { WhiteNoise.ar }`;
    const b = extractBlocks(code, 'sc');
    expect(b.map((x) => x.name)).toEqual(['kick', 'snare']);
  });

  it('detects SynthDef names', () => {
    const code = `SynthDef(\\bass, { Out.ar(0, SinOsc.ar) }).add`;
    const b = extractBlocks(code, 'sc');
    expect(b[0].name).toBe('bass');
  });
});

describe('extractBlocks — JS', () => {
  it('detects top-level consts/lets', () => {
    const code = `const ctx = new AudioContext()\n\nlet gain = 0.5`;
    const b = extractBlocks(code, 'js');
    expect(b.map((x) => x.name)).toEqual(['ctx', 'gain']);
  });

  it('skips reserved keywords', () => {
    const code = `function foo() { return 1 }\n\nif (x) doSomething()`;
    const b = extractBlocks(code, 'js');
    expect(b.every((x) => x.kind === 'positional')).toBe(true);
  });
});

describe('extractBlocks — unknown runtime', () => {
  it('falls back to pure positional', () => {
    const code = `block one\nline two\n\nblock two\n\nblock three`;
    const b = extractBlocks(code, 'python');
    expect(b).toHaveLength(3);
    expect(b.map((x) => x.name)).toEqual(['#1', '#2', '#3']);
  });
});
