import { starterFiles } from '../lib/workspace/fixtures';
import type { TreeNode, VirtualFile } from '../lib/workspace/types';
import { runtimeFromExt } from '../lib/workspace/types';
import { buildTree } from '../lib/workspace/build-tree';
import { forgetFile, forgetAllFiles } from './blocks.svelte';

// Monotonic counter so every minted file id is unique for the lifetime of the
// page — `Date.now()` alone collides when two `loadFiles`/`addFile` calls land in
// the SAME millisecond (rapid demo swaps), and a colliding id let a STALE tab in
// `openTabIds` resolve to a DIFFERENT freshly-loaded file, resurfacing the
// previous program's blocks (the phantom "02" open block after a scene swap).
let fileIdCounter = 0;
function mintFileId(): string {
  return `f${Date.now()}-${fileIdCounter++}`;
}

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
    // Release the closed file's memoized block extraction (bounded leak: one
    // stale entry per never-reopened file otherwise).
    forgetFile(id);
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
      this.openTabIds =
        i === -1 ? [...without, id] : [...without.slice(0, i), id, ...without.slice(i)];
    }
  }

  updateContents(id: string, contents: string) {
    this.files = this.files.map((f) => (f.id === id ? { ...f, contents } : f));
  }

  addFile(path: string, contents = '', readOnly = false) {
    // Reuse an existing file at the same path rather than piling up duplicates
    // (e.g. re-opening the same resource entry from the Resources view).
    const existing = this.files.find((f) => f.path === path);
    if (existing) return existing.id;
    const id = mintFileId();
    this.files = [
      ...this.files,
      {
        id,
        path,
        name: path.split('/').pop() ?? path,
        contents,
        runtime: runtimeFromExt(path),
        readOnly
      }
    ];
    return id;
  }

  /** Replace every file + tab with a fresh set and focus the given path (if any).
   * Returns the focused file's id (or null) so the caller can arm+play the
   * loaded program — a demo sounds on load, not after a manual disarm/rearm. */
  loadFiles(files: { path: string; contents: string }[], focusPath?: string): string | null {
    const next: VirtualFile[] = files.map((f) => ({
      id: mintFileId(),
      path: f.path,
      name: f.path.split('/').pop() ?? f.path,
      contents: f.contents,
      runtime: runtimeFromExt(f.path)
    }));
    this.files = next;
    this.openTabIds = [];
    this.activeTabId = null;
    // Every prior file id is gone — drop their memoized extractions wholesale.
    forgetAllFiles();
    if (focusPath) {
      const target = next.find((f) => f.path === focusPath);
      if (target) {
        this.openFile(target.id);
        return target.id;
      }
    }
    return null;
  }
}

export const workspace = new WorkspaceStore();
