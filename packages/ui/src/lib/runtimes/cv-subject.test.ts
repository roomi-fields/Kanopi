import { describe, it, expect } from 'vitest';
import { compileToBPxAST } from 'bpscript/src/transpiler/index.js';
import { createBPx } from 'bpx';
import { modulatorsFromAst } from './bpx-adapter';
import { resolveCvControls, type CvDescriptor } from './tree-dispatch';

// Subject-driven CV modulation (lot pré-validation): BPx graves a SUBJECT-encoded
// value on each sounding leaf's `controls`; `resolveCvControls` rewrites it into
// the uniform `{__cv:true, …}` descriptor the webaudio transport applies, picking
// the right CLOCK. These tests assert the classification + clock windows against
// the bundled demo `cv-adsr.bps` (4 phrases: Sig / AcidN / Term / Voice).

interface RawNode {
  type?: string;
  role?: string;
  symbolId?: number;
  sourceSymbolId?: number;
  controls?: Record<string, unknown>;
  span?: { startMs: number; endMs: number };
  children?: RawNode[];
  voices?: RawNode[];
}

// Verbatim copy of the bundled demo `packages/library/bundled/demos/cv-adsr.bps`
// (inlined so svelte-check's app tsconfig needs no node types). Confirmed to derive
// the same tree as the on-disk file. The 4 phrases isolate one subject level each.
const SRC = [
  '@core',
  '@controls',
  '@alphabet.western:browser',
  '@mm:120',
  '',
  'cv env1 : mod.adsr(attack:5, decay:420, sustain:0.15, release:200)',
  'cv env2 : mod.adsr(attack:160, decay:300, sustain:0.50, release:400)',
  'cv env3 : mod.adsr(attack:2, decay:90, sustain:0.05, release:150)',
  '',
  'S -> Sig AcidN Term { Voice, Env }',
  '',
  '-----',
  '',
  '@mode:ord',
  '',
  'Sig   -> C2 C2 C2 C2 (cutoff: env1, wave:sawtooth, vel:95, filterQ:9)',
  'AcidN -> C2 C2 C2 C2 (*:cutoff: env1, wave:sawtooth, vel:95, filterQ:9)',
  'Term  -> C2 G2 C2 G2 (C2:cutoff: env1, wave:sawtooth, vel:95, filterQ:9)',
  'Voice -> C2 C2 C2 C2 (cutoff: Env, wave:sawtooth, vel:95, filterQ:9)',
  'Env   -> env1 env2 env3'
].join('\n');

function setup(src: string) {
  const ast = compileToBPxAST(src).ast;
  const bpx = createBPx({ seed: 1 });
  bpx.loadGrammar(ast);
  const tree = bpx.derive({ output: 'complete' }).tree as unknown as { root?: RawNode };
  const nameOf = (sid: number) =>
    (bpx as { grammar?: { symbols?: { getName?: (id: number) => string } } }).grammar?.symbols
      ?.getName?.(sid);
  const modNames = new Set(Object.keys(modulatorsFromAst(ast)));
  return { tree, nameOf, modNames, root: (tree.root ?? tree) as RawNode };
}

/** Sounding leaves in derivation order, each with its resolved name + span. */
function leavesInOrder(node: RawNode, nameOf: (s: number) => string | undefined, acc: Array<{
  name: string | undefined;
  startMs: number;
  endMs: number;
  controls: Record<string, unknown> | undefined;
}> = []) {
  if (!node || typeof node !== 'object') return acc;
  if (node.role === 'leaf') {
    acc.push({
      name: typeof node.symbolId === 'number' ? nameOf(node.symbolId) : undefined,
      startMs: node.span?.startMs ?? 0,
      endMs: node.span?.endMs ?? 0,
      controls: node.controls
    });
  }
  for (const c of node.children ?? []) leavesInOrder(c, nameOf, acc);
  for (const v of node.voices ?? []) leavesInOrder(v, nameOf, acc);
  return acc;
}

function isCv(v: unknown): v is CvDescriptor {
  return !!v && typeof v === 'object' && (v as { __cv?: unknown }).__cv === true;
}

