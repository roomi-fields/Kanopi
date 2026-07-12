// Adaptateur MINCE PocketBase → StorageService (contrat §2 : le SEUL fichier de Kanopi
// qui importe le SDK PocketBase ; tout le reste code contre l'interface `StorageService`).
// Remplaçable par une autre implémentation (API maison, autre brique) sans toucher Kanopi.
//
// Mapping figé (contrat §3 + [685], vérifié bout-en-bout contre le service réel) :
//   login    = users.authWithPassword(email, pwd)
//   logout   = pb.authStore.clear()
//   session  = pb.authStore (isValid + record)
//   list     = documents.getFullList()          (propriétaire-seul, règle service)
//   read     = documents.getOne(id)
//   create   = documents.create({owner, path, content})   // owner = utilisateur courant
//   write    = documents.update(id, {content})            // write-through immédiat
//   rename   = documents.update(id, {path})
//   duplicate= read + create (path dérivé « copy »)
//   remove   = documents.delete(id)

import PocketBase, { type RecordModel } from 'pocketbase';
import {
  STORAGE_BASE_URL,
  type StorageService,
  type Session,
  type Doc,
  type DocMeta
} from './storage-service';

const USERS = 'users';
const DOCUMENTS = 'documents';

/** Enregistrement `documents` du service → nos types de frontière. Le service porte
 *  `owner`/`created`/`updated` ; on projette sur `ownerId`/`createdAt`/`updatedAt`. */
function toDocMeta(rec: RecordModel): DocMeta {
  return {
    id: rec.id,
    ownerId: (rec.owner as string) ?? '',
    path: (rec.path as string) ?? '',
    createdAt: (rec.created as string) ?? '',
    updatedAt: (rec.updated as string) ?? ''
  };
}

function toDoc(rec: RecordModel): Doc {
  return { ...toDocMeta(rec), content: (rec.content as string) ?? '' };
}

/** Session depuis l'authStore du SDK (record = utilisateur courant ; alias legacy `model`). */
function sessionFromStore(pb: PocketBase): Session | null {
  const rec = (pb.authStore.record ?? pb.authStore.model) as RecordModel | null;
  if (!pb.authStore.isValid || !rec) return null;
  return { userId: rec.id, email: (rec.email as string) ?? '' };
}

/** Dérive un `path` « copie » pour un duplicate (« save as ») : insère « copy » avant
 *  l'extension, en préservant les dossiers. `a/b/nom.ext` → `a/b/nom copy.ext`. */
function copyPath(path: string): string {
  const slash = path.lastIndexOf('/');
  const dir = slash === -1 ? '' : path.slice(0, slash + 1);
  const base = slash === -1 ? path : path.slice(slash + 1);
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return `${dir}${base} copy`;
  return `${dir}${base.slice(0, dot)} copy${base.slice(dot)}`;
}

/**
 * Traduit l'échec de création de compte du service en message affichable, en français et
 * dans les termes de l'utilisateur — l'interprétation des erreurs du SDK vit ICI (seul
 * fichier qui connaît PocketBase, contrat §2), pas dans l'UI. Le service renvoie des erreurs
 * de validation par champ : `{ data: { password: { code }, email: { code } }, ... }`.
 */
function registerErrorMessage(err: unknown): string {
  const data = (err as { response?: { data?: Record<string, { code?: string }> } })?.response?.data;
  if (data?.password) {
    return data.password.code === 'validation_min_text_constraint'
      ? 'Le mot de passe doit faire au moins 8 caractères.'
      : 'Mot de passe invalide.';
  }
  if (data?.email) {
    return data.email.code === 'validation_not_unique'
      ? 'Cet email est déjà utilisé.'
      : 'Email invalide.';
  }
  return 'Échec de la création du compte — réessaie.';
}

/**
 * Construit l'implémentation PocketBase de `StorageService`. Une instance = un client
 * (un authStore persistant, réutilisé au démarrage pour `currentSession`). L'hôte n'appelle
 * QUE cette factory ; il ne voit jamais `pb`.
 */
export function createPocketBaseStorage(baseUrl: string = STORAGE_BASE_URL): StorageService {
  const pb = new PocketBase(baseUrl);

  return {
    async login(email, password) {
      const auth = await pb.collection(USERS).authWithPassword(email, password);
      return { userId: auth.record.id, email: (auth.record.email as string) ?? email };
    },
    async register(email, password) {
      try {
        await pb.collection(USERS).create({ email, password, passwordConfirm: password });
      } catch (err) {
        throw new Error(registerErrorMessage(err));
      }
      const auth = await pb.collection(USERS).authWithPassword(email, password);
      return { userId: auth.record.id, email: (auth.record.email as string) ?? email };
    },
    async logout() {
      pb.authStore.clear();
    },
    currentSession() {
      return sessionFromStore(pb);
    },
    onSession(cb) {
      // `onChange` relaie login/logout/expiration ; on reprojette en Session|null.
      return pb.authStore.onChange(() => cb(sessionFromStore(pb)));
    },

    async list() {
      const recs = await pb.collection(DOCUMENTS).getFullList();
      return recs.map(toDocMeta);
    },
    async read(id) {
      return toDoc(await pb.collection(DOCUMENTS).getOne(id));
    },
    async create(path, content = '') {
      const owner = (pb.authStore.record ?? pb.authStore.model)?.id;
      const rec = await pb.collection(DOCUMENTS).create({ owner, path, content });
      return toDoc(rec);
    },
    async write(id, content) {
      await pb.collection(DOCUMENTS).update(id, { content });
    },
    async rename(id, path) {
      await pb.collection(DOCUMENTS).update(id, { path });
    },
    async duplicate(id) {
      const src = await pb.collection(DOCUMENTS).getOne(id);
      const owner = (pb.authStore.record ?? pb.authStore.model)?.id;
      const rec = await pb.collection(DOCUMENTS).create({
        owner,
        path: copyPath((src.path as string) ?? ''),
        content: (src.content as string) ?? ''
      });
      return toDoc(rec);
    },
    async remove(id) {
      await pb.collection(DOCUMENTS).delete(id);
    }
  };
}
