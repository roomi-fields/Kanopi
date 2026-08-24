// VERROUS DU FOCUS DE JEU — modèle BITWIG (décision Romain 2026-07-28) : c'est LE VERROU DES
// MAJUSCULES qui arme le clavier de jeu, et lui seul. Ce que ces tests gardent, c'est l'ARBITRAGE
// et la PORTE UNIQUE, pas un raccourci :
//   • verrou relâché, Espace démarre le transport (le comportement d'avant ne bouge pas) ;
//   • verrou enclenché, Espace ne touche PLUS au transport et n'est PAS consommé — la touche nue
//     revient à la performance, l'hôte s'abstient au lieu de gagner ;
//   • le hush (Cmd/Ctrl+.) reste atteignable EN JOUANT — sinon un focus pris serait un piège
//     sonore, et c'est la seule raison pour laquelle la ligne passe sur le modificateur ;
//   • le focus d'ÉDITION reste le plus spécifique : taper dans un champ tape, verrou ou non ;
//   • l'état est INCONNU tant qu'aucun geste n'a été observé, et un inconnu ne capte RIEN ;
//   • un GESTE DE SOURIS suffit à le lever — c'est ce qui borne l'inconnu au premier contact.
//
// ⛔ CE QUI A DISPARU, ET QUE CES TESTS VERROUILLENT PAR L'ABSENCE : il n'y a plus ni prise par
// clic ni sortie par Échap. Deux façons d'armer le même mode, c'est la voie parallèle qui finit
// par diverger — Échap doit donc redevenir une touche ordinaire, et c'est mesuré ici.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createEventBus } from '../events/bus';
import { initAdapters } from '../runtimes/registry';

// Le registre se construit AVEC le bus, comme le cœur — chaque banc l'initialise lui-même.
initAdapters(createEventBus());

const playSpy = vi.fn();
const stopSpy = vi.fn();
const hushSpy = vi.fn();
const ouvrirClavierSpy = vi.fn(async () => {});
const fermerClavierSpy = vi.fn(async () => {});

vi.mock('../../stores/playback.svelte', () => ({
  playback: {
    get mode() {
      return 'stopped';
    },
    play: (...a: unknown[]) => playSpy(...a),
    stop: (...a: unknown[]) => stopSpy(...a)
  }
}));

// `core` est mocké au strict nécessaire : le garde n'appelle que `hushAll`, `actors.list` et
// `scenes.*`. Les `subscribe` sont là parce que les stores projetés (`actors`, `mixer`) s'abonnent
// à leur construction — importer `bindings` les monte en cascade.
// Les deux gestes de clavier sont là parce que PRENDRE le focus OUVRE le périphérique et le RENDRE
// le ferme (contrat `hote-runtime-in.md`) : c'est ce que les deux derniers verrous mesurent.
vi.mock('../core', () => ({
  core: {
    hushAll: (...a: unknown[]) => hushSpy(...a),
    openPlayKeyboard: () => ouvrirClavierSpy(),
    closePlayKeyboard: () => fermerClavierSpy(),
    actors: { list: () => [], subscribe: () => () => {} },
    scenes: { list: () => [], activate: () => {}, subscribe: () => () => {} },
    console: { push: () => {} }
  }
}));

const { handleGlobalKey } = await import('./bindings');
const { playFocus } = await import('../../stores/play-focus.svelte');

/** Un événement clavier réel (jsdom) : `preventDefault` est OBSERVABLE via `defaultPrevented`,
 *  ce qui est exactement la question — l'hôte a-t-il CONSOMMÉ la touche ou s'est-il abstenu ? */
/** L'ÉTAT DU CLAVIER EST GLOBAL, ET CHAQUE ÉVÉNEMENT LE PORTE — c'est le cœur du modèle, et le
 *  banc doit le refléter sous peine de mesurer une fiction : un vrai clavier dont le verrou est
 *  enclenché estampille TOUTES ses touches, pas seulement celle qui l'a basculé. (Découvert ici :
 *  un Échap fabriqué sans le drapeau « relâchait » le focus au passage — l'événement disait la
 *  vérité, c'est mon banc qui mentait.) */
let verrouEnclenche = false;

