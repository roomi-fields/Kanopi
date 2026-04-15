import { describe, it, expect } from 'vitest';
import { matchMapping } from './midi-input';
import type { Mapping } from '../core-mock';

const cc = (id: string, index: number, ch?: number): Mapping => ({
  id,
  source: { kind: 'cc', index, ch },
  target: { kind: 'tempo' }
});
const pad = (id: string, index: number): Mapping => ({
  id,
  source: { kind: 'pad', index },
  target: { kind: 'tempo' }
});
const note = (id: string, index: number, ch?: number): Mapping => ({
  id,
  source: { kind: 'note', index, ch },
  target: { kind: 'tempo' }
});

describe('matchMapping', () => {
  it('cc matches by index, any channel when unspecified', () => {
    expect(matchMapping(cc('a', 1), { kind: 'cc', index: 1, value: 64, ch: 1 })).toBe(true);
    expect(matchMapping(cc('a', 1), { kind: 'cc', index: 2, value: 64, ch: 1 })).toBe(false);
    expect(matchMapping(cc('a', 1), { kind: 'cc', index: 1, value: 64, ch: 5 })).toBe(true);
  });

  it('cc filters by channel when specified', () => {
    expect(matchMapping(cc('a', 1, 2), { kind: 'cc', index: 1, value: 64, ch: 2 })).toBe(true);
    expect(matchMapping(cc('a', 1, 2), { kind: 'cc', index: 1, value: 64, ch: 1 })).toBe(false);
  });

  it('pad matches Note-On only (vel>0)', () => {
    expect(matchMapping(pad('p', 36), { kind: 'note', index: 36, value: 100, ch: 10 })).toBe(true);
    expect(matchMapping(pad('p', 36), { kind: 'note', index: 36, value: 0, ch: 10 })).toBe(false);
  });

  it('note matches both note-on and note-off', () => {
    expect(matchMapping(note('n', 60), { kind: 'note', index: 60, value: 64, ch: 1 })).toBe(true);
    expect(matchMapping(note('n', 60), { kind: 'note', index: 60, value: 0, ch: 1 })).toBe(true);
  });
});
