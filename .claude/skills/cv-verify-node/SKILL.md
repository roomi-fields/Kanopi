---
name: cv-verify-node
description: Verify Kanopi modulation / envelope / clock / re-random behavior in Node (vitest or a one-off script) on the PURE functions — and, when the scheduling wiring must be proven, on a MOCKED AudioParam/AudioContext — INSTEAD of a slow headless browser. Use this whenever the claim to prove is about a CV value, which envelope applies, a curve shape, a clock window (signal vs per-note vs terminal), a sibling-voice resolution, or that re-random re-rolls. Reserve the browser (live-coding-verify / Playwright) for a single final "does it actually make sound" smoke. Triggers on: CV, modulation, envelope, ADSR, LFO, cutoff/pan/resonance, `*:`/terminal subjects, `controlScopes`/`controlSubjects`, `resolveVoice`, `composeLeafModulations`, `renderToBreakpoints`, re-random, hot-swap, Kronos scheduler/timeline.
---

# Verify CV / modulation without a browser

**Rule (Romain, 2026-06-21): do not boot a headless browser to prove envelope/clock/re-random
logic — it is super long and fragile.** That logic is **pure** (zero Web Audio). The browser is
only needed for the final "sound comes out" smoke, never to prove a curve.

An agent once spent ~19 min / 80k tokens launching its own chromium to prove env1/env2/env3
variety — provable in < 1 s in Node. Don't repeat that.

## The three levels (use the lowest one that proves the claim)

### Level 1 — VALUES (the default): pure pipeline in Node/vitest
Everything that decides *which* modulator, *what* curve, *which* window, *what* draw is a pure
function. Drive them directly and assert the numbers.

Canonical node entry points (ESM):
```js
import { compileToBPxAST } from 'bpscript/src/transpiler/index.js';
import { createBPx } from 'bpx';
import { buildModulators, composeLeafModulations, renderToBreakpoints, evaluateCurve } from '@kronos/core';
import modLib from 'bpscript/lib/mod.json' assert { type: 'json' }; // or a normal import

const ast = compileToBPxAST(src).ast;
const bpx = createBPx(); bpx.loadGrammar(ast);
const d = bpx.derive({ output: 'complete' });      // { tree, tokens }
const nameOf = (id) => bpx.grammar.symbols.getName(id);
```
From there, prove the claim on the **leaf facets** (`controls` / `controlSubjects` / `controlScopes`)
and the **modulation layer**:
```js
const registry = buildModulators(ast.cvInstances, modLib);
// resolveVoice(ref): ALL leaves of the sibling voice as segments, in SECONDS:
//   { startScene: leaf.span.startMs/1000, endScene: leaf.span.endMs/1000, modulator: nameOf(leaf.symbolId) }
const bindings = composeLeafModulations(
  { controls: leaf.controls, controlSubjects: leaf.controlSubjects, controlScopes: leaf.controlScopes },
  registry,
  { onsetScene: leaf.span.startMs/1000, durationScene: (leaf.span.endMs-leaf.span.startMs)/1000 },
  { resolveVoice }
);
for (const b of bindings) {
  const bp = renderToBreakpoints(b.source, b.windowStartScene, b.windowEndScene, 0.002);
  // ASSERT the curve: env1 sustain ≈ 80 Hz, env2 ≈ 630 Hz, env3 ≈ 28 Hz (after MOD_SCALE.cutoff),
  // or just on the 0..1 source: b.source.sample(t) hits the expected sustain ratio.
}
```
Typical assertions (no audio, < 1 s):
- **env variety**: a `cutoff:Env` / `*:cutoff:Env` scene yields cutoff curves whose sustain values
  match env1/env2/env3 per the Env voice segment — NOT all env1.
- **clock**: signal (no subject) → window = `controlScopes` (phrase); per-note (`*`) → window = the
  note; terminal (`<name>`) → key present only on matching leaves.
- **re-random**: derive twice (or call the `setReDerive` callback twice) → the token sequences
  (`d.tokens.map(t=>t.token)`) DIFFER; with re-random off → identical.

