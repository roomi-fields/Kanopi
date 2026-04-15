import { starterFiles } from '../lib/workspace/fixtures';
import type { TreeNode, VirtualFile } from '../lib/workspace/types';
import { runtimeFromExt } from '../lib/workspace/types';
import { buildTree } from '../lib/workspace/build-tree';

class WorkspaceStore {
  files = $state<VirtualFile[]>(starterFiles());
  openTabIds = $state<string[]>([]);
  activeTabId = $state<string | null>(null);

  tree = $derived<TreeNode[]>(buildTree(this.files));

  fileById(id: string): VirtualFile | undefined {
    return this.files.find((f) => f.id === id);
  }

  openFile(id: string) {
    const file = this.fileById(id);
    if (!file) return;
    // Single-session rule: at most one .kanopi can be open at a time.
    if (file.runtime === 'kanopi') {
      const otherKanopi = this.openTabIds.filter((tid) => {
        if (tid === id) return false;
        return this.fileById(tid)?.runtime === 'kanopi';
      });
      for (const tid of otherKanopi) this.closeTab(tid);
    }
    if (!this.openTabIds.includes(id)) {
      this.openTabIds = [...this.openTabIds, id];
    }
    this.activeTabId = id;
  }

  closeTab(id: string) {
    const idx = this.openTabIds.indexOf(id);
    if (idx === -1) return;
    const next = this.openTabIds.filter((t) => t !== id);
    this.openTabIds = next;
    if (this.activeTabId === id) {
      this.activeTabId = next[Math.min(idx, next.length - 1)] ?? null;
    }
  }

  setActive(id: string) {
    if (this.openTabIds.includes(id)) this.activeTabId = id;
  }

  reorder(id: string, beforeId: string | null) {
    const without = this.openTabIds.filter((t) => t !== id);
    if (beforeId === null) {
      this.openTabIds = [...without, id];
    } else {
      const i = without.indexOf(beforeId);
      this.openTabIds = i === -1 ? [...without, id] : [...without.slice(0, i), id, ...without.slice(i)];
    }
  }

  updateContents(id: string, contents: string) {
    this.files = this.files.map((f) => (f.id === id ? { ...f, contents } : f));
  }

  addFile(path: string, contents = '') {
    const id = `f${Date.now()}`;
    this.files = [
      ...this.files,
      { id, path, name: path.split('/').pop() ?? path, contents, runtime: runtimeFromExt(path) }
    ];
    return id;
  }
}

export const workspace = new WorkspaceStore();
