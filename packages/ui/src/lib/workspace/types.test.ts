import { describe, it, expect } from 'vitest';
import { runtimeFromExt } from './types';
import { createEventBus } from '../events/bus';
import { initAdapters } from '../runtimes/registry';

// LE REGISTRE SE CONSTRUIT AVEC LE BUS — comme le cœur le fait dans son constructeur. Chaque banc
// qui le lit l'initialise LUI-MÊME : un fichier d'amorce global instancierait toute la chaîne
// AVANT les simulacres et rendrait des espions aveugles (mesuré le 2026-08-10, sept causes).
initAdapters(createEventBus());

describe('runtimeFromExt', () => {
  it('maps known extensions', () => {
    expect(runtimeFromExt('a.strudel')).toBe('strudel');
    expect(runtimeFromExt('a.scd')).toBe('sc');
    expect(runtimeFromExt('a.hydra')).toBe('hydra');
    expect(runtimeFromExt('a.py')).toBe('python');
    expect(runtimeFromExt('a.js')).toBe('js');
    expect(runtimeFromExt('a.gr')).toBe('bp3');
    expect(runtimeFromExt('a.bps')).toBe('bpscript');
    // No mapping for `.kanopi` anymore — falls back like any unknown extension.
    expect(runtimeFromExt('a.kanopi')).toBe('bpscript');
  });
  it('falls back to bpscript for unknown', () => {
    expect(runtimeFromExt('README.md')).toBe('bpscript');
    expect(runtimeFromExt('noext')).toBe('bpscript');
  });
});
