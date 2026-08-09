import { describe, it, expect } from 'vitest';
import { LIBRARY_ITEMS } from './scenes';

// L'EN-TÊTE DE CARTE D'UNE SCÈNE ÉDITORIALE EST COMPLET — le garde de RÉCEPTION.
//
// ⚠️ CE QU'IL EXISTE POUR RATTRAPER : `scenes.ts` porte un repli défensif (FALLBACK) qui donne
// `bpscript` / `audio` / `intermediate` à une scène dont l'en-tête est muet, et le nom du FICHIER
// à une scène sans `@name`. Une scène incomplète s'affiche donc NORMALEMENT dans le rail, avec
// une accroche vide et un niveau inventé par le repli. À l'œil, rien ne la distingue d'une scène
// complète. Vérifier un en-tête « en regardant la carte » ne mesure donc rien : c'est le repli
// qu'on regarde. Ce banc lit le FICHIER.
//
// ⚠️ IL MESURE CE QUI EST DÉCLARÉ, PAS UN EFFET : la présence de la clé dans la course de
// commentaires de tête, avec une valeur non vide. Une scène peut être complète ici et muette à
// l'exécution — l'audibilité se mesure ailleurs (`corpus-compile.test.ts`).
//
// LES DEUX CORPUS DE TEST SONT HORS SUJET, ET C'EST MESURÉ : sur les 431 scènes, 283 n'ont pas
// d'en-tête complet, et ce sont EXACTEMENT `BPScript-tests` (170 sur 181) et `BP3-tests` (113 sur
// 113). Ce sont des corpus de conformité, arrivés en bloc, affichés grâce au repli ; leur imposer
// une carte éditoriale les réécrirait tous sans que personne l'ait demandé. Les 137 scènes
// éditoriales, elles, sont complètes en totalité : le vert ci-dessous est un vert MESURÉ, pas un
// vert obtenu en choisissant son échantillon.
const CORPUS_DE_TEST = ['BPScript-tests', 'BP3-tests'];

// Les six clés que porte la carte : le nom affiché, l'accroche, le langage, les sorties, le
// niveau et les étiquettes. `@order` est en plus, et n'a de sens que dans une catégorie qui se
// parcourt dans un ordre (les tutoriels) — il n'est donc pas exigé ici.
const CLES = ['name', 'tagline', 'language', 'outputs', 'level', 'tags'];

const SCENES = import.meta.glob('../../../../library/scenes/**/*.{bps,gr}', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

function categorie(chemin: string): string {
  const parts = chemin.split('/');
  return parts[parts.lastIndexOf('scenes') + 1];
}

/** Les clés déclarées dans la course de commentaires de TÊTE, avec une valeur non vide.
 * Même règle d'arrêt que `scenes.ts` : la première ligne qui n'est ni vide ni un commentaire
 * ferme l'en-tête — un `// @name:` plus bas dans le fichier ne compte pas. */
function clesDeclarees(texte: string): Set<string> {
  const trouvees = new Set<string>();
  for (const ligne of texte.split('\n')) {
    const t = ligne.trim();
    if (t === '') continue;
    if (!t.startsWith('//')) break;
    const m = /^\/\/\s*@([a-zA-Z]+):\s*(.*)$/.exec(t);
    if (m && m[2].trim() !== '') trouvees.add(m[1].toLowerCase());
  }
  return trouvees;
}

const EDITORIALES = Object.entries(SCENES).filter(([p]) => !CORPUS_DE_TEST.includes(categorie(p)));

describe('toute scène d’une catégorie éditoriale porte un en-tête de carte complet', () => {
  it('le corpus éditorial n’est pas vide (sinon le garde passerait à vide)', () => {
    expect(EDITORIALES.length).toBeGreaterThan(100);
  });

  for (const [chemin, texte] of EDITORIALES) {
    const id = `${categorie(chemin)}/${chemin.split('/').pop()}`;
    it(`${id} déclare ses six clés`, () => {
      const declarees = clesDeclarees(texte);
      const manquantes = CLES.filter((k) => !declarees.has(k));
      expect(manquantes, `${id} : clés absentes ou vides`).toEqual([]);
    });
  }
});

// TOUTES LES SORTIES DÉCLARÉES ARRIVENT SUR LA CARTE — le filtre de sortie est multi-valeur
// (`catalog.ts:72`, `item.outputs.includes`), donc une scène qui déclare `audio, midi` doit
// ressortir sous CHACUN des deux filtres, pas seulement le premier.
//
// ⚠️ POURQUOI CE CAS EXISTE : jusqu'au dépôt des scènes d'exemple, chaque scène éditoriale ne
// déclarait qu'une seule sortie. Une lecture qui n'aurait gardé que la première serait restée
// verte sur tout le corpus, et la scène à deux sorties aurait simplement disparu d'un filtre —
// une absence, qui ne rougit nulle part.
//
// Les deux côtés sont indépendants : la gauche vient du TEXTE du fichier, la droite de l'item
// que l'application construit. Mordant prouvé par injection dans le code du lecteur — ne garder
// que la première sortie (`.slice(0, 1)` sur `scenes.ts:86`) fait rougir les 12 scènes à
// plusieurs sorties, nommément ; restauration, 161 vert.
describe('les sorties déclarées arrivent toutes sur la carte', () => {
  const AVEC_PLUSIEURS = EDITORIALES.map(([chemin, texte]) => {
    const m = /^\/\/\s*@outputs:\s*(.*)$/m.exec(texte.split('\n').slice(0, 12).join('\n'));
    const declarees = (m?.[1] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return { id: `${categorie(chemin)}/${chemin.split('/').pop()}`, declarees };
  }).filter((s) => s.declarees.length > 1);

  it('le corpus en contient au moins une (sinon ce banc ne mesure rien)', () => {
    expect(AVEC_PLUSIEURS.length).toBeGreaterThan(0);
  });

  for (const { id, declarees } of AVEC_PLUSIEURS) {
    it(`${id} porte ses ${declarees.length} sorties`, () => {
      const item = LIBRARY_ITEMS.find((i) => i.id === id);
      expect(item, `${id} absente du catalogue`).toBeDefined();
      expect([...item!.outputs].sort()).toEqual([...declarees].sort());
    });
  }
});
