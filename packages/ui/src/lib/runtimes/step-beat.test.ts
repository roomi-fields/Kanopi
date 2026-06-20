import { describe, it, expect } from 'vitest';
import { sliceBeat } from './bpx-adapter';

// STEP advances one clock beat (`60000/bpm` ms) at a time, NOT a head-rule
// section. `sliceBeat` keeps the tokens whose onset falls inside the requested
// beat window and re-zeroes them so the slice plays immediately. These cover the
// window math the STEP cursor relies on.

type Tok = { token: string; start: number; end: number };

// A 4-beat timeline at 120 bpm → beat = 500 ms. One note per beat.
const beatMs = 500;
const tokens: Tok[] = [
  { token: 'C4', start: 0, end: 250 },
  { token: 'D4', start: 500, end: 750 },
  { token: 'E4', start: 1000, end: 1250 },
  { token: 'F4', start: 1500, end: 1750 }
];

describe('sliceBeat (STEP unit = one beat)', () => {
  it('keeps only the tokens whose onset is inside beat 0', () => {
    const out = sliceBeat(tokens, 0, beatMs);
    expect(out.map((t) => t.token)).toEqual(['C4']);
    expect(out[0]).toMatchObject({ start: 0, end: 250 });
  });

  it('re-zeroes a later beat back to t=0', () => {
    const out = sliceBeat(tokens, 2, beatMs);
    expect(out.map((t) => t.token)).toEqual(['E4']);
    // 1000ms onset shifted back by 2*500ms → 0
    expect(out[0]).toMatchObject({ start: 0, end: 250 });
  });

  it('a token landing exactly on the next beat boundary belongs to the next beat', () => {
    // D4 onset is 500ms = start of beat 1, so it is NOT in beat 0.
    expect(sliceBeat(tokens, 0, beatMs).map((t) => t.token)).not.toContain('D4');
    expect(sliceBeat(tokens, 1, beatMs).map((t) => t.token)).toEqual(['D4']);
  });

  it('returns an empty slice for a beat window with no onsets', () => {
    const sparse: Tok[] = [{ token: 'C4', start: 0, end: 100 }];
    // beat 3 (1500–2000ms) has nothing
    expect(sliceBeat(sparse, 3, beatMs)).toEqual([]);
  });

  it('returns tokens unchanged when the beat length is not positive', () => {
    expect(sliceBeat(tokens, 1, 0)).toEqual(tokens);
  });

  // Regression (arabic @mm:70): the engine emits onsets on a grid slightly below
  // the theoretical beat (note k at k*857.0 ms vs beat at k*857.143 ms). A
  // half-open window `[k*beat, (k+1)*beat)` floored and swept the NEXT note into
  // the current beat — beat 0 held TWO notes ("2 steps play at once") and the
  // offset accumulated. Nearest-beat assignment puts each onset in exactly one beat.
  it('assigns each onset to its nearest beat under sub-ms grid drift', () => {
    const beat = 60000 / 70; // 857.142857…
    const drifted: Tok[] = Array.from({ length: 6 }, (_, k) => ({
      token: `n${k}`,
      start: k * 857.0, // engine grid, ~0.14ms/beat below the theoretical beat
      end: (k + 1) * 857.0
    }));
    // Beat 0 holds ONLY the first note (not n0 + n1).
    expect(sliceBeat(drifted, 0, beat).map((t) => t.token)).toEqual(['n0']);
    // Each subsequent beat holds exactly its own note.
    expect(sliceBeat(drifted, 1, beat).map((t) => t.token)).toEqual(['n1']);
    expect(sliceBeat(drifted, 5, beat).map((t) => t.token)).toEqual(['n5']);
  });
});
