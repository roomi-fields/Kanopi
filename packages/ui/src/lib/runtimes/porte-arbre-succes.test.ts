// L'ARBRE NE SE LIT QU'APRÈS UN SUCCÈS — décision Romain du 2026-08-19.
// ⛔ CE BANC EXISTE PARCE QUE LE DÉFAUT ÉTAIT VERT : mes portes décidaient sur la PRÉSENCE de
// l'arbre, et un refus de SENS rend un arbre COMPLET à côté de son erreur. Elles servaient donc
// une scène refusée comme si elle était bonne. Mesuré avant correction : la scène ci-dessous
// rendait 1 entrée déclarée.
import { describe, it, expect } from 'vitest';
import { sceneQuiEchoue } from '../library/scene-de-banc';
import { declaredInputsForScene, interpsForScene } from './bpx-adapter';

const TETE = 'core\nalphabet.western:audio\nin.midi pedale\n\n-----\n';
const VALIDE = TETE + 'S -> C4\n';
const REFUS_DE_SENS = TETE + 'S -> C4(volume:999999)\n';

describe("la porte d'entrée teste les erreurs, jamais la présence de l'arbre", () => {
  it('le témoin est NON NUL : la scène valide est bien servie', () => {
    expect(declaredInputsForScene(VALIDE).length).toBe(1);
  });

  it("le refus de SENS rend un arbre COMPLET — c'est ce qui rendait le défaut invisible", () => {
    // ⛔ LA PORTE VÉRIFIE CE DONT CE BANC A BESOIN : que la source est BIEN refusée. Le jour où elle
    // cesserait de l'être — un renommage, un cri levé — ce banc verdirait sur un sujet disparu ;
    // `sceneQuiEchoue` l'en empêche. Ce qu'il inspecte ENSUITE le regarde, et c'est justement l'arbre
    // que le refus rend encore aujourd'hui.
    const { ast, erreurs: errors } = sceneQuiEchoue(REFUS_DE_SENS);
    expect(errors.length).toBeGreaterThan(0);
    expect(ast).not.toBeNull();
    // L'arbre porte l'entrée déclarée : une porte qui teste `ast` la sert.
    expect(ast!.inputs?.length).toBe(1);
  });

  it('et pourtant la porte ne sert RIEN sur ce refus', () => {
    expect(declaredInputsForScene(REFUS_DE_SENS)).toEqual([]);
    expect(interpsForScene(REFUS_DE_SENS)).toEqual([]);
  });
});
