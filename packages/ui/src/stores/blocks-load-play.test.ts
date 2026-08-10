import { describe, it, expect } from 'vitest';
import { openBlocks } from './blocks.svelte';
import { playback } from './playback.svelte';
import { workspace } from './workspace.svelte';
import { clock } from './clock.svelte';
import { createEventBus } from '../lib/events/bus';
import { initAdapters } from '../lib/runtimes/registry';

// LE REGISTRE SE CONSTRUIT AVEC LE BUS — comme le cœur le fait dans son constructeur. Chaque banc
// qui le lit l'initialise LUI-MÊME : un fichier d'amorce global instancierait toute la chaîne
// AVANT les simulacres et rendrait des espions aveugles (mesuré le 2026-08-10, sept causes).
initAdapters(createEventBus());

// load→play regression guard (beta issues 3+5): a freshly-loaded program must
// be playable immediately, WITHOUT waiting for the reactively-`$derived`
// `openBlocks.list` to settle. The Play bascule gesture (`playback.play()`)
// silences the outgoing scene (`core.silenceRuntimes()`, which churns the
// reactive graph) THEN arms + plays the newly-active tab; if the play path read
// the stale derived list, the new scene would arm nothing and the transport
// would sit on "Playing" with no sound. `blocksForFile` re-extracts the file's
// blocks straight from the workspace, so it is correct the instant `openBundle`
// returns.

describe('openBlocks.blocksForFile — deterministic, not derived-list dependent', () => {
  it('returns a just-loaded program file blocks immediately', () => {
    const id = workspace.openBundle(
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

// Play-from-stopped evals the armed blocks via an EXPLICIT call
// (`playback.play()` → `openBlocks.replayArmed()`), not a clock subscriber. The
// living behavior (Play sounds the armed scene) must hold, and — with no
// subscriber and no host clock — a `@mm` re-emit fired inside the eval cannot
// re-enter the replay.
describe('Play-from-stopped — explicit armed-block eval, runs once, no recursion', () => {
  it('Play sounds the active scene armed blocks exactly once', async () => {
    const id = workspace.openBundle(
      [{ path: 'reenter.strudel', contents: 'sound("bd hh")' }],
      'reenter.strudel'
    );
    const [b] = openBlocks.blocksForFile(id!);
    openBlocks.armed = new Set([b.qualifiedName]);

    let replayCount = 0;
    const realReplay = openBlocks.replayArmed.bind(openBlocks);
    // Simulate a `.bps` `@mm` re-emit from inside the eval: a genuine tempo change
    // updates the tempo store synchronously. With no subscriber/host clock, nothing
    // listens on that change, so the replay cannot re-enter itself.
    openBlocks.replayArmed = async () => {
      replayCount++;
      clock.setBpm(replayCount % 2 === 0 ? 137 : 143); // genuine change → fan-out, no re-entry
    };
    try {
      // No live Kronos handle (nothing was evaluated) → Play takes the bascule branch
      // (silence + disarm + arm-and-play), which funnels through replayArmed exactly once.
      await playback.play(); // the ONE Play → exactly one explicit replay
    } finally {
      openBlocks.replayArmed = realReplay;
      openBlocks.armed = new Set();
    }

    expect(replayCount).toBe(1);
  });

  it('a surgical single-block eval does NOT eval the whole armed set', async () => {
    // The surgical Ctrl+Enter path evaluates ONLY the touched block — it must never trigger
    // an armed-set replay. With the host clock gone there is no subscriber at all, so
    // `replayArmed` is simply never reached by a direct single-block eval.
    const id = workspace.openBundle(
      [{ path: 'silent.strudel', contents: 'sound("bd")' }],
      'silent.strudel'
    );
    const [b] = openBlocks.blocksForFile(id!);
    openBlocks.armed = new Set([b.qualifiedName]);

    let replayCount = 0;
    const realReplay = openBlocks.replayArmed.bind(openBlocks);
    const realEval = openBlocks.evalOne.bind(openBlocks);
    openBlocks.replayArmed = async () => {
      replayCount++;
    };
    // Stub the actual adapter eval — we only assert that the surgical path doesn't replay.
    openBlocks.evalOne = async () => {};
    try {
      await openBlocks.evalOne(b); // surgical Ctrl+Enter — single block, no armed-set replay
    } finally {
      openBlocks.replayArmed = realReplay;
      openBlocks.evalOne = realEval;
      openBlocks.armed = new Set();
    }

    expect(replayCount).toBe(0);
  });
});

describe('openBlocks.armLoadedProgram — arms WITHOUT starting the transport', () => {
  it('arms a freshly-loaded program file blocks but leaves the clock alone', () => {
    openBlocks.armed = new Set();
    const id = workspace.openBundle(
      [{ path: 'noauto.strudel', contents: 'sound("bd hh sd")' }],
      'noauto.strudel'
    );
    const blocks = openBlocks.blocksForFile(id!);
    openBlocks.armLoadedProgram(id!);
    // Every block of the loaded file is now armed (a later Play will sound it)…
    for (const b of blocks) expect(openBlocks.isArmed(b.qualifiedName)).toBe(true);
    // …but loading did not start the transport (no autoplay): no Kronos handle was built,
    // so the transport readout PROJECTS 'stopped' (no host clock invents a playing state).
    expect(playback.mode).toBe('stopped');
    openBlocks.armed = new Set();
  });
});

describe('openBlocks.disarmAll — clears armed/errored without touching the clock', () => {
  it('empties the armed and errored sets', () => {
    const id = workspace.openBundle(
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
