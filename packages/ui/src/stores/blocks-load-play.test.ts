import { describe, it, expect } from 'vitest';
import { openBlocks } from './blocks.svelte';
import { playback } from './playback.svelte';
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

  it('returns [] for an unknown file id', () => {
    expect(openBlocks.blocksForFile('does-not-exist')).toEqual([]);
  });
});

// Play-from-stopped now evals the armed blocks via an EXPLICIT call
// (`playback.play()` → `openBlocks.replayArmed()`), not a clock subscriber. The
// living behavior (Play sounds the armed scene) must hold, and — with no
// subscriber — a `@mm` re-emit fired inside the eval cannot re-enter the replay.
describe('Play-from-stopped — explicit armed-block eval, runs once, no recursion', () => {
  it('Play sounds the active scene armed blocks exactly once', async () => {
    const id = workspace.loadFiles(
      [{ path: 'reenter.strudel', contents: 'sound("bd hh")' }],
      'reenter.strudel'
    );
    const [b] = openBlocks.blocksForFile(id!);
    openBlocks.armed = new Set([b.qualifiedName]);

    let replayCount = 0;
    const realReplay = openBlocks.replayArmed.bind(openBlocks);
    // Simulate a `.bps` `@mm` re-emit from inside the eval: a genuine tempo change
    // re-emits the clock state synchronously. With the subscriber gone, nothing
    // listens on that emit, so the replay cannot re-enter itself.
    openBlocks.replayArmed = async () => {
      replayCount++;
      core.clock.setBpm(replayCount % 2 === 0 ? 137 : 143); // genuine change → re-emit
    };
    try {
      core.clock.stop(); // ensure stopped → Play takes the from-stopped branch
      playback.play(); // the ONE Play → exactly one explicit replay
      await Promise.resolve();
    } finally {
      openBlocks.replayArmed = realReplay;
      openBlocks.armed = new Set();
      core.clock.stop();
    }

    expect(replayCount).toBe(1);
  });

  it('a surgical startSilently does NOT eval the armed set', async () => {
    // The surgical Ctrl+Enter path starts the clock via `startSilently()` and
    // evaluates ONLY the touched block — it must never trigger an armed-set replay
    // (no subscriber listens on the clock, so `replayArmed` is simply never called).
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
      core.clock.startSilently(); // surgical Ctrl+Enter — no armed-set replay
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
