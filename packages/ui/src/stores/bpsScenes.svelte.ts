import { compileBps } from '../lib/runtimes/compile-cache';
import { runtimeFromExt } from '../lib/workspace/types';

// The `@scene <name> "<file>"` multi-file table of a `.bps` (compileBPS emits
// `sceneTable = { calm: { file: 'calm.bps' }, … }`). Drives the right-panel
// Scenes cards; activating a card loads + plays the referenced child `.bps`.
// Empty for a `.bps` that declares no file-scenes (or a non-`.bps` file).
export function sceneTableFromFile(
  fileName: string | undefined,
  contents: string | undefined
): Record<string, { file: string }> {
  if (!fileName || contents === undefined) return {};
  if (runtimeFromExt(fileName) !== 'bpscript') return {};
  try {
    const c = compileBps(contents) as {
      errors: unknown[];
      ast: { scenes?: { name: string; file: string }[] } | null;
    };
    if (c.errors.length > 0) return {};
    // Read the `@scene <name> "<file>"` table from the AST's `SceneDirective`
    // nodes (single source of truth), instead of compileBPS's `sceneTable`
    // sidecar. `{ [name]: { file } }` — the same shape the sidecar produced.
    const out: Record<string, { file: string }> = {};
    for (const s of c.ast?.scenes ?? []) out[s.name] = { file: s.file };
    return out;
  } catch {
    return {};
  }
}
