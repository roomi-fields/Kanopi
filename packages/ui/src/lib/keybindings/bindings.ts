import { ui } from '../../stores/ui.svelte';
import { playback } from '../../stores/playback.svelte';
import { workspace } from '../../stores/workspace.svelte';
import { cloudDocs } from '../../stores/cloud-docs.svelte';
import { session } from '../../stores/session.svelte';
import { mixer } from '../../stores/mixer.svelte';
import { playFocus } from '../../stores/play-focus.svelte';
import { core } from '../core';
import { flushPersist } from '../persistence/snapshot.svelte';

export function isMod(e: KeyboardEvent) {
  return e.metaKey || e.ctrlKey;
}

function inEditableTarget(e: KeyboardEvent): boolean {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA';
}

export function handleGlobalKey(e: KeyboardEvent) {
  // LE VERROU EST LU ICI, SUR L'ÉVÉNEMENT — il n'existe aucune autre façon de le connaître (pas
  // d'interrogation globale). C'est donc chaque geste qui met le focus de jeu à jour, et l'état
  // « inconnu » du chargement tombe au premier d'entre eux.
  playFocus.observer(e);
  // LE FOCUS DE JEU DÉCIDE — décision Romain 2026-07-26 (« le focus décide, pas une priorité
  // globale »). Une scène qui a déclaré un périphérique clavier capte ses touches QUAND ELLE A LE
  // FOCUS DE JEU ; hors de ce focus, l'interface garde ses raccourcis. Aucun camp ne gagne dans
  // l'absolu, exactement comme le contexte `editorTextFocus` de VSCode : le plus spécifique gagne.
  //
  // LA LIGNE EXACTE, et pourquoi elle passe là :
  //   • le focus d'ÉDITION reste le plus spécifique des deux — taper dans un champ doit taper,
  //     même focus de jeu pris (d'où le `!inEditableTarget`, garde qui existait déjà) ;
  //   • une touche NUE (et toute combinaison sans Cmd/Ctrl, Alt comprise) appartient alors à la
  //     performance : on rend la main SANS `preventDefault`, donc le périphérique clavier de
  //     `runtime-in` la reçoit — l'hôte ne consomme pas, il s'abstient ;
  //   • les raccourcis à Cmd/Ctrl restent à l'interface. Ce n'est pas un compromis mou : le hush
  //     (Cmd/Ctrl+.) doit rester atteignable EN JOUANT, sinon un focus pris deviendrait un piège
  //     sonore. Même raison pour Échap ci-dessous : un mode qui capte les touches doit se quitter
  //     au clavier, pas seulement à la souris.
  // Ce garde est de l'INTERFACE (contrat `hote-runtime-in.md` § « Ce qui reste chez l'hôte ») :
  // il n'écoute aucune touche de jeu, n'en connaît aucune, n'en résout aucun nom.
  if (playFocus.held && !inEditableTarget(e)) {
    if (!isMod(e)) return;
  }
  // Cmd/Ctrl + K (primary) or Cmd/Ctrl + Shift + P (alt) → open palette
  if (isMod(e) && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    ui.togglePalette();
    return;
  }
  if (isMod(e) && e.shiftKey && (e.key === 'p' || e.key === 'P')) {
    e.preventDefault();
    ui.togglePalette();
    return;
  }
  // Cmd/Ctrl + . → hush all (Tidal convention)
  if (isMod(e) && !e.shiftKey && !e.altKey && e.key === '.') {
    e.preventDefault();
    void core.hushAll();
    return;
  }
  // Cmd/Ctrl + S → force-save workspace. Autosave already persists on every
  // mutation, but the browser's default behavior (save HTML page) is jarring
  // and a user's finger-memory expects *something* to happen. We swallow the
  // event and flush synchronously; a debug log shows up in the console.
  if (isMod(e) && !e.shiftKey && !e.altKey && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    flushPersist();
    core.console.push({ runtime: 'kanopi', level: 'info', msg: 'workspace saved' });
    // Espace perso cloud (Lot A1, ESPACE_PERSO_SPEC §4.3) : ⌘S sur le fichier ACTIF.
    // Doc cloud → déjà en auto-save, rien de destructif à faire ici (la puce d'état de
    // TabBar reflète déjà « enregistré »/« enregistrement… »). Copie de bibliothèque ou
    // brouillon local ÉDITABLE + connecté → promotion explicite (même commande que le
    // bouton « Enregistrer chez moi »). Déconnecté → ouvre le panneau Compte (pas de
    // sauvegarde cloud possible sans session). Une collision de chemin est laissée au
    // bouton « Enregistrer sous… » visible (pas d'écrasement silencieux depuis le clavier).
    const active = workspace.activeTabId ? workspace.fileById(workspace.activeTabId) : undefined;
    if (active && !active.readOnly && !cloudDocs.isCloudDoc(active.id)) {
      if (!session.session) {
        ui.activeActivityView = 'account';
      } else if (!cloudDocs.pathExistsInCloud(active.path)) {
        void cloudDocs.saveToCloud(active.id);
      }
    }
    return;
  }
  // Cmd/Ctrl + 1..9 → toggle mute on the Nth actor (atom-tidalcycles).
  // Cmd/Ctrl + 0 → unmute every actor.
  // Le mute PERSISTANT du mixer est le seul mute (Romain 2026-07-24 : l'ancien mute
  // d'armement faisait double emploi avec le désarmement) — ces raccourcis pilotent
  // donc la couche mixer, celle qui survit au stop→play.
  if (isMod(e) && !e.shiftKey && !e.altKey && /^[0-9]$/.test(e.key)) {
    const n = Number(e.key);
    e.preventDefault();
    if (n === 0) {
      for (const a of core.actors.list()) mixer.setActorMuted(a.name, false);
    } else {
      const target = core.actors.list()[n - 1];
      if (target) mixer.toggleActorMuted(target.name);
    }
    return;
  }
  // Alt + 1..9 → activate scene N (Kanopi-specific; Tidal has no scene concept).
  if (!isMod(e) && !e.shiftKey && e.altKey && /^[1-9]$/.test(e.key)) {
    const n = Number(e.key);
    const target = core.scenes.list()[n - 1];
    if (target) {
      e.preventDefault();
      core.scenes.activate(target.name);
    }
    return;
  }
  // Space toggles play/stop only if not editing. Route through `playback` (not the
  // raw clock) so a Play-from-stopped runs the explicit armed-block eval — same
  // entry as the Play button and the `clock.toggle` command.
  if (e.code === 'Space' && !inEditableTarget(e) && !isMod(e) && !e.altKey) {
    e.preventDefault();
    // 'playing' → stop; 'stopped' OR 'paused' → play(). play() resumes a paused
    // transport in place (position kept), starts a stopped one — so Space resumes
    // from pause instead of dropping to stop and losing the playhead.
    if (playback.mode === 'playing') playback.stop();
    else playback.play();
  }
}

/** Un geste de SOURIS porte le même drapeau de verrou qu'une touche — et c'est ce qui fait tomber
 *  l'état « inconnu » sans rien demander à personne : pour jouer, on clique forcément dans la
 *  fenêtre. Lecture SEULE, aucun raccourci ne dépend de la souris. */
function observerGeste(e: MouseEvent) {
  playFocus.observer(e);
}

export function installGlobalKeybindings() {
  // Capture phase so we beat the browser's Ctrl+1..9 tab-switch accelerator.
  const opts: AddEventListenerOptions = { capture: true };
  window.addEventListener('keydown', handleGlobalKey, opts);
  window.addEventListener('mousedown', observerGeste, opts);
  return () => {
    window.removeEventListener('keydown', handleGlobalKey, opts);
    window.removeEventListener('mousedown', observerGeste, opts);
  };
}
