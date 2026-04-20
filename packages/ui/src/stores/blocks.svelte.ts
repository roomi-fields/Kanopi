import { workspace } from './workspace.svelte';
import { extractBlocks } from '../lib/blocks/extract-blocks';
import type { CodeBlock } from '../lib/blocks/extract-blocks';
import type { Runtime } from '../lib/core';
import { core } from '../lib/core';
import { getAdapter } from '../lib/runtimes/registry';
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

  isArmed(q: string): boolean {
    return this.armed.has(q);
  }

  /** Arm + eval. If transport stopped, only arms (eval will fire on play). */
  async arm(q: string) {
    const b = this.list.find((x) => x.qualifiedName === q);
    if (!b) return;
    // Svelte 5 reactivity wants a new Set, not mutation.
    const next = new Set(this.armed);
    next.add(q);
    this.armed = next;
    if (!clock.state.playing) return;
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
      await adapter.stop({ actorId: q, fileId: b.fileName }, (e: Parameters<typeof core.console.push>[0]) => core.console.push(e));
    } catch {
      /* best-effort stop */
    }
  }

  async toggle(q: string) {
    if (this.armed.has(q)) await this.disarm(q);
    else await this.arm(q);
  }

  /** Evaluate this exact block via core.evaluateBlock with its qualifiedName as actorId. */
  async evalOne(b: OpenBlock) {
    const file = workspace.fileById(b.fileId);
    if (!file) return;
    const code = file.contents.slice(b.block.from, b.block.to);
    if (!code.trim()) return;
    await core.evaluateBlock(b.runtime, code, b.fileName, b.block.from, b.qualifiedName);
  }

  /** Called by the clock transport listener — re-eval every armed block on play. */
  async replayArmed() {
    const armedList = this.list.filter((b) => this.armed.has(b.qualifiedName));
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
  for (const tabId of workspace.openTabIds) {
    const file = workspace.fileById(tabId);
    if (!file) continue;
    // Skip session files — they're composed of directives, not runnable blocks.
    if (file.runtime === 'kanopi') continue;
    const blocks = extractBlocks(file.contents, file.runtime);
    const base = basename(file.name);
    for (const b of blocks) {
      out.push({
        fileId: file.id,
        fileName: file.name,
        runtime: file.runtime,
        block: b,
        qualifiedName: `${base}.${b.name}`
      });
    }
  }
  return out;
}

function basename(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
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
    if (s.playing && !wasPlaying) {
      void openBlocks.replayArmed();
    }
    wasPlaying = s.playing;
  });
}

// Re-export for consumers that want to call extractBlocks directly.
export { extractBlocks };
export type { CodeBlock };
