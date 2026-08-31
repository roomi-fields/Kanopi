// Ce banc remplace la garantie locale supprimée : `registry.ts` portait avant
// une constante `DEFAULT_MIDI` (secours si le fichier groupé/l'overlay omettait
// `midi`) et une table de compatibilité `Record<DeviceType, …>` EXHAUSTIVE — le
// type garantissait, à la compilation, une entrée pour chaque type de device.
//
// La bascule vers le catalogue amont (le catalogue `core` du paquet `bpscript/libs-data`, schema.channels)
// comme SOURCE UNIQUE des directions (`in`/`out`) et des valeurs par défaut a
// supprimé les deux : `DEFAULT_MIDI` (une 2e autorité locale, interdite) et
// l'exhaustivité du type (`DeviceType` s'étend maintenant à TOUT le catalogue,
// dont `keyboard`, un canal d'ENTRÉE qui n'est pas un appareil de sortie — la
// table est passée en `Partial<Record<...>>`).
//
// Ce banc verrouille ce que ces deux suppressions ont dé-verrouillé : que le
// catalogue amont porte bien `midi` en sortie, que tout canal de sortie amont a
// une entrée de compatibilité déclarée ici (nommée si absente), et que la liste
// des appareils rendue à l'UI est exactement les canaux `out === true` du
// catalogue (ni plus, ni moins — `text` dedans, `keyboard` dehors).

import { LIBS } from 'bpscript/libs-data';
import { describe, it, expect } from 'vitest';
const coreJson = LIBS.core;
import { acceptedOutputTypes, listDevices, type DeviceType } from './registry';

const CANAUX = coreJson.schema.channels;

function isOutChannel(canal: unknown): canal is { out: true } {
  return (
    typeof canal === 'object' &&
    canal !== null &&
    'out' in canal &&
    (canal as { out: unknown }).out === true
  );
}

describe('catalogue amont = source unique des appareils de sortie', () => {
  it('porte bien "midi" avec out:true (sinon plus de secours local pour le masquer)', () => {
    const midi = (CANAUX as Record<string, unknown>).midi;
    expect(midi).toBeDefined();
    expect(isOutChannel(midi)).toBe(true);
  });

  it('tout canal de sortie du catalogue a une entrée de compatibilité déclarée', () => {
    const canauxDeSortie = (Object.keys(CANAUX) as DeviceType[]).filter((name) =>
      isOutChannel((CANAUX as Record<string, unknown>)[name])
    );
    for (const name of canauxDeSortie) {
      const accepted = acceptedOutputTypes(name);
      expect(
        accepted.size > 0,
        `le canal de sortie "${name}" (catalogue amont) n'a AUCUNE entrée dans ` +
          `la table de compatibilité (registry.ts ACCEPTED) — décider ce qu'il accepte.`
      ).toBe(true);
    }
  });

  it('listDevices() rend exactement les canaux out===true — "text" dedans, "keyboard" dehors', () => {
    const names = listDevices().map((d) => d.name);
    expect(names).toContain('text');
    expect(names).not.toContain('keyboard');

    const attendus = (Object.keys(CANAUX) as DeviceType[])
      .filter((name) => isOutChannel((CANAUX as Record<string, unknown>)[name]))
      .sort();
    expect([...names].sort()).toEqual(attendus);
  });

  it('listDevices() rend exactement le TÉMOIN FIGÉ (indépendant du catalogue)', () => {
    // TÉMOIN FIGÉ, écrit à la main : il ne se dérive PAS du catalogue. Sans lui, le test
    // précédent ne compare que la donnée à elle-même (attendus dérivé du même CANAUX que
    // listDevices()) — un changement COHÉRENT en amont (un canal qui perd `out`) laisserait
    // les deux côtés bouger ENSEMBLE et resterait vert, pendant que l'interface perd
    // l'appareil en silence. Si ce test rougit : soit le catalogue amont a changé et il faut
    // mettre APPAREILS_ATTENDUS à jour DÉLIBÉRÉMENT, soit c'est une régression à corriger.
    const APPAREILS_ATTENDUS = ['audio', 'dmx', 'midi', 'osc', 'text'];
    const names = listDevices()
      .map((d) => d.name)
      .sort();
    expect(
      names,
      `listDevices() rend ${JSON.stringify(names)}, attendu (témoin figé) ` +
        `${JSON.stringify(APPAREILS_ATTENDUS)} — soit le catalogue amont a changé ` +
        `(mettre APPAREILS_ATTENDUS à jour délibérément), soit c'est une régression.`
    ).toEqual(APPAREILS_ATTENDUS);
  });
});
