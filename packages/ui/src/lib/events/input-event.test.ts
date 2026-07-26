// L'ÉVÉNEMENT D'ENTRÉE SUR LE BUS — verrou d'ACCUEIL, pas d'interprétation.
// Contrat `hub/contrats/hote-runtime-in.md` § « L'événement d'entrée » (ratifié 2026-07-27).
//
// Ce que ces verrous gardent :
//   • un `InputEvent` traverse le bus VERBATIM — la même référence d'objet ressort, donc l'hôte
//     n'a rien reshapé, rien complété, rien traduit (un numéro reste un numéro : un nom de note se
//     résout par l'alphabet déclaré, en aval) ;
//   • les QUATRE formes de signal du contrat passent — note, contrôle, adresse OSC, touche ;
//   • l'abonnement par type (`on('input')`) le voit, et il n'arrive PAS chez les autres topics :
//     un bus unique qui mélangerait les topics ferait bruire les projections de transport ;
//   • UN SEUL BUS : c'est le bus commun (`createEventBus`) qui le porte, pas un canal d'entrée à
//     part. Le contrat l'interdit explicitement — un second bus dupliquerait la règle de temps,
//     et deux horloges converties par deux règles ne se comparent plus.
import { describe, it, expect } from 'vitest';
import { createEventBus } from './bus';
import type { InputEvent, KanopiEvent } from './types';

const noteOn: InputEvent = {
  schemaVersion: 1,
  type: 'input',
  t: 1234.5,
  runtime: 'in',
  source: 'Launchkey MK3',
  device: 'midi',
  signal: { kind: 'note', number: 60, channel: 1, velocity: 100, on: true }
};

describe('InputEvent sur le bus unique', () => {
  it('traverse VERBATIM : la même référence ressort, l’hôte n’a rien reshapé', () => {
    const bus = createEventBus();
    const vus: KanopiEvent[] = [];
    bus.on('input', (e) => vus.push(e));
    bus.emit(noteOn);
    expect(vus).toHaveLength(1);
    // Identité de référence : la garantie la plus forte contre une traduction silencieuse.
    expect(vus[0]).toBe(noteOn);
  });

  it('les quatre formes de signal du contrat passent, sans en interpréter aucune', () => {
    const bus = createEventBus();
    const vus: InputEvent[] = [];
    bus.on('input', (e) => vus.push(e));

    const signaux: InputEvent['signal'][] = [
      { kind: 'note', number: 60, channel: 1, velocity: 100, on: true },
      { kind: 'control', number: 74, channel: 3, value: 42 },
      { kind: 'address', path: '/fader/1', args: [0.75] },
      { kind: 'key', code: 'KeyQ', down: true }
    ];
    const devices: InputEvent['device'][] = ['midi', 'midi', 'osc', 'keyboard'];
    signaux.forEach((signal, i) => {
      bus.emit({ ...noteOn, device: devices[i], signal });
    });

    expect(vus.map((e) => e.signal.kind)).toEqual(['note', 'control', 'address', 'key']);
    expect(vus.map((e) => e.device)).toEqual(devices);
    // Rien d'ajouté : les clés sortantes sont exactement celles entrées.
    expect(Object.keys(vus[3]).sort()).toEqual(
      ['device', 'runtime', 'schemaVersion', 'signal', 'source', 't', 'type'].sort()
    );
  });

  it('n’arrive pas chez les autres topics, et `onAny` le voit comme n’importe quel événement', () => {
    const bus = createEventBus();
    const tokens: KanopiEvent[] = [];
    const tous: KanopiEvent[] = [];
    bus.on('token', (e) => tokens.push(e));
    bus.onAny((e) => tous.push(e));
    bus.emit(noteOn);
    expect(tokens).toHaveLength(0);
    expect(tous).toEqual([noteOn]);
  });
});
