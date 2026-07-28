// L'ASSOCIATION rôle → appareil : elle se retient, elle survit à la session, et rien n'est deviné.
import { describe, it, expect, beforeEach } from 'vitest';
import { inputBindings } from './input-bindings.svelte';

describe('inputBindings', () => {
  beforeEach(() => {
    for (const role of Object.keys(inputBindings.byRole)) inputBindings.clear(role);
  });

  it('un rôle sans association n’a AUCUN appareil par défaut', () => {
    expect(inputBindings.for('pedale')).toBeUndefined();
  });

  it('retient l’identifiant du port ET son nom d’affichage', () => {
    // L'identifiant, parce que deux ports peuvent porter le MÊME nom ; le nom, pour pouvoir dire
    // « associé à X, absent aujourd'hui » plutôt que d'afficher un identifiant nu.
    inputBindings.set('pedale', { portId: 'in-3', portName: 'LPK25 MIDI 1' });
    expect(inputBindings.for('pedale')).toEqual({ portId: 'in-3', portName: 'LPK25 MIDI 1' });
  });

  it('l’association survit à un rechargement (elle est écrite hors de la scène)', () => {
    inputBindings.set('pedale', { portId: 'in-3' });
    const relu: unknown = JSON.parse(localStorage.getItem('kanopi.input-bindings.v1') ?? '{}');
    expect(relu).toEqual({ pedale: { portId: 'in-3' } });
  });

  it('délier retire l’entrée, sans en laisser une coquille', () => {
    inputBindings.set('pedale', { portId: 'in-3' });
    inputBindings.clear('pedale');
    expect(inputBindings.for('pedale')).toBeUndefined();
    expect(JSON.parse(localStorage.getItem('kanopi.input-bindings.v1') ?? '{}')).toEqual({});
  });

  it('deux rôles gardent deux appareils distincts', () => {
    inputBindings.set('pedale', { portId: 'in-1' });
    inputBindings.set('clavier', { portId: 'in-2' });
    expect(inputBindings.for('pedale')?.portId).toBe('in-1');
    expect(inputBindings.for('clavier')?.portId).toBe('in-2');
  });

  // ── CE QUI PART VERS LE ROUTEUR ───────────────────────────────────────────────────────────
  it('porte l’IDENTITÉ du port, jamais son nom d’affichage', () => {
    // LE DÉFAUT QUE CE VERROU EMPÊCHE, et il a vécu invisible : je remettais l'identifiant du port
    // pendant que le routeur le comparait à l'ÉTIQUETTE posée par `runtime-in` (le NOM du port).
    // Les deux ne se rencontraient jamais. Masqué tant qu'un canal n'a qu'un rôle — donc le clavier
    // marchait — et fatal dès deux pédales MIDI. Depuis [869] l'identité est exigée des deux côtés.
    inputBindings.set('pedale', { portId: 'midi-in-2', portName: 'LPK25' });
    expect(inputBindings.pourRoutage()).toEqual([{ role: 'pedale', sourceId: 'midi-in-2' }]);
    // Le NOM ne doit apparaître nulle part dans ce qui sert à router : deux appareils du même
    // modèle le partagent, et l'un lèverait les attentes de l'autre sans qu'on puisse le détecter.
    expect(JSON.stringify(inputBindings.pourRoutage())).not.toContain('LPK25');
  });

  it('une association SANS identité n’est pas portée du tout', () => {
    // « Absent égale tout » a été RETIRÉ en amont, pas assoupli : deux absences s'y comparaient
    // ÉGALES, et le second appareil n'était jamais servi sans qu'une erreur le dise. Un rôle
    // clavier (rien à choisir) ne doit donc rien envoyer, plutôt qu'une association vide.
    inputBindings.set('touches', {});
    expect(inputBindings.pourRoutage()).toEqual([]);
  });
});
