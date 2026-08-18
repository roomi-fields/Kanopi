import { describe, it, expect } from 'vitest';
import { compileToBPxAST } from 'bpscript/src/transpiler/index.js';
import { mmFromAst } from './bpx-adapter';

// UNE SCÈNE QUI DÉCLARE UN TEMPO EST LUE À CE TEMPO — le garde qui manquait.
//
// ⚠️ CE QU'IL RÉPARE, ET LE COÛT QU'IL A DÉJÀ EU : du 2026-07-09 au 2026-08-10, `mmFromAst`
// cherchait la directive sous un nom que l'arbre de bpscript ne portait pas encore. Il rendait donc
// TOUJOURS `undefined` — et son appelant lit cette absence comme « la scène ne déclare rien, applique
// le tempo de session » (`declaredMm == null`, bpx-adapter.ts:1961 et 2562). Une scène écrite à 70
// se dérivait au tempo du transport, PENDANT UN MOIS.
//
// PERSONNE NE POUVAIT LE VOIR : le défaut ne produit ni erreur, ni silence, ni rouge — il produit
// LE MAUVAIS TEMPO. Tous mes bancs de son vérifient qu'une scène SONNE ; aucun ne vérifiait à
// quelle VITESSE. « Ça sonne » ne dit rien de « ça sonne juste ».
//
// ⚠️ ET IL LIT L'ARBRE RÉEL, JAMAIS UNE MAQUETTE. C'est le point : un banc nourri d'un objet écrit
// à la main aurait passé tout ce mois, puisqu'on l'aurait écrit avec le nom que le lecteur attend.
// Ce qui a menti, ce n'est ni le lecteur seul ni l'arbre seul — c'est LE COUPLE. Il faut donc les
// mesurer ensemble, en compilant par le vrai compilateur.
//
// ⚠️ ET IL MORD DANS LES DEUX SENS, sinon il aurait laissé passer le défaut qu'il existe pour
// empêcher : un lecteur qui rend toujours `undefined` passe le second cas et échoue le premier ; un
// lecteur qui rend toujours la valeur déclarée fait l'inverse. Les deux cas ensemble, ou rien.
describe('une scène qui déclare un tempo est lue à ce tempo', () => {
  it('DÉCLARÉ — la valeur écrite dans la scène est celle que l’hôte lit', () => {
    const c = compileToBPxAST('core\ntempo:70\n-----\nS -> C4 D4') as { ast?: unknown };
    expect(
      mmFromAst(c.ast as Parameters<typeof mmFromAst>[0]),
      'la scène déclare 70 : un lecteur qui rend autre chose fera dériver au tempo du transport, sans erreur'
    ).toBe(70);
  });

  it('DÉCLARÉ AUTREMENT — une seconde valeur, pour qu’une constante ne passe pas', () => {
    const c = compileToBPxAST('core\ntempo:143\n-----\nS -> C4 D4') as { ast?: unknown };
    expect(mmFromAst(c.ast as Parameters<typeof mmFromAst>[0])).toBe(143);
  });

  it('TÉMOIN NÉGATIF — sans directive, l’hôte ne lit RIEN et laisse le transport décider', () => {
    const c = compileToBPxAST('core\n-----\nS -> C4 D4') as { ast?: unknown };
    expect(
      mmFromAst(c.ast as Parameters<typeof mmFromAst>[0]),
      'sans témoin négatif, un lecteur qui rendrait toujours la même valeur passerait pour juste'
    ).toBeUndefined();
  });
});
