import { describe, it, expect } from 'vitest';
import { getAdapter, listRuntimes, codeVoiceReachesMasterBus } from './registry';

describe('runtime registry', () => {
  it('lists all known runtimes', () => {
    const r = listRuntimes();
    expect(r).toContain('strudel');
    expect(r).toContain('hydra');
    expect(r).toContain('js');
  });

  it('returns adapter by id', () => {
    expect(getAdapter('strudel')?.id).toBe('strudel');
    expect(getAdapter('hydra')?.id).toBe('hydra');
    expect(getAdapter('js')?.id).toBe('js');
  });

  // VERROU [901] (architecte, 2026-07-24) — le grisage du contrôle MAÎTRE se décide sur la
  // capacité MAÎTRE de la voix, LUE SUR L'ADAPTATEUR, jamais sur une liste en dur : une voix
  // câblée en amont doit dégriser le maître sans qu'on touche Kanopi. Le cas qui a mis sur la
  // piste : une scène où SEULE une voix mercury est vivante grisait un fader et un mute qui
  // fonctionnent (runtime-codevoices 5c4f4e8, voices/master-out.ts).
  it('codeVoiceReachesMasterBus : vrai pour les voix qui portent un étage de sortie maître', () => {
    expect(codeVoiceReachesMasterBus('mercury')).toBe(true);
    expect(codeVoiceReachesMasterBus('js')).toBe(true);
    expect(codeVoiceReachesMasterBus('p5')).toBe(true);
    expect(codeVoiceReachesMasterBus('strudel')).toBe(true);
    expect(codeVoiceReachesMasterBus('csound')).toBe(true);
  });

  it('codeVoiceReachesMasterBus : FAUX pour hydra — rien à couper, absence assumée en amont', () => {
    // runtime-codevoices/src/voices/hydra.ts:163 déclare l'absence comme la réponse JUSTE.
    expect(codeVoiceReachesMasterBus('hydra')).toBe(false);
  });

  it('returns undefined for unknown / unsupported', () => {
    expect(getAdapter('sc')).toBeUndefined();
    expect(getAdapter('python')).toBeUndefined();
    expect(getAdapter('kanopi')).toBeUndefined();
  });

  // ADAPTER_SPEC §1bis (b): every registered adapter declares an output type
  // (OBLIGATOIRE) drawn from the VoiceOutputType union, so the dispatcher can
  // check voice↔device compatibility.
  it('every adapter declares a valid outputType', () => {
    const allowed = new Set(['notes', 'signal', 'visual', 'control', 'light', 'text']);
    for (const id of listRuntimes()) {
      const a = getAdapter(id);
      expect(a, `adapter ${id} missing`).toBeDefined();
      expect(allowed.has(a!.outputType), `${id}.outputType=${a!.outputType}`).toBe(true);
    }
  });

  it('declares beta output types per §1bis guidance', () => {
    expect(getAdapter('strudel')?.outputType).toBe('notes');
    expect(getAdapter('hydra')?.outputType).toBe('visual');
    expect(getAdapter('p5')?.outputType).toBe('visual');
    expect(getAdapter('bpscript')?.outputType).toBe('notes');
  });
});
