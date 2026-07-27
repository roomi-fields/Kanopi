// L'ASSOCIATION rôle → appareil — et elle vit HORS DE LA SCÈNE, délibérément.
//
// Décision `hub/decisions/2026-07-27-forme-des-entrees-in-mapping-adresse-nue.md` : « la scène
// nomme un RÔLE, l'utilisateur fait l'association, et l'association vit hors de la scène ». Un nom
// de port vient du système et change de machine, de pilote, parfois de prise — une scène qui le
// coderait ne s'ouvrirait plus ailleurs. C'est exactement le modèle des stations audio.
//
// C'EST LE SEUL ÉTAT MUTABLE QUE L'HÔTE POSSÈDE ICI (contrat `kanopi-architecture.md` : la saisie
// utilisateur locale). Tout le reste est une projection : les rôles viennent de la scène, les ports
// viennent du périphérique. Rien n'est inventé — un rôle sans association n'a PAS d'appareil par
// défaut, et ça se voit à l'écran.
//
// CE QUE CE FICHIER NE FAIT PAS : router. Associer un événement reçu au rôle qui l'attend est le
// mandat du routeur de BPx (`entrees/routeur.ts`), en aval (contrat `hub/contrats/hote-runtime-
// in.md`). Ici on retient un choix d'utilisateur, on ne traduit rien — et `pourRoutage()` ne fait
// que le PORTER jusqu'à ce routeur, dans la forme qu'il attend.

const CLE = 'kanopi.input-bindings.v1';

/** L'appareil associé à un rôle. Une seule forme pour les trois canaux : ce que l'utilisateur a
 *  choisi, tel que `runtime-in` l'attend dans `open(config)`. */
export interface InputBinding {
  /** MIDI : l'identifiant du port choisi (`PortInfo.id`) — l'identifiant, pas le nom : deux ports
   *  peuvent porter le MÊME nom. */
  portId?: string;
  /** MIDI : le nom vu au moment du choix, POUR L'AFFICHAGE seulement — il permet de dire
   *  « associé à X, absent aujourd'hui » plutôt que de montrer un identifiant nu. */
  portName?: string;
  /** OSC : le point d'écoute, tel que l'utilisateur l'a saisi. */
  address?: string;
  /** OSC : le port d'écoute. */
  port?: number;
}

function charger(): Record<string, InputBinding> {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return {};
    const lu: unknown = JSON.parse(brut);
    if (!lu || typeof lu !== 'object' || Array.isArray(lu)) return {};
    return lu as Record<string, InputBinding>;
  } catch {
    /* stockage indisponible ou contenu illisible : on repart sans association, jamais sur une
       association devinée. */
    return {};
  }
}

class InputBindingsStore {
  /** Par nom de RÔLE — pas par scène : le même rôle joué depuis deux pièces désigne la même
   *  pédale sur CETTE machine, et c'est le geste que fait un musicien une fois pour toutes. */
  byRole = $state<Record<string, InputBinding>>(charger());

  for(role: string): InputBinding | undefined {
    return this.byRole[role];
  }

  set(role: string, binding: InputBinding) {
    this.byRole = { ...this.byRole, [role]: binding };
    this.persister();
  }

  /**
   * [994] LES ASSOCIATIONS, DANS LA FORME QU'ATTEND LE ROUTEUR (`AssociationEntree` de BPx) : le
   * rôle et le PORT associé, rien d'autre. Le nom d'affichage et le point d'écoute OSC restent ici
   * — ils servent l'écran, pas la résolution.
   *
   * Une association SANS port (rôle clavier : il n'y a rien à choisir) ne dit rien au routeur et
   * n'est pas portée : la porter avec `source` absent ferait une association vide, indiscernable
   * d'un « tout port de ce canal » explicite.
   */
  pourRoutage(): readonly { role: string; source?: string }[] {
    return Object.entries(this.byRole)
      .filter(([, b]) => b.portId !== undefined)
      .map(([role, b]) => ({ role, source: b.portId as string }));
  }

  clear(role: string) {
    const suite = { ...this.byRole };
    delete suite[role];
    this.byRole = suite;
    this.persister();
  }

  private persister() {
    try {
      localStorage.setItem(CLE, JSON.stringify(this.byRole));
    } catch {
      /* persistance au mieux — l'association tient pour la session même si l'écriture échoue. */
    }
  }
}

export const inputBindings = new InputBindingsStore();
