import { describe, it, expect, beforeAll } from 'vitest';
import { openBlocks, installBlockReplay } from './blocks.svelte';
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

// Re-entrance is broken AT THE ROOT (no more `_replaying` guard): a `.bps` block
// with `@mm` re-applies its tempo to the central clock INSIDE its eval
// (clock.setBpm → re-emit), but that re-emit never changes `playing`, so the
// installBlockReplay subscriber — which flips its play-edge flag (`wasPlaying`)
// BEFORE replaying — sees no fresh play edge and does NOT replay again. The
// guarantee is now proven on the REAL subscriber, not a removed flag.
describe('installBlockReplay — a tempo re-emit during the play-edge replay does not recurse', () => {
  // Install the real clock subscriber ONCE (production wires it once in main.ts).
  // Stacking it per-test would double-count the play edge.
  beforeAll(() => installBlockReplay());

  it('@mm-style clock.setBpm fired inside the replay triggers no second replay', async () => {
    const id = workspace.loadFiles(
      [{ path: 'reenter.strudel', contents: 'sound("bd hh")' }],
      'reenter.strudel'
    );
    const [b] = openBlocks.blocksForFile(id!);
    openBlocks.armed = new Set([b.qualifiedName]);

    let replayCount = 0;
    const realReplay = openBlocks.replayArmed.bind(openBlocks);
    // Simulate the `@mm` re-emit from inside the replay: a genuine tempo change
    // re-emits the clock state synchronously, exactly as a `.bps` `@mm` eval would.
    // If the play-edge guard failed, this re-emit would re-enter installBlockReplay
    // and replay again (the old stack-overflow the `_replaying` flag papered over).
    openBlocks.replayArmed = async () => {
      replayCount++;
      core.clock.setBpm(replayCount % 2 === 0 ? 137 : 143); // genuine change → re-emit
    };
    try {
      core.clock.stop(); // clean stopped→playing edge
      core.clock.play(); // the ONE play edge → exactly one replay
      await Promise.resolve();
    } finally {
      openBlocks.replayArmed = realReplay;
      openBlocks.armed = new Set();
      core.clock.stop();
    }

    // The play edge replayed exactly once; the tempo re-emit raised no second edge.
    expect(replayCount).toBe(1);
  });

  it('a surgical startSilently does NOT replay the armed set', async () => {
    const id = workspace.loadFiles(
      [{ path: 'silent.strudel', contents: 'sound("bd")' }],
      'silent.strudel'
    );
    const [b] = openBlocks.blocksForFile(id!);
    openBlocks.armed = new Set([b.qualifiedName]);

    let replayCount = 0;
    const realReplay = openBlocks.replayArmed.bind(openBlocks);
    openBlocks.replayArmed = async () => {
      replayCount++;
    };
    try {
      core.clock.stop();
      core.clock.startSilently(); // surgical Ctrl+Enter — must NOT replay
      await Promise.resolve();
    } finally {
      openBlocks.replayArmed = realReplay;
      openBlocks.armed = new Set();
      core.clock.stop();
    }

    expect(replayCount).toBe(0);
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