Put recurring ones in a `*.test.ts` under `packages/ui/src/lib/runtimes/` (e.g. `cv-subject.test.ts`,
`cv-curve.test.ts` are the existing pattern). Run with `npx vitest run <file>`.

### Level 2 — SCHEDULING wiring: mock AudioParam/AudioContext in Node
When you must prove the *adapter* programs the right automations (not just that the values are
right), don't open a browser — give the synth a fake context that **records** param calls:
```js
const calls = [];
const fakeParam = () => ({
  setValueAtTime: (v,t)=>calls.push({m:'set',v,t}),
  setValueCurveAtTime: (a,t,d)=>calls.push({m:'curve',v0:a[0],v1:a[a.length-1],t,d}),
  linearRampToValueAtTime:(v,t)=>calls.push({m:'lin',v,t}),
  exponentialRampToValueAtTime:(v,t)=>calls.push({m:'exp',v,t}),
  value: 0,
});
const fakeCtx = {
  currentTime: 0,
  createBiquadFilter: () => ({ frequency: fakeParam(), Q: fakeParam(), type:'', connect(){}, }),
  createGain: () => ({ gain: fakeParam(), connect(){} }),
  createOscillator: () => ({ frequency: fakeParam(), detune: fakeParam(), type:'', connect(){}, start(){}, stop(){} }),
  createStereoPanner: () => ({ pan: fakeParam(), connect(){} }),
  destination: { },
};
// run the WebAudio transport / Kronos adapter against fakeCtx, then assert on `calls`.
```
This is the same idea as the Kronos parity oracle and the EX4 shadow comparator — but in Node, no
browser. Assert that the cutoff param got distinct env shapes, that onset/duration are correct, etc.

### Level 3 — BROWSER smoke (LAST RESORT, ONCE, kept SHORT — never for logic)
The browser is SLOW and the user dislikes it; use it ONLY for what is **genuinely impossible in
Node** and keep it to a handful of calls. Two legitimate cases:
- **"does sound actually come out"**: load the scene, PROD + Play, assert RMS > 0 and 0 console
  errors, then **HUSH (Ctrl+.)** (cf hush-after-test).
- **paint/frame timing** (e.g. cursor lag = rAF/draw pipeline): this CANNOT be measured in Node,
  so one short Playwright measurement is allowed — but ONE measurement, not an exploration.
Hard limits: NO long sessions, NO dozens of tool calls, NO instrumenting curves to "prove" CV
behavior (that's Level 1). If you find yourself doing many browser calls, STOP — the question is
almost certainly a Level-1/2 Node check. A PM delegating MUST state this in the agent prompt.

## What NOT to do
- ❌ Boot a headless chromium to read `setValueCurveAtTime` curves and prove which envelope applies.
- ❌ Use a long Playwright session to compare per-note cutoff values — that's a Node vitest.
- ❌ Trust headless timing (rAF/timers throttle in background tabs skews rates — measure values, not rates).

## Gotchas
- `resolveVoice` must return the **complete** sibling-voice timeline (all leaves), in **seconds**;
  the `modulator` field is the terminal **name**, an exact key of the `buildModulators` registry.
- Don't compute the modulation window yourself — pass the leaf facets verbatim; `composeLeafModulations`
  derives signal=scope / per-note=note from `controlSubjects`/`controlScopes`.
- Deps are `file:`/`link:` copies — if a Kronos/BPx symbol is "missing", the dist may be stale
  (rebuild upstream); verify the symbol is in `node_modules/<dep>/dist` before assuming a code bug.
- `@kronos/core` is consumed on-disk via the local link; `bpx`/`bpscript` are `file:` copies (rsync
  to refresh). cf the deps-stale-copy memory.

## Cross-refs
- `.claude/skills/live-coding-verify/SKILL.md` — the browser protocol (Level 3 only).
- `.claude/skills/kanopi-tester/SKILL.md` — general test protocol + RMS pattern.
- `docs/design/MODULATION_INPUTS.md` — the 5 inputs + MOD_SCALE ranges (for value assertions).
- `docs/design/TEMPORAL_INTERPRETER.md` + `kronos/docs/CHARTER.md` — why the logic is pure.
