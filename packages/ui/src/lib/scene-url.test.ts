import { describe, it, expect, afterEach } from 'vitest';
import { sceneDemandeeParUrl } from './scene-url';

const poser = (query: string) => {
  // @ts-expect-error — on installe un `window` minimal, comme le fait le banc de `?seed=`.
  globalThis.window = { location: { search: query } };
};
afterEach(() => {
  // @ts-expect-error — nettoyage : sans lui, un banc suivant hériterait de cette URL.
  delete globalThis.window;
});

describe('la scène demandée par l’URL', () => {
  it('rend l’identifiant de catalogue tel quel', () => {
    poser('?scene=strudel/09-gm-piano-general-midi.bps');
    expect(sceneDemandeeParUrl()).toBe('strudel/09-gm-piano-general-midi.bps');
  });

  it('composable avec les autres paramètres — l’URL de test en porte déjà', () => {
    poser('?seed=42&scene=learn/tuto-01-first-note.bps&events');
    expect(sceneDemandeeParUrl()).toBe('learn/tuto-01-first-note.bps');
  });

  // ⚠️ LE CAS QUI COMPTE LE PLUS : sans paramètre, RIEN ne doit changer. Une ouverture surprise
  // au démarrage toucherait un utilisateur qui n'a rien demandé — et elle ne rougirait nulle part.
  it('ABSENT : rien — le démarrage ordinaire est strictement intact', () => {
    poser('');
    expect(sceneDemandeeParUrl()).toBeUndefined();
    poser('?seed=42');
    expect(sceneDemandeeParUrl()).toBeUndefined();
  });

  it('vide ou remontant hors du corpus : rien, sans bruit', () => {
    poser('?scene=');
    expect(sceneDemandeeParUrl()).toBeUndefined();
    poser('?scene=%20%20');
    expect(sceneDemandeeParUrl()).toBeUndefined();
    poser('?scene=../../etc/passwd');
    expect(sceneDemandeeParUrl()).toBeUndefined();
  });

  // Sans `window` (vitest sans jsdom, rendu serveur) : pas d'exception, pas d'ouverture.
  it('sans window : rien, et surtout pas une exception', () => {
    expect(sceneDemandeeParUrl()).toBeUndefined();
  });
});
