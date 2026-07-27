import { starterFiles } from '../lib/workspace/fixtures';
import type { TreeNode, VirtualFile } from '../lib/workspace/types';
import { runtimeFromExt } from '../lib/workspace/types';
import { buildTree } from '../lib/workspace/build-tree';
import { forgetFile } from './blocks.svelte';

// Monotonic counter so every minted file id is unique for the lifetime of the
// page — `Date.now()` alone collides when two `openBundle`/`addFile` calls land in
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
    //
    // LA SOURCE FAIT FOI : rouvrir un chemin déjà présent EN FOURNISSANT un contenu
    // ÉCRASE la copie de l'espace de travail — sans garde, sans confirmation, sans
    // comparaison de versions (arbitrage Romain 2026-07-26 : « on écrase tout, on s'en
    // fout, c'est que des tests à moi, et on respecte la biblio »).
    // POURQUOI ça compte : la copie était conservée en SILENCE, donc recharger une scène
    // de la bibliothèque rendait le texte d'hier. Mesuré — `watch.bps` rechargé affichait
    // 583 occurrences d'une graphie que le compilateur refuse désormais, avec un voyant
    // rouge, sur un fichier disque parfaitement sain.
    // Un contenu VIDE n'écrase rien : `addFile(path)` sans contenu n'affirme rien (c'est
    // le geste « ouvre/crée », pas « voici le contenu »).
    const existing = this.files.find((f) => f.path === path);
    if (existing) {
      if (contents !== '' && contents !== existing.contents) {
        this.updateContents(existing.id, contents);
      }
      return existing.id;
    }
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

  /** RETIRE un fichier de l'espace de travail — le SEUL point d'entrée de la suppression
   *  (le bouton de l'arbre et la façade de pilotage y délèguent tous les deux).
   *
   *  CE QU'IL FAIT, ET RIEN DE PLUS : il retire l'entrée de CET espace de travail. Il ne touche
   *  ni au disque, ni à la bibliothèque, ni au nuage — pour un document du nuage ouvert ici, la
   *  projection locale disparaît et le document distant reste (c'est l'arbre du nuage qui possède
   *  sa suppression, `cloudDocs.removeDoc`). L'appelant DIT laquelle des deux choses il fait :
   *  pour un fichier local c'est irréversible, pour une projection du nuage ça ne l'est pas.
   *
   *  L'onglet se ferme d'abord : `closeTab` recalcule l'onglet actif ET relâche l'extraction de
   *  blocs mémorisée (`forgetFile`). Retirer le fichier sans passer par là laisserait un onglet
   *  ouvert sur un identifiant qui ne résout plus.
   *  Rend `false` si l'identifiant n'existe pas — une suppression qui ne trouve rien ne se tait
   *  pas, elle le dit à son appelant. */
  removeFile(id: string): boolean {
    if (!this.files.some((f) => f.id === id)) return false;
    this.closeTab(id);
    this.files = this.files.filter((f) => f.id !== id);
    return true;
  }

  /** Add a bundle of files (e.g. a library scene's files) as NEW tabs alongside
   * whatever is already open, and focus the given path (if any). Never wipes —
   * opening a scene from the library is an EDIT-ONLY gesture (Romain's tab
   * semantics): it must not close/silence anything already open or playing.
   * Each file is added via `addFile` (dedup by path, same as any other open),
   * so re-opening an already-open bundle just refocuses it. Returns the
   * focused file's id, or null if `focusPath` was omitted or not found in the
   * bundle. */
  openBundle(files: { path: string; contents: string }[], focusPath?: string): string | null {
    let focusId: string | null = null;
    for (const f of files) {
      const id = this.addFile(f.path, f.contents);
      if (focusPath && f.path === focusPath) focusId = id;
    }
    if (focusId) {
      this.openFile(focusId);
      return focusId;
    }
    return null;
  }
}

export const workspace = new WorkspaceStore();
