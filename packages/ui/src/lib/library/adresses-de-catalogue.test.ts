// TOUTE ADRESSE `LIBS.<clé>` QUE MON CODE ÉCRIT DOIT RÉSOUDRE — sinon l'amont a retiré un catalogue
// et je continue en silence.
//
// ⛔ LE MODE D'ÉCHEC QUE CE VERROU FERME, ANNONCÉ PAR BPSCRIPT LE 2026-08-30 : « après ma frappe,
// `LIBS.voices` n'existe plus. Tout code qui le lit rend `undefined`, sans erreur — c'est le mode
// d'échec SILENCIEUX, pas une exception. » Mesuré chez moi : `bpx-adapter.ts:53` lit cette adresse et
// la ligne 50 traite l'absence comme un cas normal (« ABSENT ⇒ pas de facette voix »). Mon portillon
// serait donc resté VERT sur une facette voix disparue.
//
// ⛔ ET LE VERROU DES CARTES DE LIBRAIRIE NE COUVRAIT PAS CE CAS : `entrees-de-catalogue.test.ts`
// éprouve les cartes de MA bibliothèque (`RESOURCE_FILES`), et `voices` n'en est pas une — personne
// ne la voit dans un rail. Deux adresses vers le même paquet amont, un seul verrou. C'est le
// précédent `LIBS.mod` (2026-08-23) qui se rejouait un cran plus loin.
//
// ⛔ LA LISTE SE DÉRIVE DE MA SOURCE, JAMAIS ÉCRITE À LA MAIN. Une liste écrite se périme au premier
// fichier qui lit une adresse de plus, et elle se périme EN VERT. Ce verrou lit la graphie que mon
// code écrit vraiment, il la compte, et il refuse d'en avoir examiné zéro.
import { describe, it, expect } from 'vitest';
// MÊME porte que mes deux lecteurs (`bpx-adapter.ts:1`, `resources.ts:33`) : le verrou éprouve
// l'objet que l'application reçoit, pas une relecture du paquet par un autre chemin.
import { LIBS } from 'bpscript/src/transpiler/libs-data.js';

// La source se prend par le collecteur de Vite, comme le fait déjà mon garde de corpus
// (`corpus-compile.test.ts:73`) : un chemin de disque calculé depuis `import.meta.url` ne résout pas
// sous le banc, dont l'URL de module n'est pas un fichier.
const SOURCE = import.meta.glob('../../**/*.{ts,svelte}', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

// ⛔ LES COMMENTAIRES SORTENT AVANT LE RELEVÉ. `resources.ts` garde la trace écrite de `LIBS.mod`,
// une adresse MORTE citée pour raconter le précédent : la compter rendrait ce verrou rouge sur une
// phrase d'histoire. Un garde qui mord sur un commentaire enseigne à retirer le commentaire.
// ⛔ ET LES SAUTS DE LIGNE D'UN COMMENTAIRE DE BLOC SE GARDENT. Écraser `/* … */` par une espace
// décale tout ce qui suit : à la première épreuve par injection, ce verrou a nommé `bpx-adapter.ts:42`
// pour une adresse qui vit ligne 53. Un garde juste qui désigne la mauvaise ligne envoie corriger
// autre chose.
function sansCommentaires(texte: string): string {
  return texte
    .replace(/\/\*[\s\S]*?\*\//g, (bloc) => bloc.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, ' ');
}

// Les clés du collecteur sont relatives à CE fichier ; le lecteur veut un chemin depuis la racine du
// paquet. On résout au lieu de couper un préfixe — le collecteur normalise `../../lib/x` en `../x`.
function cheminLisible(cle: string): string {
  const pile = ['src', 'lib', 'library'];
  for (const segment of cle.split('/')) {
    if (segment === '..') pile.pop();
    else if (segment !== '.' && segment !== '') pile.push(segment);
  }
  return pile.join('/');
}

type Adresse = { cle: string; ou: string };

function adressesEcritesParMonCode(): Adresse[] {
  const vues: Adresse[] = [];
  for (const [chemin, texte] of Object.entries(SOURCE)) {
    if (/\.(test|spec)\.ts$/.test(chemin)) continue;
    const lignes = sansCommentaires(texte).split('\n');
    lignes.forEach((l, i) => {
      // Les deux graphies d'un accès : le point et le crochet. Mon code n'écrit que la première
      // aujourd'hui — la seconde est là pour que le verrou ne devienne pas aveugle si elle arrive.
      for (const m of l.matchAll(
        /\bLIBS\s*(?:\.\s*([A-Za-z_$][\w$]*)|\[\s*['"]([^'"]+)['"]\s*\])/g
      )) {
        vues.push({ cle: m[1] ?? m[2], ou: `${cheminLisible(chemin)}:${i + 1}` });
      }
    });
  }
  return vues;
}

describe('les adresses de catalogue amont que mon code écrit', () => {
  it('résolvent toutes — une adresse muette est une facette disparue que rien ne signale', () => {
    const adresses = adressesEcritesParMonCode();
    expect(
      adresses.length,
      "ZÉRO adresse `LIBS.<clé>` relevée dans ma source — ce verrou n'a rien examiné, donc il ne " +
        'prouve rien. La graphie a changé, ou le relevé ne lit plus les bons fichiers.'
    ).toBeGreaterThan(0);

    const muettes: string[] = [];
    for (const { cle, ou } of adresses) {
      const valeur = (LIBS as Record<string, unknown>)[cle];
      if (typeof valeur !== 'object' || valeur === null)
        muettes.push(`${ou}  LIBS.${cle} = ${String(valeur)}`);
    }

    expect(
      muettes,
      "Cette ligne lit un catalogue de l'amont par une clé qui ne résout plus. L'amont l'a retiré ou " +
        'renommé, et mon code continue avec `undefined` — sans exception, sans trace, sans son. ' +
        'Retirer la lecture, ou la faire pointer sur la clé vivante ; jamais laisser le silence.'
    ).toEqual([]);
  });
});
