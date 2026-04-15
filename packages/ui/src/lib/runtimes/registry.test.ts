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
});
