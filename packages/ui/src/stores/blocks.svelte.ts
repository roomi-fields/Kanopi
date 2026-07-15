import { workspace } from './workspace.svelte';
import { isNonProgramFile } from '../lib/workspace/types';
import { extractBlocks, qualifyBlock } from '../lib/blocks/extract-blocks';
import type { CodeBlock } from '../lib/blocks/extract-blocks';
import type { Runtime } from '../lib/core';
import { core } from '../lib/core';
import { getAdapter } from '../lib/runtimes/registry';
import { onSlotErrorChange, getSlotErrors } from 'runtime-codevoices';
import { playback } from './playback.svelte';
import { deriveStatus, type DeriveError } from './derive-status.svelte';
import { resourceStatus } from './resource-status.svelte';
import { resourceResolutionErrors } from '../lib/runtimes/bpx-adapter';

// The thrown-error shape carries a message; pull a line if BPx tagged one.
function toDeriveError(err: unknown): DeriveError {
  const message = err instanceof Error ? err.message : String(err);
  const line = (err as { line?: number })?.line;
  return typeof line === 'number' ? { message, line } : { message };
}

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

  /** Arm + play this block. If no scene is live (transport stopped), eval the active
   * scene's armed blocks explicitly — that eval derives + builds the Kronos handle, which
   * IS the transport starting (arm = play, no disarm/rearm dance — beta issue 5). There is
   * no host clock to flip; Kronos becomes the authority via the eval. */
  async arm(q: string) {
    const b = this.list.find((x) => x.qualifiedName === q);
    if (!b) return;
    // Svelte 5 reactivity wants a new Set, not mutation.
    const next = new Set(this.armed);
    next.add(q);
    this.armed = next;
    if (playback.mode === 'stopped') {
      await this.replayArmed();
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
    // A data file (`libraries/…` or `resources/…` JSON catalog) is never a
    // program — no blocks to derive/eval/arm (decision
    // 2026-07-13-invocation-librairies-factory-mine.md).
    if (!file || isNonProgramFile(file.path)) return [];
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
   * first lets the per-block eval fire. Only arms blocks belonging to `fileId`,
   * so loading a single program doesn't sound the other open tabs' blocks.
   */
  async armAndPlayFile(fileId: string) {
    const fileBlocks = this.blocksForFile(fileId);
    if (fileBlocks.length === 0) return;
    const next = new Set(this.armed);
    for (const b of fileBlocks) next.add(b.qualifiedName);
    this.armed = next;
    if (playback.mode === 'stopped') {
      // No scene live: the explicit replayArmed() evals the active scene's armed blocks; that
      // eval derives + builds the Kronos handle, which IS the transport starting. No host clock.
      await this.replayArmed();
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
   * Arm a freshly-loaded program's blocks WITHOUT starting the transport. Loading
   * a scene readies it (its blocks/actor light up) but does NOT auto-play — the
   * user presses Play (or Ctrl+Enter) to hear it. Play-from-stopped then evals the
   * armed blocks explicitly (`replayArmed`), so arming first means Play sounds the
   * scene with no manual rearm. A program with no blocks needs no arming.
   */
  armLoadedProgram(fileId: string) {
    const fileBlocks = this.blocksForFile(fileId);
    if (fileBlocks.length === 0) return;
    const next = new Set(this.armed);
    for (const b of fileBlocks) next.add(b.qualifiedName);
    this.armed = next;
  }

  /**
   * Open a program = PRODUCE it (Romain's play/produce split): arm its blocks AND
   * derive the symbolic ones so the structure view shows immediately and the
   * tempo (`@mm`) is adopted — WITHOUT starting the transport. Play then sounds
   * the produced scene. Only bp3/bpscript blocks are derived (a `produceOnly`
   * eval that publishes the production but creates no audio); code voices
   * (Strudel/Hydra) have no symbolic production, so arming alone readies them.
   */
  async produceLoadedProgram(fileId: string) {
    this.armLoadedProgram(fileId);
    const file = workspace.fileById(fileId);
    if (!file) return;
    // Record the DERIVATION outcome of this produce so the compile chip is fail-loud
    // (msg [598]): a symbolic scene that PARSES but throws at derive (e.g. an
    // unresolvable pitch) must not read green. First thrown block = the file fails.
    let deriveError: DeriveError | undefined;
    let derivedAny = false;
    for (const b of this.blocksForFile(fileId)) {
      if (b.runtime !== 'bp3' && b.runtime !== 'bpscript') continue;
      const code = file.contents.slice(b.block.from, b.block.to);
      if (!code.trim()) continue;
      derivedAny = true;
      try {
        await core.evaluateBlock(
          b.runtime,
          code,
          b.fileName,
          b.block.from,
          b.qualifiedName,
          undefined,
          // produceOnly (Model C): derive + show structure + BUILD the persistent Kronos
          // handle in STOPPED state — no sound, no audio-context wake, transport not playing.
          // The first Play replays this handle (0 re-derivation) instead of re-deriving.
          true
        );
      } catch (err) {
        /* per-block failures logged by the adapter; surface the FIRST to the chip */
        if (!deriveError) deriveError = toDeriveError(err);
      }
    }
    if (derivedAny) {
      deriveStatus.report(fileId, file.contents, !deriveError, deriveError);
      // Signal 2 (resource resolution, decision 2026-07-15-voyant-sante-niveau3.md):
      // ALWAYS report, ok or not — a scene just fixed must repaint green, not stay
      // stuck on a stale red from a previous produce.
      const resErrors = resourceResolutionErrors(file.contents);
      resourceStatus.report(fileId, file.contents, resErrors.length === 0, resErrors);
    }
  }

  /**
   * Play whatever was just loaded — the coherent "load = it sounds" gesture
   * (beta issues 3+5). A program file (`.bps`, `.gr`, a single sketch) arms its
   * own blocks and starts the transport; a program with no blocks of its own just
   * starts the transport. Run after a microtask by the caller so the
   * reactively-derived block list has settled.
   */
  async playLoadedProgram(fileId: string) {
    const hasBlocks = this.blocksForFile(fileId).length > 0;
    if (hasBlocks) {
      await this.armAndPlayFile(fileId);
    }
    // A program with NO blocks has nothing to derive → no Kronos handle, no transport to
    // start. The host invents no "playing" state for an empty program (the old `clock.play()`
    // here flipped a host flag with no audio — a fabricated transport state, now gone).
  }

  /** Re-eval every armed block of the active scene. Called EXPLICITLY at each
   * Play-from-stopped site (the transport stores / arm / load paths), never via a
   * clock subscriber. Resolves the armed blocks by re-extracting from each open
   * file rather than filtering the reactively-`$derived` `this.list`: right after a
   * just-loaded program, the derived snapshot can lag a tick behind the armed set
   * (the load→play regression), so a freshly-armed block would be missed. */
  async replayArmed() {
    // No clock subscriber drives this anymore, so it cannot recurse: a `.bps`
    // `@mm` re-applies its tempo inside an `evalOne` below (setTempoSink →
    // clock.setBpm → re-emit), but nothing listens on that emit to re-enter here.
    //
    // Replay ONLY the ACTIVE scene's armed blocks — NOT every open tab. Replaying
    // all open tabs made other tabs' armed scenes sound on Play (the « voix open
    // blocks en plus » / phantom voices, not cut by Pause because only the last
    // Kronos handle is transport-tracked). Contract `kanopi-architecture.md` §3 +
    // audit §2: what plays = the active compiled scene, never every open tab.
    const armedList: OpenBlock[] = [];
    const activeTab = workspace.activeTabId;
    if (activeTab) {
      for (const b of this.blocksForFile(activeTab)) {
        if (this.armed.has(b.qualifiedName)) armedList.push(b);
      }
    }
    // Same fail-loud recording as produce (msg [598]): a play-from-stopped that
    // throws at derive flags the chip for the active file too.
    let deriveError: DeriveError | undefined;
    let derivedAny = false;
    for (const b of armedList) {
      if (b.runtime === 'bp3' || b.runtime === 'bpscript') derivedAny = true;
      try {
        await this.evalOne(b);
      } catch (err) {
        /* per-block failures logged by adapter; surface the FIRST to the chip */
        if (!deriveError) deriveError = toDeriveError(err);
      }
    }
    const activeFile = activeTab ? workspace.fileById(activeTab) : undefined;
    if (derivedAny && activeFile) {
      deriveStatus.report(activeTab!, activeFile.contents, !deriveError, deriveError);
      const resErrors = resourceResolutionErrors(activeFile.contents);
      resourceStatus.report(activeTab!, activeFile.contents, resErrors.length === 0, resErrors);
    }
  }

  /**
   * Signal 3 of the compile chip (decision 2026-07-15-voyant-sante-niveau3.md):
   * currently-errored blocks of `fileId`, with their live message. Reads `errored`
   * ($state, refreshed by `_refreshErrored()` on every Strudel per-slot error change)
   * so a caller wrapping this in `$derived` re-renders CONTINUOUSLY as voices error or
   * recover — not frozen to the moment of the last eval, unlike signals 1/2.
   */
  runtimeErrorsForFile(fileId: string): { message: string }[] {
    const out: { message: string }[] = [];
    for (const b of this.blocksForFile(fileId)) {
      if (!this.errored.has(b.qualifiedName)) continue;
      const err = getSlotErrors().get(b.qualifiedName);
      out.push({ message: err?.message ?? `${b.qualifiedName}: erreur d'exécution` });
    }
    return out;
  }
}

// Per-file memo of `extractBlocks` (regex split + a Lezer parse for Csound).
// `computeOpenBlocks` re-runs whenever ANY open file's contents change; without
// this, every keystroke in one tab re-extracts ALL open tabs. Keyed by file id;
// recompute only when THAT file's contents/runtime actually changed.
const extractMemo = new Map<string, { contents: string; runtime: Runtime; blocks: CodeBlock[] }>();
function extractBlocksMemo(id: string, contents: string, runtime: Runtime): CodeBlock[] {
  const hit = extractMemo.get(id);
  // Return a shallow copy: the cached `blocks` array is held across calls, so
  // handing out the live reference would let a downstream mutation corrupt the
  // memo for every later consumer. (Block objects themselves are treated as
  // immutable; only the array identity needs defending.)
  if (hit && hit.contents === contents && hit.runtime === runtime) return [...hit.blocks];
  const blocks = extractBlocks(contents, runtime);
  extractMemo.set(id, { contents, runtime, blocks });
  return [...blocks];
}

/**
 * Drop a file's memoized block extraction. Called when a tab/file is closed or
 * the whole workspace is replaced, so the per-file memo can't accumulate one
 * stale entry per never-reopened file. No-op if the id was never memoized.
 */
export function forgetFile(id: string): void {
  extractMemo.delete(id);
}

/** Drop every memoized extraction (workspace-wide replace, e.g. loadFiles). */
export function forgetAllFiles(): void {
  extractMemo.clear();
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
    // Same data-file exclusion as `blocksForFile` — a `libraries/…` or
    // `resources/…` JSON catalog never contributes blocks to the panel/eval pipeline.
    if (!file || isNonProgramFile(file.path)) continue;
    const blocks = extractBlocksMemo(file.id, file.contents, file.runtime);
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
 * Mirror Strudel per-slot errors into the panel's reactive `errored` set so the
 * block LED can paint red. This is NOT a transport listener — armed-block eval on
 * Play is now an EXPLICIT call to `replayArmed()` at each Play-from-stopped site
 * (transport stores / arm / load), with no clock subscription.
 */
export function installSlotErrorBridge() {
  onSlotErrorChange(() => openBlocks._refreshErrored());
}

// Re-export for consumers that want to call extractBlocks directly.
export { extractBlocks };
export type { CodeBlock };
