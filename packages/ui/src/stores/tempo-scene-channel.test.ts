import { describe, it, expect, beforeEach } from 'vitest';
import { clock } from './clock.svelte';
import { kronosCursor } from './kronos-cursor.svelte';
import { __getUserTempo, __getCurrentBpm } from '../lib/runtimes/bpx-adapter';

// F06 + F07 — the SCENE tempo channel must be kept SEPARATE from the user-input channel.
//
// Before the fix, a derivation's projected tempo was fanned to `clock.setBpm`, which
// (a) clamped it to [20,300] (F07) and (b) re-entered the adapter's `setBpm`, where a
// fragile re-entrancy guard — defeated by the sink's microtask — let the scene tempo be
// recorded as `userTempo`, leaking into the NEXT no-`@mm` scene's compile default (F06).
//
// The fix routes the scene tempo through `clock.setSceneTempo`: no clamp, no `#tempo`
// write, and it NEVER records `userTempo`. `userTempo` is set ONLY by `clock.setBpm`
// (genuine user type/tap) via `setUserTempo`. These tests trace the values to those
// channels (non-circular): they assert the module state each channel actually leaves.
//
// vitest isolates module state per FILE (not per `it`), so the cases run in order on
// shared state — the SCENE-only cases come first (userTempo must still be null), the
// user-input case last (it is the only writer of `userTempo`).

beforeEach(() => {
  kronosCursor.set(null); // no live scene → readout falls back to the host-side value
});

describe('F06 — the scene tempo channel never seeds userTempo (no inter-scene leak)', () => {
  it('playing a @mm:70 scene projects 70 but leaves userTempo null (no leak to the next scene)', () => {
    // A scene declaring @mm:70 derives at 70 and projects it through the SCENE channel.
    clock.setSceneTempo(70);
    // The projected scene tempo drives the STEP grid (currentBpm)…
    expect(__getCurrentBpm()).toBe(70);
    // …but it is NOT user input, so userTempo stays null: the NEXT no-`@mm` scene's
    // compile default (`userTempo != null ? { tempo: userTempo } : undefined`) does NOT
    // inherit 70 — it passes `undefined`, so BPx applies ITS OWN default (60). This is
    // the exact F06 leak the old re-entrancy guard failed to prevent.
    expect(__getUserTempo()).toBeNull();
  });
});

describe('F07 — the scene tempo is not clamped to [20,300]', () => {
  it('a scene tempo above the range (400) reaches currentBpm unclamped', () => {
    clock.setSceneTempo(400);
    expect(__getCurrentBpm()).toBe(400); // NOT clamped to 300
    expect(__getUserTempo()).toBeNull(); // still never user input
  });

  it('a scene tempo below the range (16) reaches currentBpm unclamped', () => {
    clock.setSceneTempo(16);
    expect(__getCurrentBpm()).toBe(16); // NOT clamped to 20
    expect(__getUserTempo()).toBeNull();
  });
});

describe('the scene tempo drives the STEP grid and shows the LIVE handle tempo', () => {
  it('currentBpm follows the projected scene tempo, and the readout shows kronosCursor.tempo', () => {
    clock.setSceneTempo(96);
    expect(__getCurrentBpm()).toBe(96); // STEP grid adopts the scene tempo
    // The readout does NOT come from a host `#tempo` (the scene channel never writes it):
    // while a scene plays, the display IS the live Kronos handle's tempo (the authority).
    const fakeHandle = {
      transport: {
        state: 'running' as const,
        tempo: 142,
        onStateChange: (_cb: (s: string) => void) => () => {}
      },
      position: () => 0,
      beatPosition: () => ({ bar: 1, beat: 0, phase: 0, beatsTotal: 0 }),
      cutCodeVoices: () => {},
      refireCodeVoices: () => {}
    } as unknown as Parameters<typeof kronosCursor.set>[0];
    kronosCursor.set(fakeHandle);
    expect(clock.state.bpm).toBe(142);
    kronosCursor.set(null);
  });
});

describe('non-regression — USER input still clamps, persists and seeds userTempo', () => {
  it('clock.setBpm(350) clamps to 300, shows 300, and records userTempo=300', () => {
    clock.setBpm(350);
    // Clamp still applies to USER input (the [20,300] guard is input-only).
    expect(clock.state.bpm).toBe(300); // #tempo written + readout (no live handle)
    // User input IS recorded as the pre-derive seed — the clamped value, so display
    // and seed agree. This is the only legitimate host-owned tempo.
    expect(__getUserTempo()).toBe(300);
    // The clamped value also fanned out to the runtimes (live retune → currentBpm).
    expect(__getCurrentBpm()).toBe(300);
  });
});
