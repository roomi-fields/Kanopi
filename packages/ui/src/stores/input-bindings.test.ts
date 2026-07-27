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
});
