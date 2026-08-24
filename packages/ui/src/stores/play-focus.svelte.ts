// LE FOCUS DE JEU — c'est LE VERROU DES MAJUSCULES qui l'arme, et rien d'autre.
//
// Décision Romain 2026-07-28 : « pour le focus on fait comme Bitwig. » Le verrou arme l'entrée de
// notes, et leur documentation ASSUME la conséquence en toutes lettres — les raccourcis normaux
// cessent de répondre, et si les vôtres ne marchent plus, vérifiez que le verrou n'est pas resté
// enclenché. Le piège de la barre d'espace ne se résout donc pas : il s'ASSUME, et il se VOIT.
//
// POURQUOI CETTE TOUCHE-LÀ ET PAS UN BOUTON. Elle a un ÉTAT et un VOYANT PHYSIQUE sur le clavier :
// le témoin est SOUS LES DOIGTS, pas dans un coin d'écran. Notre badge cliquable était exactement
// l'inverse — Romain a cru à une régression parce que le focus était éteint sans que rien ne le lui
// dise assez fort. Un voyant qu'on ne peut pas rater bat une pastille grise au milieu de compteurs.
//
// CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS. De l'INTERFACE, pas du périphérique (contrat
// `hub/contrats/hote-runtime-in.md` § « Ce qui reste chez l'hôte ») : il porte un état que le garde
// des raccourcis consulte, et il OUVRE/FERME le clavier de jeu — « l'hôte l'ouvre quand le jeu a la
// main et le ferme quand il la perd, c'est tout le protocole de focus qu'il connaît »
// (`runtime-in/src/devices/keyboard.js`, en-tête « CE QU’IL NE DÉCIDE PAS : le focus »). Il ne pose AUCUN écouteur de touche de jeu, ne
// connaît AUCUNE touche, ne résout AUCUN nom.
//
// ⛔ UNE SEULE PORTE, ET ELLE NE SE COMMANDE PAS. Le badge cliquable et la sortie par Échap ont été
// RETIRÉS dans le même mouvement : deux façons d'armer le même mode, c'est la voie parallèle qui
// finit par diverger. On ne peut ni allumer ni éteindre le voyant d'un clavier depuis une page —
// l'écran REFLÈTE donc l'état, il ne le commande pas. Il n'y a plus rien à « prendre » : il y a un
// verrou, et un miroir.
//
// ⚠️ ET L'ÉTAT PEUT ÊTRE INCONNU — c'est la seule concession, mesurée et bornée. L'état du verrou
// n'est lisible QUE sur un ÉVÉNEMENT D'ENTRÉE (`getModifierState`) : aucune interrogation globale
// n'existe, donc il n'est PAS connaissable au chargement. Mais il l'est dès le PREMIER GESTE, y
// compris un simple clic — l'événement de souris le porte aussi. L'inconnu ne survit donc pas au
// premier contact avec la fenêtre, et pour jouer il faut de toute façon y cliquer.
// AFFICHER « INCONNU », JAMAIS « ÉTEINT » tant qu'on n'a pas lu : un éteint faux est pire qu'un
// inconnu assumé — c'est la règle qui vaut partout ici, aucune valeur ne se lit par une absence.
//
// ✅ ÉPROUVÉ AU DOIGT le 2026-07-28 : Romain a basculé le vrai verrou physique, et le focus a suivi.
// Ça compte parce qu'aucun banc ne peut le faire — l'automatisation de navigateur ne bascule pas le
// verrou (mesuré), donc les tests l'arment avec des événements qui portent le drapeau. Le geste réel
// a confirmé ce que le simulé annonçait.
import { core } from '../lib/core';

/** `inconnu` tant qu'aucun geste n'a été observé ; ensuite ce que le verrou dit. */
export type EtatFocusJeu = 'inconnu' | 'pris' | 'rendu';

class PlayFocusStore {
  /** L'état LU sur le dernier événement observé. Jamais posé par une commande. */
  etat = $state<EtatFocusJeu>('inconnu');

  /** Vrai UNIQUEMENT quand le verrou a été lu comme enclenché. Un état inconnu ne capte rien :
   *  détourner les touches de l'interface sur une supposition serait le pire des deux mondes. */
  get held(): boolean {
    return this.etat === 'pris';
  }

  /**
   * LA PORTE UNIQUE — tout événement d'entrée qui porte l'état du verrou passe par ici.
   *
   * Appelée sur les touches ET sur les gestes de souris (contrat : l'événement de souris porte le
   * même drapeau), pour que l'inconnu tombe au premier contact plutôt qu'à la première frappe.
   * Idempotente : un état inchangé ne rouvre ni ne referme le périphérique.
   */
  observer(e: { getModifierState?(cle: string): boolean }): void {
    if (typeof e?.getModifierState !== 'function') return;
    let verrou: boolean;
    try {
      verrou = e.getModifierState('CapsLock');
    } catch {
      // Une implémentation qui ne connaît pas cette clé ne dit pas « éteint » : elle ne dit RIEN.
      return;
    }
    const suivant: EtatFocusJeu = verrou ? 'pris' : 'rendu';
    if (suivant === this.etat) return;
    this.etat = suivant;
    if (verrou) {
      // UN FOCUS QUI N'ÉCOUTE RIEN NE SE TIENT PAS : si l'ouverture échoue (aucun périphérique
      // clavier fourni), le cœur l'a déjà crié, et on retombe à INCONNU — surtout pas à « rendu »,
      // qui affirmerait que le verrou est relâché alors qu'il est enclenché.
      void core.openPlayKeyboard().catch(() => {
        this.etat = 'inconnu';
      });
    } else {
      void core.closePlayKeyboard().catch(() => {});
    }
  }
}

export const playFocus = new PlayFocusStore();
