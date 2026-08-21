// L'ARBRE NE SE LIT QU'APRÈS UN SUCCÈS — décision Romain du 2026-08-19.
// ⛔ CE BANC EXISTE PARCE QUE LE DÉFAUT ÉTAIT VERT : mes portes décidaient sur la PRÉSENCE de
// l'arbre, et un refus de SENS rendait alors un arbre COMPLET à côté de son erreur. Elles
// servaient donc une scène refusée comme si elle était bonne. Mesuré avant correction : la scène
// ci-dessous rendait 1 entrée déclarée.
//
// ⚠️ L'AMONT A FRAPPÉ LE 2026-08-21 (BPscript df09e67, « un compilateur qui refuse ne livre rien
// en aval ») : la porte PUBLIÉE ne rend plus d'arbre sur un refus, et l'étage de résolution — qui
// rend un arbre annoté à côté de ses erreurs — est devenu interne, hors de ma portée. Ce banc
// bascule dans le MÊME mouvement que sa frappe, comme convenu, ni avant ni après.
//
// CE QU'IL VERROUILLE NE CHANGE PAS : ma porte décide sur les ERREURS. Tester la présence de
// l'arbre rendrait aujourd'hui le même verdict, par accident — et redeviendrait aveugle le jour où
// l'amont rendrait de nouveau un arbre à côté de son refus. C'est le critère, pas le symptôme.
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

  it("le refus de SENS ne livre plus d'arbre — l'amont a retiré ce qui rendait le défaut invisible", () => {
    // ⛔ LA PORTE VÉRIFIE CE DONT CE BANC A BESOIN : que la source est BIEN refusée. Le jour où elle
    // cesserait de l'être — un renommage, un cri levé — ce banc verdirait sur un sujet disparu ;
    // `sceneQuiEchoue` l'en empêche.
    const { ast, erreurs: errors } = sceneQuiEchoue(REFUS_DE_SENS);
    expect(errors.length).toBeGreaterThan(0);
    expect(
      ast,
      "l'amont rend de nouveau un arbre sur un refus de SENS : une porte qui déciderait sur sa présence redevient aveugle — le volet suivant est le seul critère qui tienne"
    ).toBeNull();
  });

  it('et la porte ne sert RIEN sur ce refus', () => {
    expect(declaredInputsForScene(REFUS_DE_SENS)).toEqual([]);
    expect(interpsForScene(REFUS_DE_SENS)).toEqual([]);
  });
});
