import { describe, it, expect } from 'vitest';
import { estUneEntree, entriesFromNamedCatalog, RESOURCE_GROUPS } from './resources';

// UN CHAMP DE SOMMET NE DEVIENT JAMAIS UNE FICHE — le verrou sur l'ABSENCE.
//
// ⛔ CE QU'IL RATTRAPE, ET CE N'ÉTAIT PAS UNE HYPOTHÈSE. Le 2026-08-31, `apporte: ["types"]` est
// arrivé au SOMMET des catalogues de l'amont. Le filtre classait par la NATURE de la valeur —
// « une entrée est un objet, un champ de catalogue est une chaîne » — et EN JAVASCRIPT UN TABLEAU
// EST UN OBJET. `apporte` franchissait donc le filtre et s'affichait comme une gamme parcourable
// au milieu des 185 vraies. Rien ne rougissait : un filtre qui laisse passer une entrée de trop a
// exactement la même forme qu'un filtre qui n'avait rien à écarter.
//
// ⚠️ CE BANC NE NOMME PAS `apporte` COMME MOTIF, et c'est délibéré : un verrou bâti sur le nom du
// champ du jour se périme au prochain renommage de l'amont, sans rougir — c'est précisément la
// faute que la version qui nommait `domain` avait déjà commise ici. Il verrouille la NATURE.
describe('une fiche de catalogue vient d’une entrée, jamais d’un champ de sommet', () => {
  // Le témoin est écrit à la main : il porte les trois natures d'un coup, et il reste vrai quel
  // que soit ce que l'amont publie ce jour-là.
  const TEMOIN = {
    // deux vraies entrées — un objet simple, avec et sans description
    ionian: { description: 'la gamme majeure', degrees: [0, 2, 4, 5, 7, 9, 11] },
    dorian: { degrees: [0, 2, 3, 5, 7, 9, 10] },
    // les champs de SOMMET, dans les trois formes que l'amont écrit
    documented: 'oui', // chaîne
    apporte: ['types'], // ⛔ TABLEAU — la nature qui a produit la fiche fantôme
    _comment: ['une prose de catalogue'] // blanc souligné ET tableau : les deux moitiés
  };

  it('exclut le tableau par sa NATURE, comme la chaîne', () => {
    expect(estUneEntree(['types'])).toBe(false);
    expect(estUneEntree('temperament')).toBe(false);
    expect(estUneEntree(null)).toBe(false);
    // ⚠️ LE CONTRÔLE INVERSE — sans lui, un prédicat qui refuserait TOUT passerait les trois
    // lignes ci-dessus et viderait la bibliothèque en restant vert.
    expect(estUneEntree({ degrees: [0, 2, 4] })).toBe(true);
  });

  it('ne rend que les deux vraies entrées du témoin', () => {
    const ids = entriesFromNamedCatalog(TEMOIN).map((e) => e.id);
    expect(ids).toEqual(['ionian', 'dorian']);
  });

  // ⛔ ET LE MÊME VERROU SUR LA DONNÉE RÉELLE : le témoin prouve le prédicat, il ne prouve pas que
  // l'amont d'aujourd'hui passe par lui. Une fiche dont la donnée est un TABLEAU est, par
  // construction, un champ de sommet qui a franchi le filtre.
  it('aucune fiche de l’amont ne porte un tableau pour donnée', () => {
    const catalogues = RESOURCE_GROUPS.filter((g) =>
      ['alphabet', 'tuning', 'temperament', 'scale', 'octaves'].includes(g.type)
    );
    // ANTI-VACUITÉ sur les DEUX bouts : cinq catalogues, et aucun vide. Sans ce plancher, un
    // paquet illisible rendrait zéro fiche et le banc dirait « aucune fiche fautive ».
    expect(catalogues).toHaveLength(5);
    for (const g of catalogues) expect(g.entries.length).toBeGreaterThan(0);

    const fautives = catalogues.flatMap((g) =>
      g.entries.filter((e) => Array.isArray(e.data)).map((e) => `${g.type}.${e.id}`)
    );
    expect(fautives).toEqual([]);
  });
});
