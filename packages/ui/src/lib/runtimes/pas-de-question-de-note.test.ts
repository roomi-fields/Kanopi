// LE VERROU EST RETOURNÉ, PAS SUPPRIMÉ.
//
// Ce dépôt a longtemps demandé « ce mot est-il une note ? » pour écarter les notes des sections
// de tête. Deux fichiers de test verrouillaient ce calcul ; ils sont partis avec lui
// (décision 2026-07-29, `hub/decisions/2026-07-29-notre-mecanique-n-utilise-que-des-alphabets.md` :
// notre mécanique n'utilise QUE des alphabets, et les conventions de notes ne sont connues QUE du
// frontal BP3). Supprimer un calcul en supprimant aussi ce qui le verrouillait laisse la porte
// ouverte : le prochain qui aura besoin d'une bande étiquetée le réécrira sans savoir qu'il a été
// retiré exprès. Donc ce banc verrouille désormais son ABSENCE.
//
// CE QU'IL INTERDIT, et pourquoi c'est le bon critère :
//  1. importer le prédicat de note du frontal BP3 — c'est LA question qui n'appartient pas à
//     l'hôte. Le nom est nominal (il s'importe explicitement), donc le chercher au mot nu ne crie
//     pas au loup sur des homonymes, contrairement à un nom de champ structurel.
//  2. republier des `sections` sur le magasin de production — c'est le champ qui alimentait un
//     canal que les vues ont DÉJÀ quitté (elles lisent Kairos par `production-feed`).
// Qui devra dessiner des bandes les lira sur l'arbre, où l'amont marque ce qui est une note.
//
// Balayage par `import.meta.glob` (Vite natif, pas de types Node), même idiome que
// `host-time-purity.test.ts` — et sur le TEXTE ENTIER, commentaires compris : une prose qui nomme
// encore le prédicat est une invitation à le réimporter. (Vérifié qu'il mord : à l'écriture il a
// sorti 3 fichiers qui le nommaient encore en commentaire.)
import { describe, it, expect } from 'vitest';

const RAW = import.meta.glob('/src/**/*.{ts,svelte}', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

const FICHIERS = Object.keys(RAW).filter((p) => !p.endsWith('pas-de-question-de-note.test.ts'));

describe("l'hôte ne demande plus si un mot est une note", () => {
  // ANTI-VACUITÉ : un balayage qui ne lit rien passerait en silence. Seuil BAS et non un compte
  // exact — il prouve que le glob a mordu, il ne verrouille pas la taille du dépôt.
  it('balaie vraiment les sources', () => {
    expect(FICHIERS.length).toBeGreaterThan(100);
  });

  it('aucun fichier n’importe le prédicat de note du frontal BP3', () => {
    expect(FICHIERS.filter((p) => /\bisNoteName\b/.test(RAW[p]))).toEqual([]);
  });

  it('le magasin de production ne republie pas de sections', () => {
    const magasin = FICHIERS.find((p) => p.endsWith('stores/production.svelte.ts'));
    expect(magasin).toBeDefined();
    expect(/\bsections\b/.test(RAW[magasin!])).toBe(false);
  });
});
