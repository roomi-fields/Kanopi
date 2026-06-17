import { workspace } from './workspace.svelte';
import { extractBlocks, qualifyBlock } from '../lib/blocks/extract-blocks';
import type { CodeBlock } from '../lib/blocks/extract-blocks';
import type { Runtime } from '../lib/core';
import { core } from '../lib/core';
import { getAdapter } from '../lib/runtimes/registry';
import { onSlotErrorChange, getSlotErrors } from '../lib/runtimes/strudel';
import { clock } from './clock.svelte';

/**
 * A block-scoped actor surfaced in the panel:
 * - `fileId` → the VirtualFile this block lives in (for eval + re-render).
 * - `fileName` → basename, used as the dot-notation prefix (`melody.drums`).
 * - `block` → detection result (name, kind, offsets).
 *
 * Multiple files can expose blocks with the same short name (`drums` in
 * both `melody.strudel` and `alt.strudel`); the fully-qualified name
 * `file.block` disambiguates.
 */
export interface OpenBlock {
  fileId: string;
  fileName: string;
  runtime: Runtime;
  block: CodeBlock;
  qualifiedName: string; // `melody.drums`, `drums.$0`, `beat.#1`
}

class OpenBlocksStore {
  /** Blocks across all open tabs. Recomputed whenever any open file's content changes. */
  list = $derived<OpenBlock[]>(computeOpenBlocks());

  /**
   * Armed blocks (by qualifiedName). An armed block is re-evaluated on transport
   * play and stopped on transport stop. Parallels the declared-@actor armed model.
   */
  armed = $state<Set<string>>(new Set());

  /**
   * Blocks that errored during their last evaluation (by qualifiedName).
   * Driven by the Strudel adapter's per-slot error map so the panel can paint
   * the LED red. Populated on error, cleared on successful re-eval or stop.
   */
  errored = $state<Set<string>>(new Set());

  isArmed(q: string): boolean {
    return this.armed.has(q);
  }

  isErrored(q: string): boolean {
    return this.errored.has(q);
  }

  /** Refresh the errored set from the adapter. Called on every slot-error change. */
  _refreshErrored() {
    const next = new Set<string>();
    for (const id of getSlotErrors().keys()) next.add(id);
    this.errored = next;
  }

  /** Arm + play this block. If the transport was stopped, start it: the block
   * replay listener (installBlockReplay) then re-evals every armed block on the
   * play edge, so arming a block makes it sound (beta issue 5 — arm = play, no
   * disarm/rearm dance). */
  async arm(q: string) {
    const b = this.list.find((x) => x.qualifiedName === q);
    if (!b) return;
    // Svelte 5 reactivity wants a new Set, not mutation.
    const next = new Set(this.armed);
    next.add(q);
    this.armed = next;
    if (!clock.state.playing) {
      clock.play();
      return;
    }
    await this.evalOne(b);
  }

  /** Disarm + stop this block's slot (keeps other armed blocks playing). */
  async disarm(q: string) {
    const b = this.list.find((x) => x.qualifiedName === q);
    const next = new Set(this.armed);
    next.delete(q);
    this.armed = next;
    if (!b) return;
    const adapter = getAdapter(b.runtime);
    if (!adapter) return;
    try {
      await adapter.stop(
        { actorId: q, fileId: b.fileName },
        (e: Parameters<typeof core.console.push>[0]) => core.console.push(e)
      );
    } catch {
      /* best-effort stop */
    }
  }

  async toggle(q: string) {
    if (this.armed.has(q)) await this.disarm(q);
    else await this.arm(q);
  }

  /**
   * Disarm EVERY block without stopping the transport. Used by the "swap scene"
   * gesture: the outgoing scene's blocks leave the armed set (so the play-edge
   * replay won't re-eval them) while the clock keeps running for the incoming
   * scene. The actual audio is cut by `core.silenceRuntimes()` at the call site;
   * this only clears the armed bookkeeping. Errored flags are cleared too.
   */
  disarmAll() {
    this.armed = new Set();
    this.errored = new Set();
  }

  /** Evaluate this exact block via core.evaluateBlock with its qualifiedName as actorId. */
  async evalOne(b: OpenBlock) {
    const file = workspace.fileById(b.fileId);
    if (!file) return;
    const code = file.contents.slice(b.block.from, b.block.to);
    if (!code.trim()) return;
    await core.evaluateBlock(b.runtime, code, b.fileName, b.block.from, b.qualifiedName);
  }

  /**
   * Blocks of ONE file, extracted straight from the workspace file — NOT read
   * off the reactively-`$derived` `this.list`. A freshly-loaded program (after
   * `loadFiles` + a `hushAll` that churned the reactive graph) may not yet be
   * reflected in `this.list` when `playLoadedProgram` runs, so the play path
   * must compute the blocks deterministically here instead of trusting the
   * derived snapshot. Mirrors `computeOpenBlocks`'s per-file logic.
   */
  blocksForFile(fileId: string): OpenBlock[] {
    const file = workspace.fileById(fileId);
    if (!file || file.runtime === 'kanopi') return [];
    const out: OpenBlock[] = [];
    const seenNames = new Set<string>();
    for (const b of extractBlocks(file.contents, file.runtime)) {
      if (seenNames.has(b.name)) continue;
      seenNames.add(b.name);
      out.push({
        fileId: file.id,
        fileName: file.name,
        runtime: file.runtime,
        block: b,
        qualifiedName: qualifyBlock(file.name, b)
      });
    }
    return out;
  }

