import type { TreeNode, VirtualFile } from './types';

export function buildTree(files: VirtualFile[]): TreeNode[] {
  const root: TreeNode = { type: 'dir', name: '', path: '', children: [] };
  for (const f of files) {
    const parts = f.path.split('/');
    let cur = root;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      cur.children ??= [];
      let next = cur.children.find((c) => c.name === part);
      if (!next) {
        next = isFile
          ? { type: 'file', name: part, path: f.path, fileId: f.id }
          : { type: 'dir', name: part, path: parts.slice(0, i + 1).join('/'), children: [] };
        cur.children.push(next);
      }
      cur = next;
    });
  }
  return root.children ?? [];
}
