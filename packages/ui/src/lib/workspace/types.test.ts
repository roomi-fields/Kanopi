import { describe, it, expect } from 'vitest';
import { runtimeFromExt } from './types';

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
