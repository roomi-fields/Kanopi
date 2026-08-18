// LES ENTRÉES QUE LA SCÈNE DÉCLARE — l'hôte les LIT sur l'AST amont, il ne les invente pas.
// Forme de référence : `hub/decisions/2026-07-27-forme-des-entrees-in-mapping-adresse-nue.md`.
import { describe, it, expect } from 'vitest';
import { declaredInputsForScene } from './bpx-adapter';

describe('declaredInputsForScene', () => {
  it('rend les rôles déclarés, dans l’ordre, avec leur canal', () => {
    const scene = 'var pedale in.midi\nvar touches in.keyboard\n\n-----\nA -> C4 D4\n';
    expect(declaredInputsForScene(scene)).toEqual([
      { name: 'pedale', transport: 'midi', mapping: null },
      { name: 'touches', transport: 'keyboard', mapping: null }
    ]);
  });

  it('n’invente AUCUNE table : sans invocation, `mapping` reste nul', () => {
    // Il n'existe pas de table par défaut (décision Romain) : poser une identité implicite
    // rendrait indistinguables « je n'ai pas de table » et « ma table ne fait rien ».
    const [role] = declaredInputsForScene('var pedale in.midi\n-----\nA -> C4\n');
    expect(role.mapping).toBeNull();
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
