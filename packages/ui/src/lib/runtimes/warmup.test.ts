import { describe, it, expect } from 'vitest';
import { codeVoiceInterps } from './warmup';

describe('codeVoiceInterps', () => {
  it("collecte les interps DISTINCTS d'une scène orchestrée multi-acteurs + backticks", () => {
    const orchestration = {
      actors: [
        { evalInterp: 'eval.strudel' },
        { evalInterp: 'eval.hydra' },
        { evalInterp: 'eval.strudel' } // doublon acteur → dédoublonné
      ]
    };
    const backticks = {
      BTstrudel0: { interp: 'strudel' },
      BThydra1: { interp: 'hydra' },
      BThydra2: { interp: 'hydra' } // doublon backtick → dédoublonné
    };
    const interps = codeVoiceInterps(orchestration, backticks);
    expect(interps).toEqual(['eval.strudel', 'eval.hydra', 'strudel', 'hydra']);
  });

  it('filtre les interps vides ou absents (acteurs notes natifs, backtick sans tag)', () => {
    const orchestration = {
      actors: [{ evalInterp: undefined }, { evalInterp: '' }, { evalInterp: 'eval.p5' }]
    };
    const backticks = { BTx: { interp: '' }, BTy: { interp: undefined }, BTz: { interp: 'p5' } };
    expect(codeVoiceInterps(orchestration, backticks)).toEqual(['eval.p5', 'p5']);
  });

  it('retourne une liste vide pour une scène SANS voix-code (mono notes, aucun backtick)', () => {
    expect(codeVoiceInterps({ actors: [{ evalInterp: undefined }] }, {})).toEqual([]);
    expect(codeVoiceInterps(undefined, undefined)).toEqual([]);
  });
});
