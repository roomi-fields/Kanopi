import { describe, it, expect } from 'vitest';
import { treeToDispatchEvents } from './tree-dispatch';

// Forge a tree literal as the (discriminated-union) param type: hand-built
// objects widen `type` to `string`, which tsc rejects against the union. The
// runtime reads the fields structurally, so the cast is sound for these fixtures.
type ForgedTree = Parameters<typeof treeToDispatchEvents>[0];
const forge = (t: unknown): ForgedTree => t as ForgedTree;

// A hand-forged multi-actor tree (the corpus has no two-actor `.bps`, so we
// build the minimal shape `treeToDispatchEvents` reads). Two actors share the
// terminal name 'Sa' (symbolId 1) but carry DISTINCT `payload.actor`.
const span = (startMs: number, endMs: number) => ({
  startBeat: 0,
  endBeat: 0,
  durationBeats: 0,
  startMs,
  endMs,
  durationMs: endMs - startMs,
  tempoMultiplier: 1
});

describe('treeToDispatchEvents', () => {
  it('flattens a multi-actor tree into ordered events with per-node payload', () => {
    const tree = {
      root: {
        type: 'sequence',
        children: [
          {
            type: 'occupying',
            symbolId: 1,
            role: 'leaf',
            payload: { nature: 'sounding', actor: 'sitar' },
            span: span(0, 500)
          },
          {
            type: 'control',
            symbolId: 9,
            nature: 'transport-control',
            payload: {
              role: 'control-marker',
              payload: {
                kind: 'script',
                nature: 'transport-control',
                pairs: [{ key: 'vel', value: 80 }]
              }
            },
            span: span(500, 500)
          },
          {
            type: 'occupying',
            symbolId: 1,
            role: 'leaf',
            payload: { nature: 'sounding', actor: 'tabla', params: { vel: 40 } },
            span: span(500, 1000)
          },
          { type: 'occupying', symbolId: -1, role: 'rest', span: span(1000, 1500) }
        ]
      }
    };
    const names = { 1: 'Sa', 9: '_vel' };

    const events = treeToDispatchEvents(forge(tree), names);

    expect(events).toHaveLength(4);
    // (1) first note → sitar, named 'Sa', 0–0.5s
    expect(events[0]).toMatchObject({
      token: 'Sa',
      type: 'note',
      startSec: 0,
      durSec: 0.5,
      payload: { actor: 'sitar' }
    });
    // (2) control node carries marker payload + nature
    expect(events[1]).toMatchObject({
      token: '_vel',
      type: 'control',
      nature: 'transport-control'
    });
    expect((events[1].payload as { payload: { pairs: unknown } }).payload.pairs).toEqual([
      { key: 'vel', value: 80 }
    ]);
    // (3) second note → tabla, SAME token, occurrence override params
    expect(events[2]).toMatchObject({
      token: 'Sa',
      type: 'note',
      payload: { actor: 'tabla', params: { vel: 40 } }
    });
    // (4) rest emitted as '-'
    expect(events[3]).toMatchObject({ token: '-', type: 'rest' });
  });

  it('recurses polymetric voices in order', () => {
    const tree = {
      root: {
        type: 'polymetric',
        voices: [
          {
            type: 'voice',
            children: [
              {
                type: 'occupying',
                symbolId: 1,
                role: 'leaf',
                payload: { actor: 'a' },
                span: span(0, 1000)
              }
            ]
          },
          {
            type: 'voice',
            children: [
              {
                type: 'occupying',
                symbolId: 2,
                role: 'leaf',
                payload: { actor: 'b' },
                span: span(0, 500)
              }
            ]
          }
        ]
      }
    };
    const events = treeToDispatchEvents(forge(tree), { 1: 'C', 2: 'E' });
    expect(events.map((e) => e.token)).toEqual(['C', 'E']);
    expect(events.map((e) => (e.payload as { actor: string }).actor)).toEqual(['a', 'b']);
  });

  it('falls back to #symbolId when the name table lacks an id', () => {
    const tree = {
      root: {
        type: 'sequence',
        children: [
          { type: 'occupying', symbolId: 7, role: 'leaf', payload: {}, span: span(0, 100) }
        ]
      }
    };
    expect(treeToDispatchEvents(forge(tree), {})[0].token).toBe('#7');
  });

  it('returns [] for an empty/absent tree', () => {
    expect(treeToDispatchEvents(null)).toEqual([]);
    expect(treeToDispatchEvents(undefined)).toEqual([]);
  });
});
