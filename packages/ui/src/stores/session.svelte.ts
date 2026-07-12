import { createPocketBaseStorage } from '../lib/storage/pocketbase-adapter';
import type { Session, StorageService } from '../lib/storage/storage-service';

// INCRÉMENT 1 (auth seul) du chantier espace perso cloud. `SessionStore` est une
// PROJECTION de la session PocketBase (`StorageService.currentSession`/`onSession`) —
// il n'invente aucun état : login/logout/expiration sont relayés depuis l'adaptateur,
// jamais recalculés côté hôte. Les ops documents viendront dans un incrément séparé ;
// `storage` est déjà exposé ici pour qu'elles s'y branchent sans nouveau singleton.
const storage: StorageService = createPocketBaseStorage();

class SessionStore {
  session = $state<Session | null>(storage.currentSession());

  constructor() {
    storage.onSession((s) => {
      this.session = s;
    });
  }

  get storage(): StorageService {
    return storage;
  }

  /** Échec = throw (typé par l'adaptateur) ; l'UI l'attrape et l'affiche. */
  async login(email: string, password: string): Promise<void> {
    const s = await storage.login(email, password);
    this.session = s;
  }

  /** Crée le compte + ouvre la session. Échec = throw (l'UI l'attrape). */
  async register(email: string, password: string): Promise<void> {
    const s = await storage.register(email, password);
    this.session = s;
  }

  async logout(): Promise<void> {
    await storage.logout();
  }

  /** Change le mot de passe (connecté). Échec = throw (l'UI l'attrape). */
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await storage.changePassword(oldPassword, newPassword);
  }

  /** Demande un lien de réinitialisation par email. Ne throw jamais (contrat anti-énumération). */
  async requestPasswordReset(email: string): Promise<void> {
    await storage.requestPasswordReset(email);
  }

  /** Met à jour le profil (ex. nom d'affichage) et reprojette la session. Échec = throw. */
  async updateProfile(patch: { name?: string }): Promise<void> {
    this.session = await storage.updateProfile(patch);
  }
}

export const session = new SessionStore();
