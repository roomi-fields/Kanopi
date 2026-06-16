import { describe, it, expect } from 'vitest';
import { bpxTreeToCanonical, orderedTokensFromTree } from './bpx-tree-canonical';
import type { FlatToken } from './bpx-tree-canonical';
import type { ProductionTreeNode } from '../../stores/production.svelte';

// Span helper: fill only the two fields the serializer reads (startMs/endMs).
function span(startMs: number, endMs: number) {
  return { startMs, endMs };
}
function leaf(symbolId: number, startMs: number, endMs: number): ProductionTreeNode {
  return { type: 'occupying', symbolId, role: 'leaf', span: span(startMs, endMs) };
}
function rest(symbolId: number, startMs: number, endMs: number): ProductionTreeNode {
  return { type: 'occupying', symbolId, role: 'rest', span: span(startMs, endMs) };
}
function voice(children: ProductionTreeNode[], s: number, e: number): ProductionTreeNode {
  return { type: 'voice', children, span: span(s, e) };
}

describe('bpxTreeToCanonical / orderedTokensFromTree', () => {
  it('{a,b} c — delimiters are separators, NOT emitted', () => {
    // polymetric two voices (a | b) then a sequence-level leaf c.
    const flat: FlatToken[] = [
      { token: 'a', start: 0, end: 100 },
      { token: 'b', start: 0, end: 100 },
      { token: 'c', start: 100, end: 200 }
    ];
    const tree: ProductionTreeNode = {
      type: 'sequence',
      span: span(0, 200),
      children: [
        {
          type: 'polymetric',
          span: span(0, 100),
          voices: [voice([leaf(1, 0, 100)], 0, 100), voice([leaf(2, 0, 100)], 0, 100)]
        },
        leaf(3, 100, 200)
      ]
    };
    expect(bpxTreeToCanonical(tree, flat)).toBe('{a,b} c');
    expect(orderedTokensFromTree(tree, flat)).toEqual(['a', 'b', 'c']);
  });

  it('simple sequence a a a b b b', () => {
    const flat: FlatToken[] = [
      { token: 'a', start: 0, end: 100 },
      { token: 'a', start: 100, end: 200 },
      { token: 'a', start: 200, end: 300 },
      { token: 'b', start: 300, end: 400 },
      { token: 'b', start: 400, end: 500 },
      { token: 'b', start: 500, end: 600 }
    ];
    const tree: ProductionTreeNode = {
      type: 'sequence',
      span: span(0, 600),
      children: [
        leaf(1, 0, 100),
        leaf(1, 100, 200),
        leaf(1, 200, 300),
        leaf(2, 300, 400),
        leaf(2, 400, 500),
        leaf(2, 500, 600)
      ]
    };
    expect(bpxTreeToCanonical(tree, flat)).toBe('a a a b b b');
    expect(orderedTokensFromTree(tree, flat)).toEqual(['a', 'a', 'a', 'b', 'b', 'b']);
  });

  it('nesting: a polymetric voice containing a nested polymetric', () => {
    const flat: FlatToken[] = [
      { token: 'a', start: 0, end: 100 },
      { token: 'b', start: 0, end: 50 },
      { token: 'c', start: 50, end: 100 }
    ];
    // { a , { b , c } }  — voice 2 of the outer group is itself a polymetric.
    const tree: ProductionTreeNode = {
      type: 'sequence',
      span: span(0, 100),
      children: [
        {
          type: 'polymetric',
          span: span(0, 100),
          voices: [
            voice([leaf(1, 0, 100)], 0, 100),
            voice(
              [
                {
                  type: 'polymetric',
                  span: span(0, 100),
                  voices: [voice([leaf(2, 0, 50)], 0, 50), voice([leaf(3, 50, 100)], 50, 100)]
                }
              ],
              0,
              100
            )
          ]
        }
      ]
    };
    expect(bpxTreeToCanonical(tree, flat)).toBe('{a,{b,c}}');
    expect(orderedTokensFromTree(tree, flat)).toEqual(['a', 'b', 'c']);
  });

  it('silence -, between sounding leaves', () => {
    const flat: FlatToken[] = [
      { token: 'a', start: 0, end: 100 },
      { token: 'b', start: 200, end: 300 }
    ];
    const tree: ProductionTreeNode = {
      type: 'sequence',
      span: span(0, 300),
      children: [leaf(1, 0, 100), rest(0, 100, 200), leaf(2, 200, 300)]
    };
    expect(bpxTreeToCanonical(tree, flat)).toBe('a - b');
    expect(orderedTokensFromTree(tree, flat)).toEqual(['a', '-', 'b']);
  });

  it('symbolNames is PRIMARY: names come from the table, not temporal correlation', () => {
    // Flat tokens deliberately WRONG (X/Y); with a table, they are ignored.
    const flat: FlatToken[] = [
      { token: 'X', start: 0, end: 100 },
      { token: 'Y', start: 0, end: 100 }
    ];
    const tree: ProductionTreeNode = {
      type: 'sequence',
      span: span(0, 100),
      children: [
        {
          type: 'polymetric',
          span: span(0, 100),
          voices: [voice([leaf(1, 0, 100)], 0, 100), voice([leaf(2, 0, 100)], 0, 100)]
        }
      ]
    };
    const symbolNames = { 1: 'a', 2: 'b' };
    expect(bpxTreeToCanonical(tree, flat, symbolNames)).toBe('{a,b}');
    expect(orderedTokensFromTree(tree, flat, symbolNames)).toEqual(['a', 'b']);
  });

  it('polymetric {5, a c b, f f f - f}-like: overlapping voices resolve via symbolNames', () => {
    // The reported bug: colliding time buckets across simultaneous voices made
    // temporal correlation emit `#14 #15 #16 …` placeholders. symbolNames fixes it.
    // ids 14,15,16,17 → a,c,b,f (the prompt's verified mapping).
    const symbolNames = { 14: 'a', 15: 'c', 16: 'b', 17: 'f' };
    const tree: ProductionTreeNode = {
      type: 'sequence',
      span: span(0, 600),
      children: [
        {
          type: 'polymetric',
          span: span(0, 600),
          voices: [
            voice([leaf(14, 0, 200), leaf(15, 200, 400), leaf(16, 400, 600)], 0, 600),
            voice(
              [
                leaf(17, 0, 150),
                leaf(17, 150, 300),
                leaf(17, 300, 450),
                rest(99, 450, 525),
                leaf(17, 525, 600)
              ],
              0,
              600
            )
          ]
        }
      ]
    };
    // No flat tokens: resolution must come from symbolNames alone.
    expect(bpxTreeToCanonical(tree, [], symbolNames)).toBe('{a c b,f f f - f}');
    expect(orderedTokensFromTree(tree, [], symbolNames)).toEqual([
      'a',
      'c',
      'b',
      'f',
      'f',
      'f',
      '-',
      'f'
    ]);
  });

  it('symbolNames falls through to temporal correlation when an id is missing', () => {
    const flat: FlatToken[] = [
      { token: 'a', start: 0, end: 100 },
      { token: 'b', start: 100, end: 200 }
    ];
    const tree: ProductionTreeNode = {
      type: 'sequence',
      span: span(0, 200),
      children: [leaf(1, 0, 100), leaf(2, 100, 200)]
    };
    // Table names id 1 only; id 2 falls back to the flat token `b`.
    expect(orderedTokensFromTree(tree, flat, { 1: 'a' })).toEqual(['a', 'b']);
  });

  it('empty / null tree → empty results', () => {
    expect(bpxTreeToCanonical(null)).toBe('');
    expect(orderedTokensFromTree(null)).toEqual([]);
    expect(orderedTokensFromTree(undefined)).toEqual([]);
  });

  it('accepts the `{ root }` wrapper shape', () => {
    const flat: FlatToken[] = [{ token: 'a', start: 0, end: 100 }];
    const wrapped = { root: leaf(1, 0, 100) };
    expect(orderedTokensFromTree(wrapped, flat)).toEqual(['a']);
  });
});
