---
name: cv-verify-node
description: Verify Kanopi envelope / clock / re-random / control-facet behavior in Node (vitest or a one-off script) on the PURE functions — and, when the scheduling wiring must be proven, on a MOCKED AudioParam/AudioContext — INSTEAD of a slow headless browser. Use this whenever the claim to prove is about a control facet on a leaf, a curve shape, a clock window, or that re-random re-rolls. Reserve the browser (live-coding-verify / Playwright) for a single final "does it actually make sound" smoke. Triggers on: CV, modulation, envelope, ADSR, LFO, cutoff/pan/resonance, `controls`/`controlNatures`/`controlScopes`/`controlStack`, re-random, hot-swap, Kronos scheduler/timeline.
---

# Verify CV / modulation without a browser

**Rule (Romain, 2026-06-21): do not boot a headless browser to prove envelope/clock/re-random
logic — it is super long and fragile.** That logic is **pure** (zero Web Audio). The browser is
only needed for the final "sound comes out" smoke, never to prove a curve.

An agent once spent ~19 min / 80k tokens launching its own chromium to prove env1/env2/env3
variety — provable in < 1 s in Node. Don't repeat that.

## ⛔ The control-instance layer lives upstream, and it is not reachable from here

The `@cv` declaration, the `mod` library, `ast.cvInstances`, and the `buildModulators` /
`composeLeafModulations` / `renderToBreakpoints` / `evaluateCurve` quartet are **gone from every
door this repo can reach** — measured 2026-08-24 in both regimes: `LIBS` has no `mod` key,
`@kronos/core` exports four names and none of them is in that quartet, and a compiled scene AST
has no `cvInstances` field. What composes a curve today is **Kairos, at flattening** — its door,
not mine. A claim about composition is routed there; it is not written here.

What a leaf still carries, and what this skill proves, is the **facets**: `controls`,
`controlNatures`, `controlScopes`, `controlStack`.

## The three levels (use the lowest one that proves the claim)

### Level 1 — VALUES (the default): pure pipeline in Node/vitest

Compile, derive, assert on the tree. Run from `packages/ui/` so the neighbour specifiers resolve.

```js
import { readFileSync } from 'node:fs';
import { compileToBPxAST } from 'bpscript';
import { createBPx, collectLeaves } from 'bpx';

const r = compileToBPxAST(readFileSync(scene, 'utf8'));   // { ast, errors }
const bpx = createBPx();
bpx.loadGrammar(r.ast);                                    // r.ast is null on any parse error
const d = bpx.derive({ output: 'complete' });              // { tree, tokens }
const nameOf = (id) => bpx.grammar.symbols.getName(id);

const leaves = collectLeaves(d.tree);
// a leaf carries: type id symbolId payload span role tieState containment
//                 controls controlNatures controlScopes controlStack
```

Typical assertions (no audio, < 1 s):

- **control facets**: a scene that writes a control yields the expected `controls` key on the
  expected leaves — and an empty facet everywhere else.
- **clock window**: `controlScopes` carries the span of each scoped control; assert the span, not
  a recomputed one.
- **re-random**: derive twice → the token sequences (`d.tokens.map(t => t.token)`) DIFFER; with
  re-random off → identical. Measured working on `BPScript-tests/dhin1.bps`.

Put recurring ones in a `*.test.ts` under `packages/ui/src/lib/runtimes/`. Run with
`npx vitest run <file>`.

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

Assert that a param got distinct curve shapes, that onset/duration are correct, etc.

### Level 3 — BROWSER smoke (LAST RESORT, ONCE, kept SHORT — never for logic)

The browser is SLOW and the user dislikes it; use it ONLY for what is **genuinely impossible in
Node** and keep it to a handful of calls. Two legitimate cases:

- **"does sound actually come out"**: load the scene, PROD + Play, assert RMS > 0 and 0 console
  errors, then **HUSH (Ctrl+.)** (cf hush-after-test).
- **paint/frame timing** (e.g. cursor lag = rAF/draw pipeline): this CANNOT be measured in Node,
  so one short Playwright measurement is allowed — but ONE measurement, not an exploration.

Hard limits: NO long sessions, NO dozens of tool calls, NO instrumenting curves to "prove" CV
behavior (that's Level 1). A run that has turned into many browser calls should STOP — the question
is almost certainly a Level-1/2 Node check. A PM delegating MUST state this in the agent prompt.

## What NOT to do

- ❌ Boot a headless chromium to read `setValueCurveAtTime` curves and prove which envelope applies.
- ❌ Use a long Playwright session to compare per-note values — that's a Node vitest.
- ❌ Trust headless timing (rAF/timers throttle in background tabs skews rates — measure values, not rates).

## Gotchas

- **Don't recompute a facet.** Pass what the leaf carries verbatim; a window derived by hand is a
  second authority that drifts.
- **Neighbours are read LIVE, not copied.** `bpscript` resolves to `BPscript/src/transpiler/index.js`
  and `bpx` / `@kronos/core` / `@kairos/core` to their built `dist/index.js` in their own repo —
  measured from `packages/ui/`. A "missing" upstream symbol is either a stale `dist` (rebuild there)
  or a symbol that genuinely went away; `import.meta.resolve('<spec>')` says which door you got.
- **The regime depends on the conditions.** vitest forks node with `--conditions development`; plain
  `node` does not. The same import can land on a different file in a bench and in a build.

## Cross-refs

- `.claude/skills/live-coding-verify/SKILL.md` — the browser protocol (Level 3 only).
- `.claude/skills/kanopi-tester/SKILL.md` — general test protocol + RMS pattern.
- `docs/design/TEMPORAL_INTERPRETER.md` + `kronos/docs/CHARTER.md` — why the logic is pure.
