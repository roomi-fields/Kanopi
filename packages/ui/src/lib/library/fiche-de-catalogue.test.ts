import { describe, it, expect } from 'vitest';
import { RESOURCE_GROUPS, RESOURCE_FILES } from './resources';

// UNE FICHE VIENT D'UN OBJET QUE LA LIBRAIRIE DÉCLARE, JAMAIS D'UN CHAMP DE SOMMET — le verrou
// sur l'ABSENCE, retourné sur la porte des objets.
//
// ⛔ CE QU'IL A RATTRAPÉ DEUX FOIS, ET CE N'ÉTAIT PAS UNE HYPOTHÈSE. Quand ce fichier lisait la table
// de fichiers de l'amont, un filtre écartait les champs de sommet du catalogue par leur NATURE.
// `resolves` (une chaîne, 2026-08-10) puis `apporte` (un tableau, 2026-08-31 — et en JavaScript un
// tableau est un objet) l'ont franchi, et une gamme fantôme s'est affichée au milieu des 185 vraies.
// Rien ne rougissait : un filtre qui laisse passer une entrée de trop a exactement la même forme
// qu'un filtre qui n'avait rien à écarter.
//
// ⇒ DEPUIS LE 2026-09-02, LE FILTRE N'EXISTE PLUS : la porte `bpscript/objets` rend `entrees`, une
// population d'objets sans champ de sommet. Ce banc ne prouve donc plus un prédicat — il prouve
// que la porte tient ce contrat SUR LA DONNÉE DU JOUR, ce qui est la seule chose que l'amont peut
// encore casser. Il ne nomme aucun champ : un verrou bâti sur le nom du jour se périme au prochain
// renommage, sans rougir.
describe('une fiche de catalogue vient d’un objet déclaré, jamais d’un champ de sommet', () => {
  const FAMILLES = ['alphabet', 'tuning', 'temperament', 'scale', 'octaves', 'sound'];
  const groupes = RESOURCE_GROUPS.filter((g) => FAMILLES.includes(g.type));

  it('chaque famille est là, et aucune n’est vide — un paquet illisible rendrait zéro fiche', () => {
    // ANTI-VACUITÉ sur les DEUX bouts : six familles, et aucune vide. Sans ce plancher, une porte
    // muette rendrait zéro fiche et le banc dirait « aucune fiche fautive ».
    expect(groupes.map((g) => g.type)).toEqual(FAMILLES);
    for (const g of groupes) expect(g.entries.length, `famille ${g.type} vide`).toBeGreaterThan(0);
  });

  it('chaque fiche est un OBJET nommé, dont la donnée porte ses membres', () => {
    const fautives = groupes.flatMap((g) =>
      g.entries
        .filter((e) => {
          const o = e.data as { nom?: unknown; membres?: unknown } | null;
          return (
            Array.isArray(e.data) ||
            typeof o !== 'object' ||
            o === null ||
            typeof o.nom !== 'string' ||
            typeof o.membres !== 'object' ||
            o.membres === null
          );
        })
        .map((e) => `${g.type}.${e.id}`)
    );
    expect(fautives).toEqual([]);
  });

  it('aucune fiche ne porte le nom d’un membre de RACINE de sa famille', () => {
    // C'est la forme exacte du défaut d'avant : un champ de sommet du catalogue (`resolves`,
    // `apporte`, `documented`…) pris pour une entrée. La racine de la famille vit sur la carte de
    // fichier entier ; ses clés et les noms des fiches doivent être disjoints.
    const fautives: string[] = [];
    for (const g of groupes) {
      const carte = RESOURCE_FILES.find((f) => f.language === 'bpscript' && f.id === g.type);
      const racine = (carte?.data as { membres?: Record<string, unknown> } | undefined)?.membres;
      if (!racine) continue; // `sound` n'a pas de carte de fichier entier (voir RESOURCE_FILES)
      const clesDeRacine = new Set(Object.keys(racine));
      for (const e of g.entries) if (clesDeRacine.has(e.id)) fautives.push(`${g.type}.${e.id}`);
    }
    expect(fautives).toEqual([]);
  });
});
