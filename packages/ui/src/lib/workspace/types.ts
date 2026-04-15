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

export function runtimeFromExt(name: string): Runtime {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'tidal': return 'tidal';
    case 'scd': return 'sc';
    case 'hydra': return 'hydra';
    case 'strudel': return 'strudel';
    case 'py': return 'python';
    case 'js': return 'js';
    case 'kanopi': return 'kanopi';
    case 'bps': return 'kanopi';
    default: return 'kanopi';
  }
}
