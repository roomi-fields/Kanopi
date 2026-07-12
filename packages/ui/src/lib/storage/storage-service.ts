// StorageService — la frontière que Kanopi consomme pour l'espace perso CLOUD.
//
// Contrat FIGÉ : `hub/contrats/kanopi-storage.md` §3 (architecte 2026-07-12). Kanopi est
// une PROJECTION : l'autorité des scènes/libs de l'utilisateur vit dans le service de
// stockage auto-hébergé (PocketBase sur le VPS), JAMAIS chez l'hôte. Kanopi code contre
// CETTE interface ; l'implémentation (SDK PocketBase) est enveloppée par un adaptateur
// mince (`pocketbase-adapter.ts`) — le SEUL fichier qui importe le SDK (contrat §2).
// On peut remplacer l'implémentation sans toucher au reste de Kanopi.

/** Session authentifiée. `userId` = identité PocketBase de l'utilisateur. */
export interface Session {
  userId: string;
  email: string;
}

/**
 * Métadonnées d'un document. `id` = uuid STABLE (l'identité, ≠ nom de fichier).
 * `path` = 'dossier/sous/nom.ext' — porte À LA FOIS les dossiers (slashes → arbre de
 * fichiers via `buildTree`), le nom ET l'extension (→ runtime + coloration via
 * `runtimeFromExt`). Résolution des frictions 1+2 : aucune duplication de vérité,
 * dossiers gratuits, pas de champ `ext`/`kind` séparé.
 */
export interface DocMeta {
  id: string;
  ownerId: string;
  path: string;
  createdAt: string;
  updatedAt: string;
}

/** Document complet = métadonnées + contenu. `content` = texte `.bps` (v1 : TEXTE seul ;
 *  les libs de sons binaires sont post-v1, contrat §5). */
export type Doc = DocMeta & { content: string };

/**
 * Interface consommée par la couche de projection Kanopi. Toutes les ops documents sont
 * PROPRIÉTAIRE-SEUL (imposé côté service par `owner = @request.auth.id`, pas côté Kanopi).
 * Les ops fichier sont des COMMANDES à l'autorité, re-projetées — jamais des mutations
 * locales détentrices.
 */
export interface StorageService {
  // ————— Auth —————
  /** Ouvre la session (email + mot de passe). Échec = throw typé. */
  login(email: string, password: string): Promise<Session>;
  /** Crée un compte (email + mot de passe) PUIS ouvre la session (auto-login). Échec = throw typé. */
  register(email: string, password: string): Promise<Session>;
  logout(): Promise<void>;
  /** Session courante, LUE synchrone au démarrage (depuis le token persistant). */
  currentSession(): Session | null;
  /** Relais login/logout/expiration ; renvoie la fonction de désabonnement. */
  onSession(cb: (s: Session | null) => void): () => void;

  // ————— Documents (espace perso, lecture-écriture) —————
  /** Métadonnées de TOUS les documents de l'utilisateur (pas de contenu). */
  list(): Promise<DocMeta[]>;
  /** Contenu complet d'un document. */
  read(id: string): Promise<Doc>;
  /** Crée un document ; `owner` posé à l'utilisateur courant côté adaptateur. */
  create(path: string, content?: string): Promise<Doc>;
  /** Écrit le contenu — WRITE-THROUGH IMMÉDIAT (brut). Le débounce de l'auto-save est
   *  la responsabilité de l'APPELANT (couche de projection Kanopi), pas d'ici (friction 5). */
  write(id: string, content: string): Promise<void>;
  /** Renomme = change le `path` (dossier/nom/ext) ; l'`id` ne change pas. */
  rename(id: string, path: string): Promise<void>;
  /** « Save as » = duplique en un nouveau document (`id` neuf, path dérivé « copy »). */
  duplicate(id: string): Promise<Doc>;
  remove(id: string): Promise<void>;
}

/**
 * URL de base du service auto-hébergé (VPS Hostinger, PocketBase), DÉPENDANTE DE
 * L'ENVIRONNEMENT (isolation totale prod/dev — architecte [688], forme CHEMIN tranchée
 * Romain [690]) :
 * - build PROD → `store.roomi-fields.com` (app publique ; inscription VERROUILLÉE).
 * - build DEV (localhost:5173) → `store.roomi-fields.com/dev` (Traefik strippe `/dev` → le
 *   SDK voit `/api` à la racine ; inscription OUVERTE, comptes de test/e2e librement créés).
 * Override possible par `VITE_STORAGE_URL`. Défaut SÛR = prod (jamais l'instance dev bakée
 * par mégarde dans un build prod). CORS autorise `https://roomi-fields.com` + `localhost:5173`.
 */
export const STORAGE_BASE_URL: string =
  (import.meta.env.VITE_STORAGE_URL as string | undefined) ??
  (import.meta.env.DEV ? 'https://store.roomi-fields.com/dev' : 'https://store.roomi-fields.com');
