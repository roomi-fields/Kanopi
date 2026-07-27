// LE FOCUS DE JEU — le contexte qui décide à qui appartient une touche.
//
// Décision `hub/decisions/2026-07-26-clavier-le-focus-decide-pas-une-priorite-globale.md`
// (Romain) : quand une scène capte la barre d'espace, NI le transport NI le contenu ne gagne
// dans l'absolu — c'est le CONTEXTE FOCALISÉ qui tranche, comme le `editorTextFocus` de VSCode
// (le contexte le plus spécifique gagne) et comme le mode d'assignation d'Ableton (les
// raccourcis normaux sont suspendus le temps du geste).
//
// « La bonne analogie n'est pas le raccourci, c'est le MIDI learn » : une scène qui attend une
// touche ne rajoute pas un raccourci, elle déclare une ENTRÉE DE PERFORMANCE. Le focus d'ÉDITION
// existait déjà (`bindings.ts:inEditableTarget`) ; il manquait ce second contexte.
//
// CE QUE CE STORE EST, ET CE QU'IL N'EST PAS. C'est de l'INTERFACE, pas du périphérique :
// contrat `hub/contrats/hote-runtime-in.md` § « Ce qui reste chez l'hôte » — l'hôte tient le bus,
// capte le geste de connexion et arbitre le focus ; toute la logique de périphérique (écouteurs
// clavier, décodage, autorisation) vit dans `runtime-in`. Ce fichier ne pose donc AUCUN écouteur
// clavier de jeu, ne connaît AUCUNE touche, et ne résout AUCUN nom : il porte un état d'interface
// que le garde des raccourcis (`bindings.ts`) consulte.
//
// CE QU'IL FAIT EN PLUS, ET POURQUOI C'EST ICI. Prendre le focus OUVRE le clavier de jeu, le rendre
// le FERME — « l'hôte l'ouvre quand le jeu a la main et le ferme quand il la perd. C'est tout le
// protocole de focus qu'il connaît » (`runtime-in/src/devices/keyboard.js:9-11`). Le branchement
// vit ICI et nulle part ailleurs parce que le focus se rend par TROIS chemins — le badge, Échap
// (`bindings.ts`), la façade de pilotage — et qu'un branchement posé sur le bouton laisserait le
// périphérique écouter après un Échap, en silence.
//
// L'IMPORT DU CŒUR EST DIRECT, et c'est un choix mesuré : la version tardive (`import()` dans la
// méthode) échouait à brancher au DEUXIÈME relâchement d'une même page — la promesse d'import
// restait pendante, donc le périphérique continuait d'écouter en silence. Un branchement qui ne
// tient que la première fois est pire qu'un branchement absent. L'import direct ne coûte rien ici :
// le garde des raccourcis (`bindings.ts`) charge déjà le cœur pour le hush.
import { core } from '../lib/core';

class PlayFocusStore {
  /** Vrai quand une surface de jeu détient le focus : les raccourcis d'interface qui pourraient
   *  entrer en concurrence avec la performance se taisent (cf. `bindings.ts`). */
  held = $state(false);

  /** Qui l'a pris — étiquette d'affichage seulement (jamais consultée pour décider). `null`
   *  quand personne ne le détient. Aucun défaut inventé : sans étiquette fournie, c'est `null`
   *  et l'affichage se contente de dire que le focus est pris. */
  source = $state<string | null>(null);

  take(source?: string) {
    this.held = true;
    this.source = source ?? null;
    // UN FOCUS QUI N'ÉCOUTE RIEN NE SE TIENT PAS. Si l'ouverture échoue (aucun périphérique
    // clavier fourni, cible sans écoute), le cœur l'a déjà crié en erreur ; ici on RELÂCHE, pour
    // que le badge ne dise pas « les touches vont au jeu » alors que personne ne les reçoit.
    void core.openPlayKeyboard().catch(() => {
      this.held = false;
      this.source = null;
    });
  }

  release() {
    this.held = false;
    this.source = null;
    void core.closePlayKeyboard().catch(() => {});
  }

  toggle(source?: string) {
    if (this.held) this.release();
    else this.take(source);
  }
}

export const playFocus = new PlayFocusStore();
