import { session } from './session.svelte';
import { workspace } from './workspace.svelte';
import { runtimeFromExt } from '../lib/workspace/types';
import type { VirtualFile } from '../lib/workspace/types';
import type { Doc, DocMeta } from '../lib/storage/storage-service';
import { createWriteScheduler } from '../lib/storage/write-scheduler';

// INCRÉMENT 2 (docs cloud) du chantier espace perso. `CloudDocsStore` est une PROJECTION
// des documents de l'utilisateur exposés par `session.storage` — AUCUN état d'autorité
// inventé : `docs` est un MIROIR de `list()`, chaque opération (create/rename/duplicate/
// remove) est une COMMANDE envoyée au service puis re-projetée via `refresh()`. Le contenu
// d'un doc ouvert vit dans `workspace.files` (id = doc.id) : c'est le plumbing éditeur
// existant, pas un 2e état de contenu.
//
// Réactivité session→refresh : on s'abonne DIRECTEMENT à `session.storage.onSession` (la
// même source d'autorité que `SessionStore`), pas au `$state` déjà projeté par `session`
// (store-à-store = le pattern interdit "$effect qui recopie un store dans un autre"). Un
// `.svelte.ts` n'a pas de cycle de vie de composant pour un `$effect` ; l'abonnement direct
// à la source (qui, comme `SessionStore`, relaie login/logout/expiration) est le point
// d'entrée le plus propre et fonctionne dès l'import du module (pas de `init()` à appeler
// depuis un composant).
class CloudDocsStore {
  docs = $state<DocMeta[]>([]);

  // Débounce d'auto-save + retry réseau : délégués à la couche I/O (write-scheduler), pas
  // de minuterie dans ce store de projection. `write` = write-through immédiat du service ;
  // `isAlive` = le doc existe-t-il encore (on ne retente pas un doc supprimé).
  private scheduler = createWriteScheduler({
    write: (id, content) => session.storage.write(id, content),
    isAlive: (id) => this.isCloudDoc(id),
    onError: (id, err) =>
      console.error('[cloud-docs] auto-save failed — retrying, edit kept locally', id, err)
  });

  constructor() {
    session.storage.onSession((s) => {
      if (s) {
        void this.refresh();
      } else {
        this.closeCloudTabs();
        this.docs = [];
      }
    });
    // Session déjà ouverte au chargement du module (token persistant relu au démarrage) —
    // `onSession` ne re-tire qu'au PROCHAIN changement, donc on liste aussi maintenant.
    if (session.storage.currentSession()) {
      void this.refresh();
    }
  }

  async refresh(): Promise<void> {
    try {
      const list = await session.storage.list();
      this.docs = [...list].sort((a, b) => a.path.localeCompare(b.path));
    } catch (err) {
      console.error('[cloud-docs] refresh failed', err);
    }
  }

  isCloudDoc(id: string): boolean {
    return this.docs.some((d) => d.id === id);
  }

  async openInEditor(id: string): Promise<void> {
    if (workspace.fileById(id)) {
      workspace.openFile(id);
      return;
    }
    try {
      const doc = await session.storage.read(id);
      this.projectIntoWorkspace(doc);
      workspace.openFile(id);
    } catch (err) {
      console.error('[cloud-docs] open failed', id, err);
    }
  }

  /** Auto-save débouncé (friction 5) : le débounce + le retry réseau vivent dans la couche I/O
   *  (`lib/storage/write-scheduler`), PAS ici — ce store ne fabrique aucune minuterie (garde §6 :
   *  le temps appartient à Kronos ; ces timers sont de l'I/O, mais leur place est la couche
   *  stockage). Zéro-perte (friction 4) : le texte affiché reste `workspace.files` (déjà à jour
   *  via `updateContents`) ; le scheduler ne jette jamais la frappe et retente tant que le doc
   *  existe (`isAlive`). */
  setContent(id: string, content: string): void {
    this.scheduler.schedule(id, content);
  }

  async createDoc(path: string, content = ''): Promise<void> {
    const doc = await session.storage.create(path, content);
    await this.refresh();
    await this.openInEditor(doc.id);
  }

  async renameDoc(id: string, path: string): Promise<void> {
    await session.storage.rename(id, path);
    await this.refresh();
    // Garde l'onglet ouvert (s'il l'est) en phase avec le nouveau chemin/nom projeté.
    if (workspace.fileById(id)) {
      const name = path.split('/').pop() ?? path;
      workspace.files = workspace.files.map((f) => (f.id === id ? { ...f, path, name } : f));
    }
  }

  async duplicateDoc(id: string): Promise<void> {
    await session.storage.duplicate(id);
    await this.refresh();
  }

  async removeDoc(id: string): Promise<void> {
    this.scheduler.cancel(id);
    await session.storage.remove(id);
    await this.refresh();
    if (workspace.fileById(id)) {
      workspace.closeTab(id);
      workspace.files = workspace.files.filter((f) => f.id !== id);
    }
  }

  private projectIntoWorkspace(doc: Doc): void {
    const vf: VirtualFile = {
      id: doc.id,
      path: doc.path,
      name: doc.path.split('/').pop() ?? doc.path,
      contents: doc.content,
      runtime: runtimeFromExt(doc.path)
    };
    const idx = workspace.files.findIndex((f) => f.id === doc.id);
    workspace.files =
      idx === -1
        ? [...workspace.files, vf]
        : workspace.files.map((f) => (f.id === doc.id ? vf : f));
  }

  private closeCloudTabs(): void {
    const cloudIds = new Set(this.docs.map((d) => d.id));
    for (const id of cloudIds) this.scheduler.cancel(id);
    if (cloudIds.size === 0) return;
    for (const id of cloudIds) {
      if (workspace.fileById(id)) workspace.closeTab(id);
    }
    workspace.files = workspace.files.filter((f) => !cloudIds.has(f.id));
  }
}

export const cloudDocs = new CloudDocsStore();
