import type { Runtime } from '../core-mock';

export interface VirtualFile {
  id: string;
  path: string;
  name: string;
  contents: string;
  runtime: Runtime;
}

export interface TreeNode {
  type: 'dir' | 'file';
  name: string;
  path: string;
  fileId?: string;
  children?: TreeNode[];
}

/**
 * Single source of truth for `extension → runtime` mapping. FilesView
 * and any other code that needs the allowed extension list derives from
 * this table so adding a new language only touches one spot.
 */
export const EXTENSION_TO_RUNTIME: Record<string, Runtime> = {
  tidal: 'tidal',
  scd: 'sc',
  hydra: 'hydra',
  strudel: 'strudel',
  p5: 'p5',
  py: 'python',
  js: 'js',
  kanopi: 'kanopi',
  bps: 'kanopi'
};

/** Dotted form, e.g. `.p5`, for UI prompts / validation. */
export const KNOWN_EXTENSIONS: string[] = Object.keys(EXTENSION_TO_RUNTIME).map(
  (e) => '.' + e
);

export function runtimeFromExt(name: string): Runtime {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_TO_RUNTIME[ext] ?? 'kanopi';
}
