import { describe, it, expect } from 'vitest';
import { interpsForScene } from './bpx-adapter';

// [762]/#755.1 — prove the on-OPEN preload reads the code-voice interps off the COMPILED AST
// (buildOrchestration + backticksFromAst → codeVoiceInterps), so opening a scene that embeds an
// engine gives the host the exact interps to warm. No host text re-derivation.

describe('interpsForScene — engines a scene declares (for on-open preload)', () => {
  it('detects a single strudel voice', () => {
    const code =
      'core\ntempo:120\n\nactor v  eval.strudel\n\n-----\nS -> v\n\nv -> `sound("bd hh sd oh")`';
    const interps = interpsForScene(code);
    expect(interps.length).toBeGreaterThan(0);
    expect(interps.some((i) => /strudel/.test(i))).toBe(true);
  });

  it('detects BOTH engines of a strudel + hydra scene', () => {
    const code =
      'actor groove  eval.strudel\nactor viz  eval.hydra\n\n-----\nS -> { groove, viz }\n\ngroove -> `sound("bd")`\n\nviz -> `osc(60).out()`';
    const interps = interpsForScene(code);
    expect(interps.some((i) => /strudel/.test(i))).toBe(true);
    expect(interps.some((i) => /hydra/.test(i))).toBe(true);
  });

  it('returns empty for a pure-note scene with no code voice', () => {
    const code =
      'core\nalphabet.western:audio\ntempo:120\n-----\nS -> Bass\nBass -> C2 C2 (wave:sawtooth)';
    expect(interpsForScene(code)).toEqual([]);
  });

  it('returns empty on unparseable / empty text (best-effort, never throws)', () => {
    expect(interpsForScene('')).toEqual([]);
    expect(interpsForScene('%%% not a scene %%%')).toEqual([]);
  });
});
