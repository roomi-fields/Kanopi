import { describe, it, expect } from 'vitest';
import { openBlocks } from './blocks.svelte';
import { workspace } from './workspace.svelte';

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
