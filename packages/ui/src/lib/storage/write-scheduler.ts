// Ordonnanceur d'écriture DÉBOUNCÉE + retry réseau pour l'auto-save de l'espace perso cloud.
//
// Vit dans `lib/storage` (couche I/O de stockage), PAS dans le store de projection : ces
// minuteries sont de l'ENTRÉE/SORTIE (throttle « frappe → écriture », backoff de re-tentative
// réseau), JAMAIS du temps musical. Elles n'ordonnancent/positionnent/tempo RIEN, ne lisent
// aucune position Kronos — le temps musical appartient à Kronos seul (garde §6 hôte↔runtimes).
// Même famille que le `debounce` de `lib/persistence/workspace-db.ts` (auto-save workspace) :
// le timer d'I/O a sa place dans la couche persistance/stockage, pas dans la surface de projection.
//
// Contrat kanopi-storage.md §5 : « KANOPI débounce » (throttle frappe→write) ; `StorageService.write`
// est un write-through IMMÉDIAT (brut). Zéro-perte (§5) : une écriture échouée ne JETTE JAMAIS la
// frappe — le contenu en attente est conservé et re-tenté tant que le document existe encore.

const DEBOUNCE_MS = 1000;
const RETRY_MS = 2000;

export interface WriteScheduler {
  /** Programme l'écriture débouncée du dernier contenu d'un document. */
  schedule(id: string, content: string): void;
  /** Annule les écritures en attente d'un document (ex. suppression/déconnexion). */
  cancel(id: string): void;
}

/**
 * Crée un ordonnanceur d'écriture. `write` = write-through immédiat du service ;
 * `isAlive(id)` dit si le document existe encore côté service (on ne retente pas un doc
 * supprimé). L'appelant (le store de projection) garde le texte affiché à jour de son côté :
 * ici on ne fait que POUSSER, on ne détient aucun contenu d'affichage.
 */
export function createWriteScheduler(opts: {
  write: (id: string, content: string) => Promise<void>;
  isAlive: (id: string) => boolean;
  onError?: (id: string, err: unknown) => void;
}): WriteScheduler {
  const pending = new Map<string, string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function flush(id: string): void {
    timers.delete(id);
    const content = pending.get(id);
    if (content === undefined) return;
    void writeThrough(id, content);
  }

  async function writeThrough(id: string, content: string): Promise<void> {
    try {
      await opts.write(id, content);
      // Ne purge que si rien de plus récent n'a été tapé pendant l'écriture (sinon on
      // écraserait une frappe plus récente).
      if (pending.get(id) === content) pending.delete(id);
    } catch (err) {
      opts.onError?.(id, err);
      // Zéro-perte : le contenu reste en attente et on RETENTE — sauf si le doc n'existe
      // plus côté service (supprimé entre-temps), auquel cas plus rien à écrire.
      if (!opts.isAlive(id)) {
        pending.delete(id);
        return;
      }
      const t = setTimeout(() => {
        timers.delete(id);
        const latest = pending.get(id);
        if (latest !== undefined) void writeThrough(id, latest);
      }, RETRY_MS);
      timers.set(id, t);
    }
  }

  return {
    schedule(id, content) {
      pending.set(id, content);
      const existing = timers.get(id);
      if (existing) clearTimeout(existing);
      timers.set(
        id,
        setTimeout(() => flush(id), DEBOUNCE_MS)
      );
    },
    cancel(id) {
      const existing = timers.get(id);
      if (existing) clearTimeout(existing);
      timers.delete(id);
      pending.delete(id);
    }
  };
}
