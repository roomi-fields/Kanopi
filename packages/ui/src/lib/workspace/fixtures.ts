import type { VirtualFile } from './types';
import { runtimeFromExt } from './types';
import mainRaw from '../../../../library/scenes/code-voices/starter-main.bps?raw';
import secondRaw from '../../../../library/scenes/code-voices/starter-second.bps?raw';

const raw: { path: string; contents: string }[] = [
  {
    path: 'main.bps',
    contents: mainRaw
  },
  {
    path: 'second.bps',
    contents: secondRaw
  }
];

export function starterFiles(): VirtualFile[] {
  return raw.map((f, i) => ({
    id: `f${i + 1}`,
    path: f.path,
    name: f.path.split('/').pop() ?? f.path,
    contents: f.contents,
    runtime: runtimeFromExt(f.path)
  }));
}