function key(init: KeyboardEventInit & { target?: HTMLElement }): KeyboardEvent {
  const e = new KeyboardEvent('keydown', {
    cancelable: true,
    modifierCapsLock: verrouEnclenche,
    ...init
  } as KeyboardEventInit);
  if (init.target) Object.defineProperty(e, 'target', { value: init.target });
  return e;
}

/** Le branchement part sur-le-champ (appel direct au cœur) ; seul le RETOUR d'échec est
 *  asynchrone — d'où ce passage de main pour le verrou du refus d'ouverture. */
const laisserVenir = () => new Promise((r) => setTimeout(r, 0));

/** ARMER COMME UN UTILISATEUR : on n'appelle aucune commande — on fait passer un événement qui
 *  PORTE le drapeau du verrou, exactement ce que produit un clavier dont la touche est enclenchée.
 *  Mesuré conforme dans le navigateur ET sous jsdom : `getModifierState('CapsLock')` rend `true`
 *  sur un événement construit avec `modifierCapsLock`. C'est aussi la seule voie dont dispose un
 *  banc — l'automatisation de navigateur ne sait pas basculer le vrai verrou (mesuré : il reste à
 *  `false` quelle que soit la façon de le frapper). */
function armerVerrou() {
  verrouEnclenche = true;
  playFocus.observer(new KeyboardEvent('keydown', { modifierCapsLock: true } as KeyboardEventInit));
}
function relacherVerrou() {
  verrouEnclenche = false;
  playFocus.observer(new KeyboardEvent('keydown'));
}

beforeEach(async () => {
  playSpy.mockClear();
  stopSpy.mockClear();
  hushSpy.mockClear();
  // On repart d'un état LU comme relâché — pas d'un état posé : la seule porte est l'observation.
  relacherVerrou();
  await laisserVenir();
  ouvrirClavierSpy.mockClear();
  fermerClavierSpy.mockClear();
});

