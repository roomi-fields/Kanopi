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
   * [994]/[869] LES ASSOCIATIONS, DANS LA FORME QU'ATTEND LE ROUTEUR (`AssociationEntree` de BPx) :
   * le rôle et l'IDENTITÉ de l'appareil, rien d'autre. Le nom d'affichage et le point d'écoute OSC
   * restent ici — ils servent l'écran, pas la résolution.
   *
   * ⚠️ C'EST `sourceId` ET PLUS `source`, et ce n'est pas un renommage : je remettais déjà
   * l'IDENTIFIANT du port, mais le routeur le comparait à l'ÉTIQUETTE que `runtime-in` posait (le
   * nom du port). Les deux ne se rencontraient jamais — masqué tant qu'un canal n'a qu'un rôle,
   * fatal dès deux pédales. BPx a retiré l'étiquette de sa surface, l'identité est exigée des deux
   * côtés, et la faute est devenue impossible à écrire.
   *
   * Une association SANS identité n'est PAS portée : la clause « absent égale tout » a été retirée
   * en amont, pas assouplie — deux absences s'y comparaient ÉGALES, et le second appareil n'était
   * jamais servi sans qu'une seule erreur le dise.
   */
  pourRoutage(): readonly { role: string; sourceId: string }[] {
    return Object.entries(this.byRole)
      .filter(([, b]) => b.portId !== undefined)
      .map(([role, b]) => ({ role, sourceId: b.portId as string }));
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
