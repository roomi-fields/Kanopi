import { describe, it, expect } from 'vitest';
import { matchMapping } from './midi-input';
import type { Mapping } from '../core-mock';

const cv = (id: string, index: number, ch?: number): Mapping => ({
  id,
  source: { kind: 'cv', index, ch },
  target: { kind: 'tempo' }
});
const trig = (id: string, index: number, ch?: number): Mapping => ({
  id,
  source: { kind: 'trig', index, ch },
  target: { kind: 'tempo' }
});
const gate = (id: string, index: number, ch?: number): Mapping => ({
  id,
  source: { kind: 'gate', index, ch },
  target: { kind: 'tempo' }
});

describe('matchMapping', () => {
  it('cv matches CC, any channel when unspecified', () => {
    expect(matchMapping(cv('a', 1), { kind: 'cv', index: 1, value: 64, ch: 1 })).toBe(true);
    expect(matchMapping(cv('a', 1), { kind: 'cv', index: 2, value: 64, ch: 1 })).toBe(false);
    expect(matchMapping(cv('a', 1), { kind: 'cv', index: 1, value: 64, ch: 5 })).toBe(true);
  });

  it('cv filters by channel when specified', () => {
    expect(matchMapping(cv('a', 1, 2), { kind: 'cv', index: 1, value: 64, ch: 2 })).toBe(true);
    expect(matchMapping(cv('a', 1, 2), { kind: 'cv', index: 1, value: 64, ch: 1 })).toBe(false);
  });

  it('trig matches Note-On only (vel>0)', () => {
    expect(matchMapping(trig('p', 36), { kind: 'note', index: 36, value: 100, ch: 10 })).toBe(true);
    expect(matchMapping(trig('p', 36), { kind: 'note', index: 36, value: 0, ch: 10 })).toBe(false);
  });

  it('gate matches both press and release', () => {
    expect(matchMapping(gate('n', 60), { kind: 'note', index: 60, value: 64, ch: 1 })).toBe(true);
    expect(matchMapping(gate('n', 60), { kind: 'note', index: 60, value: 0, ch: 1 })).toBe(true);
  });

  it('cv does not match note events and vice versa', () => {
    expect(matchMapping(cv('a', 1), { kind: 'note', index: 1, value: 64, ch: 1 })).toBe(false);
    expect(matchMapping(trig('a', 1), { kind: 'cv', index: 1, value: 64, ch: 1 })).toBe(false);
  });
});
