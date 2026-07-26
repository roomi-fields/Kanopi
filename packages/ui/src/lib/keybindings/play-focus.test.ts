// VERROUS DU FOCUS DE JEU — décision `hub/decisions/2026-07-26-clavier-le-focus-decide-pas-une-
// priorite-globale.md`. Ce que ces tests gardent, c'est l'ARBITRAGE, pas un raccourci :
//   • sans focus de jeu, Espace démarre le transport (le comportement d'avant ne bouge pas) ;
//   • focus de jeu pris, Espace ne touche PLUS au transport et n'est PAS consommé — la touche
//     nue revient à la performance, l'hôte s'abstient au lieu de gagner ;
//   • le hush (Cmd/Ctrl+.) reste atteignable EN JOUANT — sinon un focus pris serait un piège
//     sonore, et c'est la seule raison pour laquelle la ligne passe sur le modificateur ;
//   • le focus d'ÉDITION reste le plus spécifique : taper dans un champ tape, focus pris ou non ;
//   • Échap rend le focus — un mode qui capte les touches doit se quitter au clavier.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const playSpy = vi.fn();
const stopSpy = vi.fn();
const hushSpy = vi.fn();

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
vi.mock('../core', () => ({
  core: {
    hushAll: (...a: unknown[]) => hushSpy(...a),
    actors: { list: () => [], subscribe: () => () => {} },
    scenes: { list: () => [], activate: () => {}, subscribe: () => () => {} },
    console: { push: () => {} }
  }
}));

const { handleGlobalKey } = await import('./bindings');
const { playFocus } = await import('../../stores/play-focus.svelte');

/** Un événement clavier réel (jsdom) : `preventDefault` est OBSERVABLE via `defaultPrevented`,
 *  ce qui est exactement la question — l'hôte a-t-il CONSOMMÉ la touche ou s'est-il abstenu ? */
function key(init: KeyboardEventInit & { target?: HTMLElement }): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { cancelable: true, ...init });
  if (init.target) Object.defineProperty(e, 'target', { value: init.target });
  return e;
}

beforeEach(() => {
  playSpy.mockClear();
  stopSpy.mockClear();
  hushSpy.mockClear();
  playFocus.release();
});

describe('focus de jeu — le contexte décide, jamais une priorité globale', () => {
  it('sans focus de jeu : Espace démarre le transport et la touche est consommée', () => {
    const e = key({ code: 'Space', key: ' ' });
    handleGlobalKey(e);
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it('focus de jeu pris : Espace ne touche pas au transport ET n’est pas consommé', () => {
    playFocus.take('scene');
    const e = key({ code: 'Space', key: ' ' });
    handleGlobalKey(e);
    expect(playSpy).not.toHaveBeenCalled();
    expect(stopSpy).not.toHaveBeenCalled();
    // Pas de `preventDefault` : le périphérique clavier de `runtime-in` reçoit la touche.
    expect(e.defaultPrevented).toBe(false);
  });

  it('focus de jeu pris : le hush Cmd/Ctrl+. passe toujours (pas de piège sonore)', () => {
    playFocus.take();
    const e = key({ key: '.', ctrlKey: true });
    handleGlobalKey(e);
    expect(hushSpy).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it('focus de jeu pris : Échap le rend', () => {
    playFocus.take('scene');
    expect(playFocus.held).toBe(true);
    const e = key({ key: 'Escape' });
    handleGlobalKey(e);
    expect(playFocus.held).toBe(false);
    expect(playFocus.source).toBe(null);
    // …et Espace redevient le transport aussitôt.
    const space = key({ code: 'Space', key: ' ' });
    handleGlobalKey(space);
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it('le focus d’ÉDITION reste plus spécifique : dans un champ, Espace ne joue pas — focus de jeu ou non', () => {
    const input = document.createElement('input');
    handleGlobalKey(key({ code: 'Space', key: ' ', target: input }));
    expect(playSpy).not.toHaveBeenCalled();
    playFocus.take();
    handleGlobalKey(key({ code: 'Space', key: ' ', target: input }));
    expect(playSpy).not.toHaveBeenCalled();
  });

  it('l’étiquette de source est de l’affichage : elle ne décide de rien', () => {
    playFocus.take();
    expect(playFocus.held).toBe(true);
    expect(playFocus.source).toBe(null);
    const e = key({ code: 'Space', key: ' ' });
    handleGlobalKey(e);
    expect(playSpy).not.toHaveBeenCalled();
  });
});
