import { describe, it, expect, vi, beforeEach } from 'vitest';

// The transport state machine: one `mode` + one `lastBeat` counter. These tests
// pin the transition table so the play/pause/stop/step sequencing can't silently
// regress (the whole point of replacing the ad-hoc position juggling).

const h = vi.hoisted(() => {
  const clockState = {
    bpm: 70,
    bar: 1,
    beat: 0,
    beatsPerBar: 4,
    phase: 0,
    playing: false,
    paused: false
  };
  return {
    clockState,
    clock: {
      state: clockState,
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      enterStep: vi.fn()
    },
    silenceRuntimes: vi.fn(async () => {}),
    evaluateBlock: vi.fn(async () => {}),
    setResumeBeat: vi.fn(),
    // 19-beat production (arabic @70bpm): durationSec / beatDurSec ≈ 19.
    production: { current: { durationSec: (60 / 70) * 19, beatDurSec: 60 / 70 } },
    // Selected audio engine + the active Kronos cursor handle. Default = kronos
    // with NO active handle (falls back to core.clock); tests flip these to drive
    // the kronos path.
    engine: { value: 'kronos' as 'kronos' | 'legacy' },
    kronosCursor: { active: null as { beatPosition: () => { beatsTotal: number } } | null }
  };
});

vi.mock('../lib/core', () => ({
  core: {
    clock: h.clock,
    silenceRuntimes: h.silenceRuntimes,
    evaluateBlock: h.evaluateBlock
  }
}));
vi.mock('../lib/runtimes/bpx-adapter', () => ({ setResumeBeat: h.setResumeBeat }));
vi.mock('../lib/runtimes/kronos-audio', () => ({ audioEngine: () => h.engine.value }));
vi.mock('./kronos-cursor.svelte', () => ({ kronosCursor: h.kronosCursor }));
vi.mock('./production.svelte', () => ({
  production: h.production,
  beatCount: (durationSec: number, beatDurSec: number) =>
    beatDurSec > 0 ? Math.round(durationSec / beatDurSec) : 0
}));

import { playback } from './playback.svelte';

const FILE = { runtime: 'bpscript' as const, name: 'arabic.bps', contents: 'S -> a' };

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(h.clockState, { bar: 1, beat: 0, phase: 0, playing: false, paused: false });
  // Default: kronos engine, no active cursor handle → liveBeat falls back to core.clock.
  h.engine.value = 'kronos';
  h.kronosCursor.active = null;
  playback.mode = 'stopped';
  playback.lastBeat = -1;
});

describe('transport state machine', () => {
  it('STEP from stopped plays beat 0, then advances', async () => {
    await playback.step(FILE);
    expect(playback.mode).toBe('stepped');
    expect(playback.lastBeat).toBe(0);
    expect(h.clock.enterStep).toHaveBeenCalled();
    expect(h.silenceRuntimes).toHaveBeenCalled();
    expect(h.evaluateBlock).toHaveBeenLastCalledWith(
      'bpscript',
      'S -> a',
      'arabic.bps',
      0,
      undefined,
      undefined,
      { index: 0, count: 19 }
    );

    await playback.step(FILE);
    expect(playback.lastBeat).toBe(1);
  });

  it('STEP → Play resumes from the NEXT beat (never backward)', async () => {
    await playback.step(FILE); // lastBeat 0
    await playback.step(FILE); // lastBeat 1
    playback.play();
    expect(h.setResumeBeat).toHaveBeenCalledWith(2); // lastBeat+1, forward
    expect(h.clock.play).toHaveBeenCalled();
    expect(playback.mode).toBe('playing');
  });

  it('Play from stopped starts at the top (beat 0)', () => {
    playback.play();
    expect(h.setResumeBeat).toHaveBeenCalledWith(0);
    expect(playback.mode).toBe('playing');
  });

  it('Pause freezes on the live beat; Step then plays B+1', async () => {
    playback.mode = 'playing';
    Object.assign(h.clockState, { playing: true, bar: 2, beat: 1 }); // live beat = 4+1 = 5
    playback.pause();
    expect(playback.mode).toBe('paused');
    expect(playback.lastBeat).toBe(5);
    expect(h.clock.pause).toHaveBeenCalled();

    Object.assign(h.clockState, { playing: false });
    await playback.step(FILE);
    expect(playback.lastBeat).toBe(6); // B+1
    expect(playback.mode).toBe('stepped');
  });

  it('Play from paused resumes in place (no resume offset)', () => {
    playback.mode = 'paused';
    playback.lastBeat = 5;
    playback.play();
    expect(h.setResumeBeat).not.toHaveBeenCalled(); // resume the suspended audio, not re-seek
    expect(h.clock.play).toHaveBeenCalled();
    expect(playback.mode).toBe('playing');
  });

  it('Stop works from EVERY mode (incl. stepped): hush + reset to start', () => {
    playback.mode = 'stepped';
    playback.lastBeat = 7;
    playback.stop();
    expect(h.clock.stop).toHaveBeenCalled();
    expect(h.silenceRuntimes).toHaveBeenCalled();
    expect(playback.lastBeat).toBe(-1);
    expect(playback.mode).toBe('stopped');
  });

  it('activeBeat reflects the mode (live / committed / none)', () => {
    playback.mode = 'stopped';
    expect(playback.activeBeat()).toBe(-1);
    playback.mode = 'stepped';
    playback.lastBeat = 3;
    expect(playback.activeBeat()).toBe(3);
    playback.mode = 'playing';
    Object.assign(h.clockState, { bar: 1, beat: 2 });
    expect(playback.activeBeat()).toBe(2);
  });
});

describe('liveBeat position source (kronos vs legacy)', () => {
  it('reads the Kronos playhead when the kronos engine is active with a handle', () => {
    h.engine.value = 'kronos';
    // The kronos cursor is at beat 7 (beatsTotal already loop-folded into 0..n-1).
    h.kronosCursor.active = { beatPosition: () => ({ beatsTotal: 7.6 }) };
    // The legacy clock disagrees on purpose (rAF-driven, NOT the heard audio).
    Object.assign(h.clockState, { bar: 3, beat: 1 }); // legacy would read 9
    expect(playback.liveBeat()).toBe(7); // floor(7.6) — the Kronos beat, not 9

    // Pause must freeze on the HEARD (Kronos) beat, not the legacy one.
    playback.mode = 'playing';
    playback.pause();
    expect(playback.lastBeat).toBe(7);
  });

  it('falls back to the central clock when no Kronos handle is active', () => {
    h.engine.value = 'kronos';
    h.kronosCursor.active = null; // kronos engine but no scene playing through it
    Object.assign(h.clockState, { bar: 2, beat: 1 }); // 4 + 1 = 5
    expect(playback.liveBeat()).toBe(5);
  });

  it('uses the central clock in legacy engine mode even with a stale handle', () => {
    h.engine.value = 'legacy';
    h.kronosCursor.active = { beatPosition: () => ({ beatsTotal: 7 }) };
    Object.assign(h.clockState, { bar: 1, beat: 3 }); // legacy reads 3
    expect(playback.liveBeat()).toBe(3); // legacy path untouched
  });
});
