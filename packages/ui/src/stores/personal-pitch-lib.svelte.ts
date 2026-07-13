import { session } from './session.svelte';
import { cloudDocs } from './cloud-docs.svelte';
import { workspace } from './workspace.svelte';
import { setPersonalPitchLib } from '../lib/runtimes/bpx-adapter';

// Composeur des librairies HAUTEUR personnelles → `pitchLibMine` (`ctx` de projection Kairos).
//
// FORME (décision 2026-07-13, co-signée archi [714] / Kairos [713]) : une librairie perso = un
// FICHIER à nom/chemin LIBRE sous `libraries/` qui DÉCLARE son domaine DEDANS (champ JSON
// `domain`). On produit une MAP PLATE `Record<string, string>` :
//   - CLÉ   = chemin APRÈS le préfixe `libraries/`, extension retirée, `/`→`.`
//             (`libraries/ragas.json` → `'ragas'` ; `libraries/a/b.json` → `'a.b'`).
//   - VALEUR = le CONTENU BRUT du fichier (string, VERBATIM) — AUCUN `JSON.parse`, aucun
//             bucketing par domaine. Parser = lire = rôle KAIROS ; un fichier malformé doit
//             crier CHEZ LUI, pas chez l'hôte. Kanopi FOURNIT la donnée telle quelle (loi 26/27).
//
// `libraries/` est PLAT : n'importe quel fichier sous ce préfixe compte (plus de 5 sous-dossiers
// réservés). Source amont : `cloudDocs.docs` + `session.storage.read(id)` (CONNECTÉ, contenu
// asynchrone) OU `workspace.files` (DÉCONNECTÉ, `.contents` en mémoire) — même bascule que
// `FilesView.svelte`, jamais les deux à la fois.
//
// Composition légitime (PAS un `$effect` qui recopie un store) : on lit des références de
// fichiers, on VA CHERCHER leur contenu, on BÂTIT une map hôte neuve, puis on la POUSSE via le
// setter (patron `onExprSource`/`setExprSource` de bpx-adapter) — cf `svelte-5-patterns`.

const LIB_PREFIX = 'libraries/';

/** Chemin sous `libraries/` → clé plate : préfixe retiré, extension retirée, `/`→`.`.
 *  `libraries/ragas.json` → `'ragas'` ; `libraries/a/b.json` → `'a.b'`. Renvoie `null` si le
 *  chemin n'est pas sous `libraries/` (ignoré) ou si la clé serait vide. */
function keyFor(path: string): string | null {
  if (!path.startsWith(LIB_PREFIX)) return null;
  const rest = path.slice(LIB_PREFIX.length).replace(/\.[^./]+$/, '');
  if (!rest) return null;
  return rest.replace(/\//g, '.');
}

/** DÉCONNECTÉ : `workspace.files`, contenu déjà en mémoire — synchrone. */
function buildFromWorkspace(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of workspace.files) {
    const key = keyFor(f.path);
    if (key === null) continue;
    map[key] = f.contents;
  }
  return map;
}

/** CONNECTÉ : `cloudDocs.docs` (métadonnées) + contenu. Un doc déjà ouvert dans l'éditeur a son
 *  contenu le plus frais dans `workspace.files` (édité, pas encore auto-sauvé) ; sinon on le va
 *  chercher au service de stockage. Échecs par-doc isolés (`Promise.allSettled`) — un doc perso
 *  cassé n'empêche pas les autres de charger. AUCUN parse : le contenu brut est stocké tel quel. */
async function buildFromCloud(): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  const targets = cloudDocs.docs
    .map((d) => ({ doc: d, key: keyFor(d.path) }))
    .filter((x): x is { doc: (typeof cloudDocs.docs)[number]; key: string } => x.key !== null);
  await Promise.allSettled(
    targets.map(async ({ doc, key }) => {
      const open = workspace.fileById(doc.id);
      if (open) {
        map[key] = open.contents;
        return;
      }
      try {
        const full = await session.storage.read(doc.id);
        map[key] = full.content;
      } catch (err) {
        console.warn('[personal-pitch-lib] lecture doc perso échouée, ignorée', doc.path, err);
      }
    })
  );
  return map;
}

/** Dernière map construite — exposée pour le harnais de banc (`window.__kanopi`). */
let lastMap: Record<string, string> = {};
export function personalPitchLibSnapshot(): Record<string, string> {
  return lastMap;
}

// Générations pour ignorer les résultats asynchrones PÉRIMÉS (une reconstruction cloud en vol
// quand une nouvelle démarre — édition rapide, changement de session).
let generation = 0;

async function rebuild(): Promise<void> {
  const gen = ++generation;
  const map = session.session ? await buildFromCloud() : buildFromWorkspace();
  if (gen !== generation) return; // une reconstruction plus récente a déjà gagné
  lastMap = map;
  setPersonalPitchLib(map);
}

/** À appeler une fois au démarrage (comme `installAutosave`) pour alimenter le setter AVANT toute
 *  dérivation. Réagit à : connexion/déconnexion, liste des docs cloud, contenu/chemin des fichiers
 *  de l'espace de travail (local ET docs cloud ouverts en édition). */
export function installPersonalPitchLib(): void {
  $effect.root(() => {
    $effect(() => {
      void session.session;
      void cloudDocs.docs.length;
      for (const d of cloudDocs.docs) void d.path;
      void workspace.files.length;
      // Ne touche QUE les fichiers sous `libraries/` : évite de re-déclencher la reconstruction à
      // chaque frappe sur un fichier hors périmètre (même garde de dépendance ciblée que
      // `installAutosave`, bornée à ce composeur).
      for (const f of workspace.files) {
        if (!f.path.startsWith(LIB_PREFIX)) continue;
        void f.path;
        void f.contents.length;
      }
      void rebuild();
    });
  });
}
