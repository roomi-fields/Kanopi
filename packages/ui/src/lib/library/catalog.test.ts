import { describe, it, expect } from 'vitest';
import {
  matchesFilters,
  categoryCounts,
  EMPTY_FILTERS,
  type LibraryItem,
  type LibraryFilters
} from './catalog';

function item(over: Partial<LibraryItem>): LibraryItem {
  return {
    id: 'x',
    name: 'X',
    tagline: '',
    description: '',
    category: 'bp3',
    language: 'bp3',
    outputs: ['audio'],
    level: 'didactic',
    tags: [],
    sessionFile: 'x.gr',
    files: [],
    ...over
  };
}

const filters = (over: Partial<LibraryFilters>): LibraryFilters => ({ ...EMPTY_FILTERS, ...over });

describe('library catalog — filtering', () => {
  it('passes everything under empty filters', () => {
    expect(matchesFilters(item({}), EMPTY_FILTERS)).toBe(true);
  });

  it('filters by category, language, output, level', () => {
    const it1 = item({
      category: 'bpscript',
      language: 'bpscript',
      outputs: ['midi'],
      level: 'advanced'
    });
    expect(matchesFilters(it1, filters({ category: 'bpscript' }))).toBe(true);
    expect(matchesFilters(it1, filters({ category: 'bp3' }))).toBe(false);
    expect(matchesFilters(it1, filters({ language: 'bpscript' }))).toBe(true);
    expect(matchesFilters(it1, filters({ output: 'midi' }))).toBe(true);
    expect(matchesFilters(it1, filters({ output: 'audio' }))).toBe(false);
    expect(matchesFilters(it1, filters({ level: 'advanced' }))).toBe(true);
    expect(matchesFilters(it1, filters({ level: 'didactic' }))).toBe(false);
  });

  it('matches a multi-output item on any of its outputs', () => {
    const orch = item({ outputs: ['audio', 'visual', 'text'] });
    expect(matchesFilters(orch, filters({ output: 'visual' }))).toBe(true);
    expect(matchesFilters(orch, filters({ output: 'midi' }))).toBe(false);
  });

  it('honours the showcase-only flag', () => {
    expect(matchesFilters(item({ showcase: true }), filters({ showcaseOnly: true }))).toBe(true);
    expect(matchesFilters(item({ showcase: false }), filters({ showcaseOnly: true }))).toBe(false);
  });

  it('searches name, tagline, description and tags', () => {
    const a = item({ name: 'Ames', tags: ['polymetric'] });
    expect(matchesFilters(a, filters({ query: 'ames' }))).toBe(true);
    expect(matchesFilters(a, filters({ query: 'POLYMETRIC' }))).toBe(true);
    expect(matchesFilters(a, filters({ query: 'reich' }))).toBe(false);
  });
});

describe('library catalog — category counts', () => {
  it('counts per category and total, respecting other filters', () => {
    const items = [
      item({ category: 'bp3', outputs: ['audio'] }),
      item({ category: 'bp3', outputs: ['text'] }),
      item({ category: 'bpscript', outputs: ['audio'] })
    ];
    const all = categoryCounts(items, EMPTY_FILTERS);
    expect(all.all).toBe(3);
    expect(all.bp3).toBe(2);
    expect(all.bpscript).toBe(1);

    // An output filter narrows the counts (the category axis itself is ignored).
    const audioOnly = categoryCounts(items, filters({ output: 'audio' }));
    expect(audioOnly.all).toBe(2);
    expect(audioOnly.bp3).toBe(1);
  });
});