describe('focus de jeu — le contexte décide, jamais une priorité globale', () => {
  it('sans focus de jeu : Espace démarre le transport et la touche est consommée', () => {
    const e = key({ code: 'Space', key: ' ' });
    handleGlobalKey(e);
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it('verrou enclenché : Espace ne touche pas au transport ET n’est pas consommé', () => {
    armerVerrou();
    const e = key({ code: 'Space', key: ' ' });
    handleGlobalKey(e);
    expect(playSpy).not.toHaveBeenCalled();
    expect(stopSpy).not.toHaveBeenCalled();
    // Pas de `preventDefault` : le périphérique clavier de `runtime-in` reçoit la touche.
    expect(e.defaultPrevented).toBe(false);
  });

  it('verrou enclenché : le hush Cmd/Ctrl+. passe toujours (pas de piège sonore)', () => {
    armerVerrou();
    const e = key({ key: '.', ctrlKey: true });
    handleGlobalKey(e);
    expect(hushSpy).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it('ÉCHAP NE REND PLUS RIEN — la sortie par touche a disparu avec la prise par clic', () => {
    // Le verrou de l'ABSENCE : tant que le vrai verrou est enclenché, Échap est une touche
    // ordinaire qui part à la performance. Une sortie de secours au clavier serait une seconde
    // façon de changer le même état — et l'écran mentirait aussitôt, puisqu'il reflète le voyant
    // du clavier, lequel resterait allumé.
    armerVerrou();
    expect(playFocus.held).toBe(true);
    const e = key({ key: 'Escape' });
    handleGlobalKey(e);
    expect(playFocus.held).toBe(true);
    expect(e.defaultPrevented).toBe(false);
    // …et Espace ne redevient le transport QUE lorsque le verrou est relâché.
    handleGlobalKey(key({ code: 'Space', key: ' ' }));
    expect(playSpy).not.toHaveBeenCalled();
    relacherVerrou();
    handleGlobalKey(key({ code: 'Space', key: ' ' }));
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it('TANT QU’ON N’A RIEN LU, l’état est INCONNU — et un inconnu ne capte rien', () => {
    // Aucune interrogation globale ne donne l'état du verrou : au chargement on ne SAIT pas.
    // Afficher « relâché » serait affirmer ce qu'on ignore ; capter les touches sur cette
    // supposition serait pire encore. Espace reste donc au transport.
    playFocus.etat = 'inconnu';
    expect(playFocus.held).toBe(false);
    // Un événement dont l'état de verrou est ILLISIBLE ne dit RIEN : il ne doit pas faire retomber
    // l'inconnu sur « relâché ». Espace, lui, reste au transport — un inconnu ne capte rien.
    const e = key({ code: 'Space', key: ' ' });
    Object.defineProperty(e, 'getModifierState', {
      value: () => {
        throw new Error('état du verrou illisible');
      }
    });
    handleGlobalKey(e);
    expect(playFocus.etat).toBe('inconnu');
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it('UN GESTE DE SOURIS lève l’inconnu — c’est ce qui le borne au premier contact', () => {
    playFocus.etat = 'inconnu';
    playFocus.observer(new MouseEvent('mousedown', { modifierCapsLock: true } as MouseEventInit));
    expect(playFocus.etat).toBe('pris');
    playFocus.observer(new MouseEvent('mousedown'));
    expect(playFocus.etat).toBe('rendu');
  });

  it('le focus d’ÉDITION reste plus spécifique : dans un champ, Espace ne joue pas — focus de jeu ou non', () => {
    const input = document.createElement('input');
    handleGlobalKey(key({ code: 'Space', key: ' ', target: input }));
    expect(playSpy).not.toHaveBeenCalled();
    armerVerrou();
    handleGlobalKey(key({ code: 'Space', key: ' ', target: input }));
    expect(playSpy).not.toHaveBeenCalled();
  });

  // ── LE BRANCHEMENT DU PÉRIPHÉRIQUE ────────────────────────────────────────────────────────
  // « L'hôte l'ouvre quand le jeu a la main et le ferme quand il la perd. C'est tout le protocole
  // de focus qu'il connaît » (`runtime-in/src/devices/keyboard.js`, en-tête « CE QU’IL NE DÉCIDE PAS : le focus »).
  it('enclencher le verrou OUVRE le clavier de jeu', () => {
    armerVerrou();
    expect(ouvrirClavierSpy).toHaveBeenCalledTimes(1);
    expect(fermerClavierSpy).not.toHaveBeenCalled();
  });

  it('relâcher le verrou FERME le clavier', () => {
    // Le branchement vit dans le store, sur la porte d'observation — donc il suit le verrou quel
    // que soit le geste qui l'a révélé (touche ou souris), et non un bouton qui n'existe plus.
    armerVerrou();
    relacherVerrou();
    expect(playFocus.held).toBe(false);
    expect(fermerClavierSpy).toHaveBeenCalledTimes(1);
  });

  it('DEUX prises de suite branchent DEUX fois — le second relâchement ferme aussi', () => {
    // Ce verrou vient d'un vrai défaut trouvé ici : avec un import tardif du cœur, la promesse du
    // DEUXIÈME relâchement restait pendante et le périphérique continuait d'écouter, sans un mot.
    // Un branchement qui ne tient que la première fois est pire qu'un branchement absent.
    armerVerrou();
    relacherVerrou();
    armerVerrou();
    relacherVerrou();
    expect(ouvrirClavierSpy).toHaveBeenCalledTimes(2);
    expect(fermerClavierSpy).toHaveBeenCalledTimes(2);
  });

  it('un clavier qui refuse de s’ouvrir RELÂCHE le focus — un mode qui n’écoute rien ne se tient pas', async () => {
    ouvrirClavierSpy.mockRejectedValueOnce(new Error('aucune cible qui écoute'));
    armerVerrou();
    expect(playFocus.held).toBe(true); // pris tout de suite…
    await laisserVenir();
    // …puis INCONNU, surtout pas « relâché » : le verrou, lui, est bel et bien enclenché ; dire le
    // contraire ferait mentir le miroir sur l'état d'une touche qu'on ne commande pas.
    expect(playFocus.etat).toBe('inconnu');
    expect(playFocus.held).toBe(false);
  });

  it('OBSERVER DEUX FOIS LE MÊME ÉTAT ne rebranche rien (idempotence)', () => {
    // Chaque frappe passe par la porte : sans idempotence, jouer rouvrirait le périphérique à
    // chaque touche — et un périphérique rouvert sous les doigts perd son écoute en silence.
    armerVerrou();
    armerVerrou();
    armerVerrou();
    expect(ouvrirClavierSpy).toHaveBeenCalledTimes(1);
  });
});
