import { describe, it, expect } from 'vitest';
import { bpxTreeToTimelineStream } from './bpx-tree-stream';
import type { ProductionTreeNode } from '../../stores/production.svelte';
import type { FlatToken } from './bpx-tree-stream';

// Span helper: BPx spans are float ms; here we only fill the two fields the
// adapter reads (startMs/endMs). Tests use the prompt's worked example values.
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

describe('bpxTreeToTimelineStream', () => {
  it('(a) simple polymetry { C4 C4 , E4 E4 E4 } emits markers + leaves with spans', () => {
    // { C4 C4, E4 E4 E4 } at the prompt's float timings.
    const tree: ProductionTreeNode = {
      type: 'sequence',
      span: span(0, 1333.33),
      children: [
        {
          type: 'polymetric',
          span: span(0, 1333.33),
          voices: [
            voice([leaf(1, 0, 666.666), leaf(1, 666.666, 1333.33)], 0, 1333.33),
            voice(
              [leaf(2, 0, 444.444), leaf(2, 444.444, 888.888), leaf(2, 888.888, 1333.33)],
              0,
              1333.33
            )
          ]
        }
      ]
    };
    // Flat tokens (integer ms) for name resolution — same events.
    const flat: FlatToken[] = [
      { token: 'C4', start: 0, end: 667 },
      { token: 'E4', start: 0, end: 444 },
      { token: 'C4', start: 667, end: 1333 },
      { token: 'E4', start: 444, end: 889 },
      { token: 'E4', start: 889, end: 1333 }
    ];

    const stream = bpxTreeToTimelineStream(tree, flat);
    const seq = stream.map((s) => s.token);

    expect(seq).toEqual(['{', 'C4', 'C4', ',', 'E4', 'E4', 'E4', '}']);

    // Voice-0 leaf spans preserved (float ms, untouched).
    const c4a = stream[1];
    expect(c4a).toMatchObject({ token: 'C4', start: 0, end: 666.666 });
    const c4b = stream[2];
    expect(c4b).toMatchObject({ token: 'C4', start: 666.666, end: 1333.33 });
    // Voice-1 leaf spans.
    expect(stream[4]).toMatchObject({ token: 'E4', start: 0, end: 444.444 });
    expect(stream[6]).toMatchObject({ token: 'E4', start: 888.888, end: 1333.33 });
  });

  it('(b) a rest leaf emits a `-` silence (no name)', () => {
    const tree: ProductionTreeNode = {
      type: 'sequence',
      span: span(0, 1000),
      children: [leaf(1, 0, 500), rest(99, 500, 1000)]
    };
    const flat: FlatToken[] = [{ token: 'C4', start: 0, end: 500 }];
    const stream = bpxTreeToTimelineStream(tree, flat);
    expect(stream.map((s) => s.token)).toEqual(['C4', '-']);
    expect(stream[1]).toMatchObject({ token: '-', start: 500, end: 1000 });
  });

  it('(c) nested polymetric emits nested { } markers', () => {
    // { A { B , C } } — outer group voice0 = A, voice1 = inner { B , C }.
    const tree: ProductionTreeNode = {
      type: 'sequence',
      span: span(0, 1000),
      children: [
        {
          type: 'polymetric',
          span: span(0, 1000),
          voices: [
            voice([leaf(1, 0, 1000)], 0, 1000),
            voice(
              [
                {
                  type: 'polymetric',
                  span: span(0, 1000),
                  voices: [voice([leaf(2, 0, 1000)], 0, 1000), voice([leaf(3, 0, 1000)], 0, 1000)]
                }
              ],
              0,
              1000
            )
          ]
        }
      ]
    };
    const flat: FlatToken[] = [
      { token: 'A', start: 0, end: 1000 },
      { token: 'B', start: 0, end: 1000 },
      { token: 'C', start: 0, end: 1000 }
    ];
    const stream = bpxTreeToTimelineStream(tree, flat);
    // Outer { A , { B , C } } — inner braces nested inside voice1.
    expect(stream.map((s) => s.token)).toEqual(['{', 'A', ',', '{', 'B', ',', 'C', '}', '}']);
  });

  it('(d) name resolution: simultaneous leaves resolve in stream order by time', () => {
    // Two voices starting at t=0 with the SAME span: cursor must hand out the
    // two flat tokens of that bucket in order (no collision, no drop).
    const tree: ProductionTreeNode = {
      type: 'sequence',
      span: span(0, 500),
      children: [
        {
          type: 'polymetric',
          span: span(0, 500),
          voices: [voice([leaf(1, 0, 500)], 0, 500), voice([leaf(2, 0, 500)], 0, 500)]
        }
      ]
    };
    // Bucket "0:500" holds C4 then E4 — voice0 leaf takes C4, voice1 leaf takes E4.
    const flat: FlatToken[] = [
      { token: 'C4', start: 0, end: 500 },
      { token: 'E4', start: 0, end: 500 }
    ];
    const stream = bpxTreeToTimelineStream(tree, flat);
    expect(stream.map((s) => s.token)).toEqual(['{', 'C4', ',', 'E4', '}']);
  });

  it('(e) symbolNames is PRIMARY: names come from the table, not temporal correlation', () => {
    // Same { } as (d) but the flat tokens are deliberately WRONG (X/Y). With a
    // symbolNames table provided, the resolver must ignore the flat tokens.
    const tree: ProductionTreeNode = {
      type: 'sequence',
      span: span(0, 500),
      children: [
        {
          type: 'polymetric',
          span: span(0, 500),
          voices: [voice([leaf(1, 0, 500)], 0, 500), voice([leaf(2, 0, 500)], 0, 500)]
        }
      ]
    };
    const flat: FlatToken[] = [
      { token: 'X', start: 0, end: 500 },
      { token: 'Y', start: 0, end: 500 }
    ];
    const symbolNames = { 1: 'C4', 2: 'E4' };
    const stream = bpxTreeToTimelineStream(tree, flat, symbolNames);
    expect(stream.map((s) => s.token)).toEqual(['{', 'C4', ',', 'E4', '}']);
  });

  it('(f) polymetric collision: overlapping voices resolve via symbolNames (the bug)', () => {
    // `{5, a c b, f f f - f}`-like: two voices over the SAME total span whose
    // leaves land in COLLIDING time buckets. Temporal correlation would hand the
    // wrong flat token (or run out → `#<id>`). symbolNames resolves each leaf by
    // its own symbolId, immune to the overlap.
    // ids 14,15,16,17 → a,c,b,f (the prompt's verified mapping).
    const symbolNames = { 14: 'a', 15: 'c', 16: 'b', 17: 'f' };
    // Voice A: a c b over [0,600). Voice B: f f f - f over [0,600).
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
    // Flat tokens intentionally NOT provided (the collision case): resolution
    // must work from symbolNames alone.
    const stream = bpxTreeToTimelineStream(tree, [], symbolNames);
    expect(stream.map((s) => s.token)).toEqual([
      '{',
      'a',
      'c',
      'b',
      ',',
      'f',
      'f',
      'f',
      '-',
      'f',
      '}'
    ]);
    // No placeholders leaked.
    expect(stream.some((s) => s.token.startsWith('#'))).toBe(false);
  });

  it('(g) symbolNames falls through to temporal correlation when an id is missing', () => {
    const tree: ProductionTreeNode = {
      type: 'sequence',
      span: span(0, 200),
      children: [leaf(1, 0, 100), leaf(2, 100, 200)]
    };
    const flat: FlatToken[] = [
      { token: 'a', start: 0, end: 100 },
      { token: 'b', start: 100, end: 200 }
    ];
    // Table names id 1 only; id 2 must fall back to the flat token `b`.
    const stream = bpxTreeToTimelineStream(tree, flat, { 1: 'a' });
    expect(stream.map((s) => s.token)).toEqual(['a', 'b']);
  });

  it('handles a missing/empty tree gracefully', () => {
    expect(bpxTreeToTimelineStream(null, [])).toEqual([]);
    expect(bpxTreeToTimelineStream(undefined, [])).toEqual([]);
  });

  it('accepts a { root } wrapper as well as a bare node', () => {
    const node: ProductionTreeNode = {
      type: 'sequence',
      span: span(0, 100),
      children: [leaf(1, 0, 100)]
    };
    const flat: FlatToken[] = [{ token: 'C4', start: 0, end: 100 }];
    expect(bpxTreeToTimelineStream({ root: node }, flat).map((s) => s.token)).toEqual(['C4']);
    expect(bpxTreeToTimelineStream(node, flat).map((s) => s.token)).toEqual(['C4']);
  });
});
