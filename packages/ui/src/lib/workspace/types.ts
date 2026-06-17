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
  if (idx < 0) return 'kanopi';
  return runtimeFromExtension(name.slice(idx));
}
