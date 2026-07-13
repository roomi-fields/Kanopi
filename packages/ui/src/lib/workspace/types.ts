import type { Runtime } from '../core-mock';
import { knownExtensions, runtimeFromExtension } from '../runtimes/registry';

export interface VirtualFile {
  id: string;
  path: string;
  name: string;
  contents: string;
  runtime: Runtime;
  /** When true the editor opens this file in read-only mode (reference data,
   * e.g. a resource-library catalog entry — not meant to be edited). */
  readOnly?: boolean;
}

export interface TreeNode {
  type: 'dir' | 'file';
  name: string;
  path: string;
  fileId?: string;
  children?: TreeNode[];
}

/**
 * Dotted extensions accepted by `+ New file` and recognised by
 * `runtimeFromExt`. Derived dynamically from the runtime registry so
 * adding a new language is self-contained in its adapter (the adapter
 * declares its `extensions: ['.foo']` and everything else follows).
 */
export const KNOWN_EXTENSIONS: string[] = knownExtensions();

export function runtimeFromExt(name: string): Runtime {
  const idx = name.lastIndexOf('.');
  if (idx < 0) return 'bpscript';
  return runtimeFromExtension(name.slice(idx));
}

/**
 * A file that is DATA, not a program: it must never be parsed/derived/played as
 * a scene, contribute blocks/actors, show a compile chip, or run the BPScript
 * language/lint extension. Two reserved prefixes qualify (decision
 * 2026-07-13-invocation-librairies-factory-mine.md):
 *  - `libraries/` — a personal library (a typed JSON catalog declaring its domain).
 *  - `resources/` — a factory catalog entry opened read-only from Factory › Libraries.
 * Both are `.json` catalogs; `runtimeFromExt` falls back to 'bpscript' for `.json`,
 * so without this guard they would be treated as programs (parse errors, phantom
 * armed actor). Single source of truth for that exclusion across the app.
 */
export function isNonProgramFile(path: string | undefined): boolean {
  return path !== undefined && (path.startsWith('libraries/') || path.startsWith('resources/'));
}
