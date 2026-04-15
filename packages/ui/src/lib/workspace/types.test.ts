import { describe, it, expect } from 'vitest';
import { runtimeFromExt } from './types';

describe('runtimeFromExt', () => {
  it('maps known extensions', () => {
    expect(runtimeFromExt('a.tidal')).toBe('tidal');
    expect(runtimeFromExt('a.scd')).toBe('sc');
    expect(runtimeFromExt('a.hydra')).toBe('hydra');
    expect(runtimeFromExt('a.py')).toBe('python');
    expect(runtimeFromExt('a.js')).toBe('js');
    expect(runtimeFromExt('a.kanopi')).toBe('kanopi');
    expect(runtimeFromExt('a.bps')).toBe('kanopi');
  });
  it('falls back to kanopi for unknown', () => {
    expect(runtimeFromExt('README.md')).toBe('kanopi');
    expect(runtimeFromExt('noext')).toBe('kanopi');
  });
});
