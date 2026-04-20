import { workspace } from './workspace.svelte';
import { extractBlocks } from '../lib/blocks/extract-blocks';
import type { CodeBlock } from '../lib/blocks/extract-blocks';
import type { Runtime } from '../lib/core';

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

// Re-export for consumers that want to call extractBlocks directly.
export { extractBlocks };
export type { CodeBlock };
