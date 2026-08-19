import { describe, it, expect } from 'vitest';
import { interpsForScene } from './bpx-adapter';

// ⛔ LES DEUX FIXTURES SONT QUALIFIÉES PAR LEUR ACTEUR, ET CE N EST PAS COSMÉTIQUE. Elles
// écrivaient un backtick SANS LANGAGE — deux et quatre erreurs, « il doit être connu, jamais
// deviné ». Le compilateur rendait quand même un arbre (16 clés), et ce banc le lisait : il
// mesurait donc la préchauffe d une scène REFUSÉE, et il était VERT. Révélé le 2026-08-19 par la
// porte d entrée qui teste les erreurs (décision Romain, « l arbre ne se lit qu après un succès »).
// La forme qui porte AUSSI l identité de la voix est le point d acteur — `groove.\`…\`` — celle
// que la bibliothèque écrit déjà (02-strudel-hydra.bps:20,25).
// [762]/#755.1 — prove the on-OPEN preload reads the code-voice interps off the COMPILED AST
// (buildOrchestration + backticksFromAst → codeVoiceInterps), so opening a scene that embeds an
// engine gives the host the exact interps to warm. No host text re-derivation.

describe('interpsForScene — engines a scene declares (for on-open preload)', () => {
  it('detects a single strudel voice', () => {
    const code =
      'core\ntempo:120\n\nactor v  eval.strudel\n\n-----\nS -> v_r\n\nv_r -> v.`sound("bd hh sd oh")`';
    const interps = interpsForScene(code);
    expect(interps.length).toBeGreaterThan(0);
    expect(interps.some((i) => /strudel/.test(i))).toBe(true);
  });

  it('detects BOTH engines of a strudel + hydra scene', () => {
    const code =
      'actor groove  eval.strudel\nactor viz  eval.hydra\n\n-----\nS -> { groove_r, viz_r }\n\ngroove_r -> groove.`sound("bd")`\n\nviz_r -> viz.`osc(60).out()`';
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
