import { describe, it, expect, vi } from 'vitest';
import { codeVoiceInterps, warmupAudioContext } from './warmup';
import type { Runtime } from '../core-mock/types';
import type { RuntimeAdapter } from './adapter';

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

describe('warmupAudioContext (défensif)', () => {
  it("no-op sans throw quand aucun adaptateur audio n'est enregistré (getAdapter → undefined)", async () => {
    const getAdapter = vi.fn((_r: Runtime): RuntimeAdapter | undefined => undefined);
    await expect(warmupAudioContext(getAdapter)).resolves.toBeUndefined();
    // Il sonde les ids audio candidats (webaudio, audio) sans exiger qu'ils existent.
    expect(getAdapter).toHaveBeenCalled();
  });

  it("no-op sans throw quand l'adaptateur existe mais n'implémente pas warmup", async () => {
    const adapter = { warmup: undefined } as unknown as RuntimeAdapter;
    const getAdapter = vi.fn((_r: Runtime): RuntimeAdapter | undefined => adapter);
    await expect(warmupAudioContext(getAdapter)).resolves.toBeUndefined();
  });

  it("appelle warmup() quand l'adaptateur l'expose", async () => {
    const warmup = vi.fn(async () => {});
    const adapter = { warmup } as unknown as RuntimeAdapter;
    const getAdapter = vi.fn((_r: Runtime): RuntimeAdapter | undefined => adapter);
    await warmupAudioContext(getAdapter);
    expect(warmup).toHaveBeenCalled();
  });
});
