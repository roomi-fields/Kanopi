import { describe, it, expect } from 'vitest';
import { getAdapter, listRuntimes } from './registry';

describe('runtime registry', () => {
  it('lists all known runtimes', () => {
    const r = listRuntimes();
    expect(r).toContain('strudel');
    expect(r).toContain('tidal');
    expect(r).toContain('hydra');
    expect(r).toContain('js');
  });

  it('returns adapter by id', () => {
    expect(getAdapter('strudel')?.id).toBe('strudel');
    expect(getAdapter('hydra')?.id).toBe('hydra');
    expect(getAdapter('js')?.id).toBe('js');
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
    expect(getAdapter('tidal')?.outputType).toBe('notes');
    expect(getAdapter('hydra')?.outputType).toBe('visual');
    expect(getAdapter('p5')?.outputType).toBe('visual');
    expect(getAdapter('bpscript')?.outputType).toBe('notes');
  });
});
