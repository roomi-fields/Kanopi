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
// que le garde des raccourcis (`bindings.ts`) consulte, rien de plus.
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
  }

  release() {
    this.held = false;
    this.source = null;
  }

  toggle(source?: string) {
    if (this.held) this.release();
    else this.take(source);
  }
}

export const playFocus = new PlayFocusStore();
