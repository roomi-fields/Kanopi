// PARITY BARRIER (KAN-orchestration P1, option A) — prove that switching the host's
// BPx entry from `createBPx(opts).loadGrammar(ast).derive()` to the upstream
// `createSession(ast, opts).derive()` (which CARRIES `buildProjectionContext`)
// yields an IDENTICAL derivation: same tree (structure + leaves) AND same timed
// tokens (onset/duration/token/actor/nodeId). Both paths use the DEFAULT output
// ('sounding') — `output:'complete'` now THROWS in BPx (migrated to Kairos), so the
// comparison is the path the host will actually run.
//
// If this DIVERGES, option A is invalid (the `createSession` factory is not the same
// derivation as `createBPx + loadGrammar`) and the host MUST NOT flip; report the
// divergence. If IDENTICAL, the flip in `bpx-adapter.ts` is proven safe.

import { describe, it, expect } from 'vitest';
import { compileToBPxAST } from 'bpscript/src/transpiler/index.js';
import { createBPx, createSession, type SessionOptions } from 'bpx';
import type { TimedToken } from 'bpx';

// Two REAL bundled scenes (inlined — the UI tsconfig has no node:fs types):
//  - dual-actors-audio.bps: a normal multi-actor .bps (notes, controls, rest).
//  - arabic.bps: a non-English alphabet + maqam tuning + mm scene (the exact kind
//    of scene whose silence was the "FAIT means proven on REAL scenes" lesson).
const DUAL_ACTORS = `core

actor lead  alphabet.western  out.audio
actor bass  alphabet.western  out.audio

-----
S -> {Lead, Low}

Lead -> lead.C5 lead.E5 lead.G5 lead.E5 lead.C5 lead.E5 lead.G5 lead.E5
Low  -> bass.C2(wave:sawtooth, vel:90) - bass.G2 - bass.A2 - bass.F2 -
`;

const ARABIC = `core
alphabet.arabic:audio
tuning.maqam_rast
tempo:70

-----
S -> Sayr Rujoo Qarar

Sayr -> rast dukah sikah jaharkah nawa husayni awj (wave:sine, vel:85)
Rujoo -> awj husayni nawa jaharkah sikah dukah rast (vel:70)
Qarar -> rast _ _ _ _ (vel:60)
`;

// The host's createBPx config (bpx-adapter.ts ~l.1500) → SessionOptions mapping
// (instance.ts loadGrammar): tempo→tempo, settings→settings, flags→initialFlags,
// seed→seed. We exercise the config shapes the host actually passes: a seed and an
// explicit derive tempo (arabic carries tempo:70, so deriveTempo is undefined there —
// BPx applies its own default; we mirror that by passing the same to both paths).
interface HostConfig {
  tempo?: number;
  settings?: SessionOptions['settings'];
  flags?: Record<string, number>;
  seed?: number;
}

function toSessionOptions(cfg: HostConfig): SessionOptions {
  const o: SessionOptions = {};
  if (cfg.seed !== undefined) o.seed = cfg.seed;
  if (cfg.settings !== undefined) o.settings = cfg.settings;
  if (cfg.flags !== undefined) o.initialFlags = cfg.flags;
  if (cfg.tempo !== undefined) o.tempo = cfg.tempo;
  return o;
}

// Compact, structural view of a tree node (recurses) — what the Kairos projection reads:
// node identity (nodeId/symbolId/type), the timed span, and children in order. We
// intentionally avoid comparing the whole opaque object (payloads carry closures).
interface NodeView {
  nodeId: unknown;
  symbolId: unknown;
  type: unknown;
  startMs: unknown;
  endMs: unknown;
  children: NodeView[];
}
function viewNode(n: unknown): NodeView {
  const o = (n ?? {}) as {
    nodeId?: unknown;
    symbolId?: unknown;
    type?: unknown;
    span?: { startMs?: unknown; endMs?: unknown } | null;
    children?: unknown[];
  };
  return {
    nodeId: o.nodeId,
    symbolId: o.symbolId,
    type: o.type,
    startMs: o.span?.startMs,
    endMs: o.span?.endMs,
    children: ((o.children ?? []) as unknown[]).map(viewNode)
  };
}

interface TokView {
  token: string;
  start: number;
  end: number;
  duration: number;
  type: string;
  actor: string | null;
  // nodeId rides the shim's index signature (`[k]: unknown`); compared by value.
  nodeId: unknown;
}
function viewTok(t: TimedToken): TokView {
  return {
    token: t.token,
    start: t.start,
    end: t.end,
    duration: t.duration,
    type: t.type,
    actor: t.actor,
    nodeId: t.nodeId
  };
}

// LEGACY path (today's host): createBPx(opts) + loadGrammar(ast) + derive() [sounding].
function deriveViaInstance(src: string, cfg: HostConfig): { tree: NodeView; tokens: TokView[] } {
  const ast = compileToBPxAST(src, cfg.tempo != null ? { tempo: cfg.tempo } : undefined).ast;
  const bpx = createBPx({
    ...(cfg.tempo !== undefined ? { tempo: cfg.tempo } : {}),
    ...(cfg.settings !== undefined ? { settings: cfg.settings } : {}),
    ...(cfg.flags !== undefined ? { flags: cfg.flags } : {}),
    ...(cfg.seed !== undefined ? { seed: cfg.seed } : {})
  });
  bpx.loadGrammar(ast);
  const derived = bpx.derive(); // DEFAULT (sounding) — 'complete' now throws.
  return { tree: viewNode(derived.tree), tokens: derived.tokens.map(viewTok) };
}

// NEW path: createSession(ast, opts).derive() [sounding] + emit('timed-tokens').
function deriveViaSession(src: string, cfg: HostConfig): { tree: NodeView; tokens: TokView[] } {
  const ast = compileToBPxAST(src, cfg.tempo != null ? { tempo: cfg.tempo } : undefined).ast;
  const session = createSession(ast!, toSessionOptions(cfg));
  const result = session.derive(); // DEFAULT (sounding).
  // emit auto-injects resolveName/resolveKind from its own symbols (session.ts),
  // exactly like BPxInstance.derive() does for its token half.
  const tokens = session.emit<TimedToken[]>('timed-tokens');
  return { tree: viewNode(result.tree), tokens: tokens.map(viewTok) };
}

const SCENES: Array<{ name: string; src: string; cfg: HostConfig }> = [
  { name: 'dual-actors-audio (normal .bps)', src: DUAL_ACTORS, cfg: { tempo: 120, seed: 1 } },
  // arabic carries tempo:70 in the source, so the host passes deriveTempo=undefined
  // (BPx reads mm). Mirror that: no tempo override on either path.
  { name: 'arabic (maqam, non-English alphabet)', src: ARABIC, cfg: { seed: 1 } }
];

describe('createSession ≡ createBPx+loadGrammar (parity barrier, option A)', () => {
  for (const scene of SCENES) {
    it(`tree is identical — ${scene.name}`, () => {
      const a = deriveViaInstance(scene.src, scene.cfg);
      const b = deriveViaSession(scene.src, scene.cfg);
      expect(b.tree).toEqual(a.tree);
    });

    it(`timed tokens are identical — ${scene.name}`, () => {
      const a = deriveViaInstance(scene.src, scene.cfg);
      const b = deriveViaSession(scene.src, scene.cfg);
      expect(b.tokens.length).toBe(a.tokens.length);
      expect(b.tokens).toEqual(a.tokens);
    });
  }
});
