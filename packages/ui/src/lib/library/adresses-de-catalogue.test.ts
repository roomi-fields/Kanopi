// PLUS AUCUNE LIGNE DE MON CODE NE LIT LE PAQUET `bpscript/libs-data` — le verrou RETOURNÉ.
//
// ⛔ CE QU'IL TENAIT JUSQU'AU 2026-09-03, ET POURQUOI IL A CHANGÉ DE SUJET. Il vérifiait que toute
// adresse `LIBS.<clé>` écrite par mon code RÉSOLVAIT, parce que le mode d'échec de ce paquet est
// SILENCIEUX : une clé retirée en amont rend `undefined`, sans exception, sans trace, sans son.
// `LIBS.mod` (2026-08-23) a laissé une carte affichée sur un catalogue absent ; `LIBS.voices`
// (2026-08-30) aurait fait disparaître une facette voix sur un portillon resté vert.
//
// ⇒ Le 2026-09-03, le dernier lecteur est parti : la porte des objets a pris la bibliothèque
// (`resources.ts`), l'arbre a pris la hauteur, la voix, les fonctions et l'homomorphisme
// (`bpx-adapter.ts`), et les canaux sont devenus les exemplaires du prototype `destination`
// (`devices/registry.ts`, qui JETAIT au chargement depuis la dissolution du schéma de `core`).
// L'anti-vacuité de ce verrou a alors rougi — « ZÉRO adresse relevée, ce verrou n'a rien examiné » —
// et c'est exactement ce qu'un garde doit faire quand son assiette se vide.
//
// ⛔ IL NE SE SUPPRIME PAS, IL SE RETOURNE. Le supprimer laisserait une adresse `LIBS.<clé>` revenir
// sans qu'un rouge le dise, le jour où quelqu'un « juste pour lire un catalogue » réimporte le
// paquet — et ce paquet SORT (décision de Romain, phase 5 : `libs-data.js` et `PLACES` se retirent
// quand ses derniers lecteurs ont basculé). Ce qui était « chaque adresse résout » devient « aucune
// adresse n'existe », sur la même graphie, avec le même balayage de ma source.
//
// ⛔ LA LISTE SE DÉRIVE DE MA SOURCE, JAMAIS ÉCRITE À LA MAIN — inchangé : ce verrou lit la graphie
// que mon code écrit vraiment, il la compte, et il refuse d'avoir examiné zéro FICHIER.
//
// ⛔⛔ ET SON PÉRIMÈTRE ÉTAIT TROP ÉTROIT, CE QUI EST PIRE QU'UN VERROU ABSENT : il ne balayait que
// `packages/ui/src`, et proclamait « le paquet n'a plus AUCUN lecteur dans ma source » sur cette
// portion-là. Le 2026-09-03, le relevé de la tour (`hub/tools/releve-porte.mjs`) m'a compté un
// lecteur que je ne voyais pas — `scripts/garde-portes-de-librairie.mjs`, qui IMPORTAIT le paquet
// pour en tirer sa liste de clés. *Une absence n'est une preuve que si le périmètre de recherche
// est établi*, et le mien ne l'était pas : il était HÉRITÉ du collecteur de Vite, jamais choisi.
// ⇒ Le balayage couvre désormais mes DEUX racines de code — `packages/ui/src` et `scripts/`.
import { describe, it, expect } from 'vitest';

// La source se prend par le collecteur de Vite, comme le fait déjà mon garde de corpus
// (`corpus-compile.test.ts:73`) : un chemin de disque calculé depuis `import.meta.url` ne résout pas
// sous le banc, dont l'URL de module n'est pas un fichier.
const SOURCE: Record<string, string> = {
  ...(import.meta.glob('../../**/*.{ts,svelte}', {
    query: '?raw',
    import: 'default',
    eager: true
  }) as Record<string, string>),
  ...(import.meta.glob('../../../../../scripts/**/*.mjs', {
    query: '?raw',
    import: 'default',
    eager: true
  }) as Record<string, string>)
};

// ⛔ LES COMMENTAIRES SORTENT AVANT LE RELEVÉ. Trois fichiers gardent la trace ÉCRITE de leur
// ancienne lecture — `registry.ts` raconte la ligne qui jetait, `resources.ts` les sept clés
// sorties, ce banc son propre retournement. Les compter rendrait ce verrou rouge sur des phrases
// d'histoire, et un garde qui mord sur un commentaire enseigne à retirer le commentaire.
// ⛔ ET LES SAUTS DE LIGNE D'UN COMMENTAIRE DE BLOC SE GARDENT. Écraser `/* … */` par une espace
// décale tout ce qui suit : à la première épreuve par injection, ce verrou a nommé `bpx-adapter.ts:42`
// pour une adresse qui vivait ligne 53. Un garde juste qui désigne la mauvaise ligne envoie corriger
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

type Trouvaille = { quoi: string; ou: string };

