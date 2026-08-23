// LES ENTRÉES QUE LA SCÈNE DÉCLARE — l'hôte les LIT sur l'AST amont, il ne les invente pas.
// Forme de référence : `hub/decisions/2026-07-27-forme-des-entrees-in-mapping-adresse-nue.md`.
import { describe, it, expect } from 'vitest';
import { declaredInputsForScene } from './bpx-adapter';

describe('declaredInputsForScene', () => {
  it('rend les rôles déclarés, dans l’ordre, avec leur canal', () => {
    const scene = 'in.midi pedale\nin.keyboard touches\n\n-----\nA -> C4 D4\n';
    expect(declaredInputsForScene(scene)).toEqual([
      { name: 'pedale', transport: 'midi', mapping: null },
      { name: 'touches', transport: 'keyboard', mapping: null }
    ]);
  });

  it('n’invente AUCUNE table : sans invocation, `mapping` reste nul', () => {
    // Il n'existe pas de table par défaut (décision Romain) : poser une identité implicite
    // rendrait indistinguables « je n'ai pas de table » et « ma table ne fait rien ».
    const [role] = declaredInputsForScene('in.midi pedale\n-----\nA -> C4\n');
    expect(role.mapping).toBeNull();
  });

  // ⛔ LE VERROU EST RETOURNÉ, PAS RETIRÉ (bpscript `d0d0be9`, 2026-08-23 — « une entrée déclare
  // son CANAL : la forme nue sort, le champ cesse d'être nullable »). Ce banc verrouillait
  // l'inverse : `in pedale` déclarait un rôle au canal `null`, qui remontait jusqu'à la vue
  // matériel. Effacer le banc laisserait la forme morte revenir sans que rien ne rougisse ; ce qui
  // suit verrouille donc son ABSENCE, sur les deux faces.
  it('la forme NUE est refusée en amont — une scène qui la porte ne déclare RIEN', () => {
    // Le refus porte sur la SCÈNE entière : elle ne rend aucun arbre, donc l'entrée voisine
    // pourtant bien formée ne remonte pas non plus. C'est le voyant de santé qui le dit.
    expect(declaredInputsForScene('in pedale\nin.midi expression\n-----\nA -> C4\n')).toEqual([]);
  });

  it('tout canal rendu est une CHAÎNE de la liste fermée — jamais nul', () => {
    // Le témoin positif : sans lui, un rendu VIDE passerait ce test sans rien mesurer.
    const roles = declaredInputsForScene(
      'in.midi pedale\nin.keyboard touches\nin.osc fader\n-----\nA -> C4\n'
    );
    expect(roles.map((r) => r.transport)).toEqual(['midi', 'keyboard', 'osc']);
  });

  it('une scène sans entrée ne déclare rien', () => {
    expect(declaredInputsForScene('A -> C4 D4\n')).toEqual([]);
  });

  it('une scène qui ne compile pas ne déclare rien de lisible — et ne crie pas ici', () => {
    // Le défaut de compilation se dit déjà au voyant de santé ; le redire ici ferait deux voix
    // pour un seul défaut. Ce qui compte : on ne devine pas un rôle dans un texte cassé.
    expect(declaredInputsForScene('@in ')).toEqual([]);
  });
});