  /**
   * Arm every block of a freshly-loaded program AND make it sound, mirroring
   * `handleSceneActivate`'s "arm + start transport + eval" — a loaded demo plays
   * on load without the disarm/rearm dance (beta issues 3+5). Starting the clock
   * first lets the per-block eval fire (the clock-transport replay also covers
   * blocks armed before play). Only arms blocks belonging to `fileId`, so loading
   * a single program doesn't sound the other open tabs' blocks.
   */
  async armAndPlayFile(fileId: string) {
    const fileBlocks = this.blocksForFile(fileId);
    if (fileBlocks.length === 0) return;
    const next = new Set(this.armed);
    for (const b of fileBlocks) next.add(b.qualifiedName);
    this.armed = next;
    if (!clock.state.playing) {
      // play() → handleTransport(true) re-evals declared @actors; the block
      // replay listener (installBlockReplay) re-evals armed blocks. Both fire.
      clock.play();
      return;
    }
    for (const b of fileBlocks) {
      try {
        await this.evalOne(b);
      } catch {
        /* per-block failures logged by adapter */
      }
    }
  }

  /**
   * Play whatever was just loaded — the coherent "load = it sounds" gesture
   * (beta issues 3+5). A program file (`.bps`, `.gr`, a single sketch) arms its
   * own blocks and starts the transport; a `.kanopi` session (no blocks of its
   * own — its actors come from `loadSession`, already armed) just starts the
   * transport so `handleTransport` re-evals the armed actors. Run after a
   * microtask by the caller so the reactively-derived block list has settled.
   */
  async playLoadedProgram(fileId: string) {
    const hasBlocks = this.blocksForFile(fileId).length > 0;
    if (hasBlocks) {
      await this.armAndPlayFile(fileId);
    } else if (!clock.state.playing) {
      clock.play();
    }
  }

  /** Called by the clock transport listener — re-eval every armed block on play.
   * Resolves the armed blocks by re-extracting from each open file rather than
   * filtering the reactively-`$derived` `this.list`: on the play edge fired by a
   * just-loaded program, the derived snapshot can lag a tick behind the armed set
   * (the load→play regression), so a freshly-armed block would be missed. */
  async replayArmed() {
    const seen = new Set<string>();
    const armedList: OpenBlock[] = [];
    for (const tabId of workspace.openTabIds) {
      if (seen.has(tabId)) continue;
      seen.add(tabId);
      for (const b of this.blocksForFile(tabId)) {
        if (this.armed.has(b.qualifiedName)) armedList.push(b);
      }
    }
    for (const b of armedList) {
      try {
        await this.evalOne(b);
      } catch {
        /* per-block failures logged by adapter */
      }
    }
  }
}

function computeOpenBlocks(): OpenBlock[] {
  const out: OpenBlock[] = [];
  // Dedupe tab ids defensively. `workspace.openFile` dedupes on insert, but
  // `restoreWorkspace` writes the persisted array directly — and a stale
  // persist from before the dedupe landed could surface duplicates that
  // would crash the keyed {#each} in ActorsPanel.
  const seenTabs = new Set<string>();
  // Keys `fileId:blockName` already emitted. Guards against extractor bugs
  // emitting two blocks with the same name for one file.
  const seenKeys = new Set<string>();
  for (const tabId of workspace.openTabIds) {
    if (seenTabs.has(tabId)) continue;
    seenTabs.add(tabId);
    const file = workspace.fileById(tabId);
    if (!file) continue;
    // Skip session files — they're composed of directives, not runnable blocks.
    if (file.runtime === 'kanopi') continue;
    const blocks = extractBlocks(file.contents, file.runtime);
    for (const b of blocks) {
      const key = `${file.id}:${b.name}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      out.push({
        fileId: file.id,
        fileName: file.name,
        runtime: file.runtime,
        block: b,
        qualifiedName: qualifyBlock(file.name, b)
      });
    }
  }
  return out;
}

export const openBlocks = new OpenBlocksStore();

/**
 * Install a clock-transport listener that re-evaluates every armed block on
 * play. Transport stop is handled by `real-core.handleTransport(false)` which
 * already hushes every runtime — per-block stop isn't needed there.
 */
export function installBlockReplay() {
  let wasPlaying = clock.state.playing;
  core.clock.subscribe((s) => {
    // Skip the replay on a surgical manual eval (clock.startSilently): the
    // evaluated block is already sounding, the rest of the armed set must not
    // be re-triggered. A real Play (clock.play) still replays everything armed.
    if (s.playing && !wasPlaying && !core.clock.silentStart) {
      void openBlocks.replayArmed();
    }
    wasPlaying = s.playing;
  });
  // Mirror Strudel slot errors into the panel's reactive errored set.
  onSlotErrorChange(() => openBlocks._refreshErrored());
}

// Re-export for consumers that want to call extractBlocks directly.
export { extractBlocks };
export type { CodeBlock };