describe('resolveCvControls — subject-driven modulation clocks (cv-adsr.bps)', () => {
  it('classifies each phrase into the right clock + window', () => {
    const { tree, nameOf, modNames, root } = setup(SRC);
    resolveCvControls(tree, nameOf, modNames);

    const leaves = leavesInOrder(root, nameOf);
    // The demo plays Sig(4) AcidN(4) Term(4) then a polymetric {Voice(4), Env(3)}.
    const cutoffs = leaves.map((l) => ({ ...l, cutoff: l.controls?.cutoff }));

    // Print the resolved descriptors (this test doubles as the node probe).
    for (const l of cutoffs) {
      // eslint-disable-next-line no-console
      console.log(
        `${(l.name ?? '?').padEnd(5)} [${l.startMs}-${l.endMs}] cutoff=${JSON.stringify(l.cutoff)}`
      );
    }

    // ── Sig: plain `cutoff: env1` → SIGNAL on the phrase [0..2000] = 0s..2s.
    const sig = cutoffs.filter((l) => l.startMs < 2000);
    expect(sig).toHaveLength(4);
    for (const l of sig) {
      expect(l.cutoff).toEqual({ __cv: true, mod: 'env1', clock: 'signal', startSec: 0, durSec: 2 });
      // Non-modulation controls survive untouched.
      expect(l.controls!.wave).toBe('sawtooth');
      expect(l.controls!.vel).toBe(95);
      expect(l.controls!.filterQ).toBe(9);
    }

    // ── AcidN: `*:cutoff: env1` → PER NOTE (retrigger), no window.
    const acid = cutoffs.filter((l) => l.startMs >= 2000 && l.startMs < 4000);
    expect(acid).toHaveLength(4);
    for (const l of acid) {
      expect(l.cutoff).toEqual({ __cv: true, mod: 'env1', clock: 'note' });
    }

    // ── Term: `C2:cutoff: env1` → SIGNAL on the C2 leaves ONLY; phrase = the rule
    //    occurrence [4000..6000] = 4s..6s (the un-filtered G2 leaves count toward it).
    const term = cutoffs.filter((l) => l.startMs >= 4000 && l.startMs < 6000);
    expect(term).toHaveLength(4);
    for (const l of term) {
      if (l.name === 'C2') {
        expect(l.cutoff).toEqual({
          __cv: true,
          mod: 'env1',
          clock: 'signal',
          startSec: 4,
          durSec: 2
        });
      } else {
        // G2 leaves carry NO cutoff descriptor (terminal filter is structural).
        expect(l.name).toBe('G2');
        expect('cutoff' in (l.controls ?? {})).toBe(false);
      }
    }

    // ── Voice: `cutoff: Env` → SIGNAL following the sibling-voice SEGMENT covering
    //    each note's attack. Env voice = env1[6-6.666] env2[6.666-7.333] env3[7.333-8].
    const voice = cutoffs.filter((l) => l.startMs >= 6000 && l.name === 'C2');
    expect(voice).toHaveLength(4);
    const expected = [
      { attack: 6000, mod: 'env1', startSec: 6, segEnd: 6.666 },
      { attack: 6500, mod: 'env1', startSec: 6, segEnd: 6.666 },
      { attack: 7000, mod: 'env2', startSec: 6.666, segEnd: 7.333 },
      { attack: 7500, mod: 'env3', startSec: 7.333, segEnd: 8 }
    ];
    for (const exp of expected) {
      const l = voice.find((x) => x.startMs === exp.attack)!;
      expect(l, `voice leaf at ${exp.attack}ms`).toBeTruthy();
      const d = l.cutoff as CvDescriptor;
      expect(isCv(d)).toBe(true);
      expect(d.clock).toBe('signal');
      expect(d.mod).toBe(exp.mod);
      expect(d.startSec).toBeCloseTo(exp.startSec, 2);
      expect(d.startSec! + d.durSec!).toBeCloseTo(exp.segEnd, 2);
    }

    // No raw subject markers / refs survive anywhere.
    for (const l of cutoffs) {
      const c = l.cutoff;
      if (c && typeof c === 'object') {
        expect((c as { __cvRef?: unknown }).__cvRef).toBeUndefined();
        expect((c as { __subject?: unknown }).__subject).toBeUndefined();
      }
    }
  });

  it('resolves sibling-voice names EXACTLY (case-sensitive — no normalization)', () => {
    // An Env terminal spelled `env1X` (not a declared modulator) must survive
    // verbatim in the descriptor; the SIGNAL window still comes from its segment.
    const src = SRC.replace('Env   -> env1 env2 env3', 'Env   -> env1X env2 env3');
    const { tree, nameOf, modNames, root } = setup(src);
    resolveCvControls(tree, nameOf, modNames);
    const voice = leavesInOrder(root, nameOf).filter((l) => l.startMs >= 6000 && l.name === 'C2');
    const mods = voice
      .map((l) => l.controls?.cutoff)
      .filter(isCv)
      .map((d) => d.mod);
    expect(mods).toContain('env1X');
    expect(mods).not.toContain('env1');
  });

  it('leaves a non-modulator plain string as a normal control', () => {
    // `wave: sawtooth` is NOT in the modulator registry → untouched (no descriptor).
    const { tree, nameOf, modNames, root } = setup(SRC);
    resolveCvControls(tree, nameOf, modNames);
    const anyLeaf = leavesInOrder(root, nameOf).find((l) => l.controls?.wave !== undefined)!;
    expect(anyLeaf.controls!.wave).toBe('sawtooth');
    expect(isCv(anyLeaf.controls!.wave)).toBe(false);
  });
});
