import { describe, it, expect } from 'vitest';
import { clock } from './clock.svelte';
import { kronosCursor } from './kronos-cursor.svelte';

// KAN-C20 (display side) — a fresh session with no live scene and no user input shows
// NO tempo (`state.bpm === null`), so the UI renders « — » instead of a host-invented
// « 128 ». This file is isolated (vitest per-file module state), so `clock` is fresh here.

describe('clock readout — no host-invented tempo default', () => {
  it('state.bpm is null on a fresh session with nothing live and no user input', () => {
    kronosCursor.set(null);
    expect(clock.state.bpm).toBeNull();
  });

  it('once the user types a tempo, the readout shows that LOCAL value (D10 input)', () => {
    kronosCursor.set(null);
    clock.setBpm(96);
    expect(clock.state.bpm).toBe(96);
  });
});
