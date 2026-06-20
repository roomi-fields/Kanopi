import { describe, it, expect } from 'vitest';
import { openBlocks } from './blocks.svelte';
import { workspace } from './workspace.svelte';
import { core } from '../lib/core';

// load→play regression guard (beta issues 3+5): a freshly-loaded program must
// be playable immediately, WITHOUT waiting for the reactively-`$derived`
// `openBlocks.list` to settle. The library `load` gesture stops the previous
// scene (`hushAll`, which churns the reactive graph) THEN loads + plays the new
// one; if the play path read the stale derived list, the new scene would arm
// nothing and the transport would sit on "Playing" with no sound. `blocksForFile`
// re-extracts the file's blocks straight from the workspace, so it is correct
// the instant `loadFiles` returns.

describe('openBlocks.blocksForFile — deterministic, not derived-list dependent', () => {
  it('returns a just-loaded program file blocks immediately', () => {
    const id = workspace.loadFiles(
      [{ path: 'beat.strudel', contents: 'sound("bd hh sd hh")' }],
      'beat.strudel'
    );
    expect(id).not.toBeNull();
    const blocks = openBlocks.blocksForFile(id!);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.every((b) => b.fileId === id)).toBe(true);
    expect(blocks.every((b) => b.runtime === 'strudel')).toBe(true);
  });

  it('ignores .kanopi session files (no runnable blocks of their own)', () => {
    const id = workspace.loadFiles(
      [{ path: 'scene.kanopi', contents: '@actor lead: melody.strudel' }],
      'scene.kanopi'
    );
    expect(id).not.toBeNull();
    expect(openBlocks.blocksForFile(id!)).toEqual([]);
  });

  it('returns [] for an unknown file id', () => {
    expect(openBlocks.blocksForFile('does-not-exist')).toEqual([]);
  });
});

// Re-entrance guard regression: a `.bps` block with `@mm` re-applies its tempo
// to the central clock INSIDE its eval (clock.setBpm → re-emit), which a
// clock-state subscriber turns back into a replay request. Before the guard,
// that re-entered `replayArmed` mid-flight and recursed → stack overflow. The
// guard short-circuits a nested replay while one is already running, then clears
// the flag so a later legitimate replay still runs.
describe('openBlocks.replayArmed — re-entrance guard', () => {
  it('a replay triggered DURING replayArmed (e.g. tempo re-emit) does not recurse', async () => {
    const id = workspace.loadFiles(
      [{ path: 'reenter.strudel', contents: 'sound("bd hh")' }],
      'reenter.strudel'
    );
    const [b] = openBlocks.blocksForFile(id!);
    openBlocks.armed = new Set([b.qualifiedName]);

    let evalCalls = 0;
    const realEvalOne = openBlocks.evalOne.bind(openBlocks);
    // Simulate the `@mm` re-emit: each eval synchronously re-enters replayArmed,
    // exactly as a tempo change during playback would. The guard must absorb it.
    openBlocks.evalOne = async () => {
      evalCalls++;
      await openBlocks.replayArmed(); // re-entrant call — must be a no-op here
    };
    try {
      await openBlocks.replayArmed();
    } finally {
      openBlocks.evalOne = realEvalOne;
      openBlocks.armed = new Set();
    }

    // The armed block evaluated exactly once; the nested replay was short-circuited
    // (no stack overflow, no repeated eval).
    expect(evalCalls).toBe(1);
    // Flag is cleared so a subsequent legitimate replay can run again.
    expect((openBlocks as unknown as { _replaying: boolean })._replaying).toBe(false);
  });

  it('a legitimate replay AFTER a prior one completes still runs', async () => {
    const id = workspace.loadFiles(
      [{ path: 'again.strudel', contents: 'sound("bd")' }],
      'again.strudel'
    );
    const [b] = openBlocks.blocksForFile(id!);
    openBlocks.armed = new Set([b.qualifiedName]);

    let evalCalls = 0;
    const realEvalOne = openBlocks.evalOne.bind(openBlocks);
    openBlocks.evalOne = async () => {
      evalCalls++;
    };
    try {
      await openBlocks.replayArmed();
      await openBlocks.replayArmed();
    } finally {
      openBlocks.evalOne = realEvalOne;
      openBlocks.armed = new Set();
    }

    // Two separate, sequential replays each evaluated the armed block.
    expect(evalCalls).toBe(2);
  });
});

describe('openBlocks.armLoadedProgram — arms WITHOUT starting the transport', () => {
  it('arms a freshly-loaded program file blocks but leaves the clock alone', () => {
    openBlocks.armed = new Set();
    const id = workspace.loadFiles(
      [{ path: 'noauto.strudel', contents: 'sound("bd hh sd")' }],
      'noauto.strudel'
    );
    const blocks = openBlocks.blocksForFile(id!);
    openBlocks.armLoadedProgram(id!);
    // Every block of the loaded file is now armed (a later Play will sound it)…
    for (const b of blocks) expect(openBlocks.isArmed(b.qualifiedName)).toBe(true);
    // …but loading did not start the transport (no autoplay).
    expect(core.clock.state.playing).toBe(false);
    openBlocks.armed = new Set();
  });
});

describe('openBlocks.disarmAll — clears armed/errored without touching the clock', () => {
  it('empties the armed and errored sets', () => {
    const id = workspace.loadFiles(
      [{ path: 'beat.strudel', contents: 'sound("bd hh")' }],
      'beat.strudel'
    );
    const [b] = openBlocks.blocksForFile(id!);
    // Arm the bookkeeping directly (no audio): the swap gesture disarms these.
    openBlocks.armed = new Set([b.qualifiedName]);
    openBlocks.errored = new Set([b.qualifiedName]);
    openBlocks.disarmAll();
    expect(openBlocks.armed.size).toBe(0);
    expect(openBlocks.errored.size).toBe(0);
  });
});