// ⛔ L'EXEMPTION QUI VIVAIT ICI EST RETIRÉE, ET SA CAUSE AVEC — 2026-09-03, quelques heures après
// l'avoir posée. Elle couvrait `scripts/garde-portes-de-librairie.mjs`, seul vrai lecteur restant :
// il importait le paquet pour en tirer sa liste de noms de catalogue. Deux réécritures avaient
// échoué (les familles de la porte ne recouvrent pas les noms de fichier ; sans liste, l'instrument
// rendait des faux positifs sur mes propres fichiers), et j'avais conclu que la liste n'existait que
// dans le paquet qui sort.
// ⇒ ⚠️ C'ÉTAIT FAUX, ET LA SOURCE QUE JE N'AVAIS PAS ESSAYÉE ÉTAIT LA PLUS ÉVIDENTE : les fichiers
//   eux-mêmes, dans l'espace PUBLIÉ de bpscript (`.publie/BPscript/lib/`). Le garde y lit 21 noms de
//   catalogue réels — son sujet exact, au lieu d'une projection en clés — sans importer quoi que ce
//   soit. Une exemption posée sur « je ne sais pas faire » se retire quand on trouve comment.

/** Ce que mon code écrit et qui atteindrait le paquet voué au retrait : l'import de la porte, ou un
 *  accès à son objet. Les deux graphies d'un accès — le point et le crochet — parce qu'un verrou qui
 *  n'en connaît qu'une devient aveugle le jour où l'autre arrive. */
function lecturesDuPaquet(): { trouvailles: Trouvaille[]; fichiers: number } {
  const trouvailles: Trouvaille[] = [];
  let fichiers = 0;
  for (const [chemin, texte] of Object.entries(SOURCE)) {
    fichiers++;
    const lisible = cheminLisible(chemin);
    const lignes = sansCommentaires(texte).split('\n');
    lignes.forEach((l, i) => {
      const ou = `${lisible}:${i + 1}`;
      if (/from\s+['"]bpscript\/libs-data['"]/.test(l))
        trouvailles.push({ quoi: 'import de `bpscript/libs-data`', ou });
      for (const m of l.matchAll(
        /\bLIBS\s*(?:\.\s*([A-Za-z_$][\w$]*)|\[\s*['"]([^'"]+)['"]\s*\])/g
      ))
        trouvailles.push({ quoi: `LIBS.${m[1] ?? m[2]}`, ou });
    });
  }
  return { trouvailles, fichiers };
}

describe('le paquet `bpscript/libs-data` n’a plus aucun lecteur dans ma source', () => {
  it('et le balayage a bien regardé — un garde qui n’a vu aucun fichier ne prouve rien', () => {
    // ANTI-VACUITÉ déplacée sur ce qui reste mesurable : le nombre de FICHIERS examinés. L'ancienne
    // portait sur le nombre d'ADRESSES trouvées ; elle rougissait donc au moment même où le sujet
    // était atteint.
    // ⚠️ LE PLANCHER EST MESURÉ ICI, PAS EMPRUNTÉ. Ma première rédaction disait « nettement sous le
    // compte réel (656 fichiers) » et posait 300 : le banc a rougi à 216. Les 656 sont le compte de
    // `svelte-check` sur TOUT le paquet ; ce collecteur, lui, balaie `src/lib` et `src/components`
    // depuis ce fichier. Un plancher pris à un autre instrument mesure l'autre instrument.
    const { fichiers } = lecturesDuPaquet();
    expect(
      fichiers,
      `${fichiers} fichier(s) balayé(s) — le collecteur ne lit plus ma source (racine changée, ` +
        `extension renommée), pas que le dépôt s'est vidé.`
    ).toBeGreaterThan(150);
  });

  it('le balayage atteint bien mes DEUX racines de code — pas seulement l’une', () => {
    // ⛔ LE PÉRIMÈTRE SE VÉRIFIE, IL NE SE SUPPOSE PAS. Ce verrou ne balayait que `packages/ui/src`
    // et proclamait une absence sur cette portion-là ; le seul vrai lecteur vivait dans `scripts/`.
    // Sans ce cas, un glob qui cesserait de résoudre rendrait le verrou muet et vert.
    const vus = Object.keys(SOURCE).map(cheminLisible);
    expect(
      vus.filter((v) => v.startsWith('scripts/')).length,
      'ZÉRO fichier de `scripts/` balayé — le verrou ne couvre plus que la moitié de mon code.'
    ).toBeGreaterThan(10);
    expect(
      vus.filter((v) => v.startsWith('src/')).length,
      'ZÉRO fichier de `packages/ui/src` balayé — le collecteur ne résout plus.'
    ).toBeGreaterThan(100);
  });

  it('aucune ligne ne l’importe ni n’accède à son objet', () => {
    const { trouvailles } = lecturesDuPaquet();
    expect(
      trouvailles.map((t) => `${t.ou}  ${t.quoi}`),
      'Cette ligne lit le paquet `bpscript/libs-data`, qui SORT (décision de Romain, phase 5) et ' +
        "dont le mode d'échec est SILENCIEUX : une clé retirée rend `undefined`, sans exception ni " +
        'son. Ce que ce paquet portait vit ailleurs — la bibliothèque à la porte des objets ' +
        '(`bpscript/objets`), la hauteur / la voix / les fonctions / l’homomorphisme dans ' +
        '`tree.metadata.librairies`, les canaux dans les exemplaires du prototype `destination`.'
    ).toEqual([]);
  });
});
