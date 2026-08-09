import { describe, it, expect } from 'vitest';

// LA PLACE DE `samples` DANS L'ARC — verrouillée parce qu'elle est INVISIBLE autrement.
// Décision Romain 2026-08-09 : « un exemple est une vraie scène », au moins une par famille de
// formes, accessibles dans une catégorie `samples` où l'utilisateur clique pour ouvrir la scène.
//
// ⚠️ POURQUOI UN BANC POUR TROIS LIGNES DE DONNÉE : un dossier ABSENT de l'arc ne casse rien —
// il se range après, par ordre alphabétique, sans un mot. Si `samples` sortait de la liste (par
// une réécriture, un tri, un conflit de fusion), la catégorie continuerait d'apparaître et
// personne ne verrait qu'elle a quitté sa place : elle glisserait simplement en fin de rail,
// derrière les corpus de test. C'est le motif de la journée — une absence qui ne rougit pas.
//
// ⚠️ ET CE BANC NE PROUVE PAS QUE LA CATÉGORIE EXISTE : le rail dérive ses entrées des DOSSIERS
// RÉELS, donc `samples` n'apparaîtra qu'avec sa première scène (elles viennent de bpscript). Ce
// qui est verrouillé ici est la PLACE qui les attend, rien de plus. Ne pas lire ce vert comme
// « la catégorie est en ligne ».
describe('la place de `samples` dans l’arc des catégories', () => {
  const source = import.meta.glob('./library.svelte.ts', {
    query: '?raw',
    import: 'default',
    eager: true
  });
  const texte = Object.values(source)[0] as string;
  const arc = (texte.match(/const CATEGORY_ORDER = \[([\s\S]*?)\]/) ?? [])[1] ?? '';
  const noms = [...arc.matchAll(/'([\w-]+)'/g)].map((m) => m[1]);

  it('elle est DANS l’arc — sinon elle glisserait en fin de rail sans un mot', () => {
    expect(noms, 'CATEGORY_ORDER introuvable ou vide').not.toHaveLength(0);
    expect(noms).toContain('samples');
  });

  it('elle suit l’arc d’entrée : apprendre, les bases, PUIS une forme du langage à l’œuvre', () => {
    expect(noms.slice(0, 3)).toEqual(['learn', 'basics', 'samples']);
  });
});
