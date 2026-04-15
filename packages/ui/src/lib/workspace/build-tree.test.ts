import { describe, it, expect } from 'vitest';
import { buildTree } from './build-tree';
import type { VirtualFile } from './types';

const f = (id: string, path: string): VirtualFile => ({
  id,
  path,
  name: path.split('/').pop()!,
  contents: '',
  runtime: 'kanopi'
});

describe('buildTree', () => {
  it('flat files', () => {
    const t = buildTree([f('1', 'a.kanopi'), f('2', 'b.tidal')]);
    expect(t.map((n) => n.name)).toEqual(['a.kanopi', 'b.tidal']);
    expect(t.every((n) => n.type === 'file')).toBe(true);
  });

  it('nested dirs', () => {
    const t = buildTree([f('1', 'src/a.kanopi'), f('2', 'src/sub/b.tidal')]);
    expect(t.length).toBe(1);
    expect(t[0].type).toBe('dir');
    expect(t[0].name).toBe('src');
    expect(t[0].children?.length).toBe(2);
  });

  it('handles empty input', () => {
    expect(buildTree([])).toEqual([]);
  });
});
