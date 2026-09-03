// UN SEUL CATALOGUE DE HAUTEUR, ET C'EST CELUI DE L'AMONT — verrou d'ABSENCE.
//
// POURQUOI CE BANC EXISTE (2026-07-30) : l'hôte étalait DEUX catalogues dans le `ctx.pitchLib`
// qu'il tend à Kairos — celui de BPScript, puis PAR-DESSUS celui de bp3-frontend
// (`BP3_PITCH_CATALOG`, export qu'ils ont SUPPRIMÉ depuis — leur c35de48 ; ce banc garde donc un
// nom qui n'existe plus chez personne, et c'est voulu : il doit rester absent de MA source, qu'il
// soit ré-exporté un jour ou recopié à la main). Le commentaire qui portait cet étalement affirmait que les clés des deux
// côtés étaient « disjointes ». Mesuré le 2026-07-30 : FAUX. Les trois conventions du moteur BP3
// natif (`bp3_english`, `bp3_fr`, `bp3_indian`), leurs trois accordages et l'octavier `bp3_fr`
// existaient des DEUX côtés, et comme l'étalement de bp3-frontend passait en second, c'est la
// copie vouée au retrait qui était en vigueur à l'exécution.
//
// CE QUE CE BANC VERROUILLE, ET CE QU'UN « ÇA MARCHE » NE VERROUILLE PAS : le retrait était neutre
// à l'oreille (mêmes fréquences des deux côtés, mesuré sous graine figée sur les 14 grammaires
// `.gr` publiées et les 6 scènes `.bps` qui déclarent un alphabet `bp3_*`). Donc AUCUN banc de son
// ne redeviendrait rouge si l'étalement revenait — et c'est précisément pour ça qu'il faut un banc
// qui garde l'ABSENCE elle-même, et non son effet. Sans ça, la voie parallèle peut rentrer sans
// bruit, exactement comme elle est entrée.
//
// CE QUI A ÉTÉ RETIRÉ (2026-08-08), ET POURQUOI : ce banc a un temps porté un troisième test
// vérifiant que, DANS le catalogue amont, chaque convention BP3 pointait un accordage existant,
// lui-même pointant un tempérament existant, plus la présence de l'ancre (note de référence et
// diapason). Ce n'était pas à nous : Kanopi ne lit pas cette donnée, il la transporte verbatim
// jusqu'à Kairos, qui la résout — la cohérence interne du catalogue appartient à bpscript (qui le
// possède) ou à Kairos (qui le lit). Le fait qui l'a montré : quand le champ d'accordage a été
// renommé en amont le 2026-08-08, le SEUL code cassé chez nous était ce verrou — nous avons été
// mis en rouge par un champ que l'application ne lit jamais.
// ⛔ LU À LA PORTE DES OBJETS DEPUIS LE 2026-09-03, plus dans le paquet `bpscript/libs-data` : il
// SORT (décision de Romain, phase 5) et `adresses-de-catalogue.test.ts` verrouille désormais
// l'absence de tout lecteur. Le sujet de CE banc ne change pas — les trois conventions du moteur
// BP3 natif sont des entrées ORDINAIRES du catalogue de l'amont, sans branche BP3 nulle part.
// Une famille remplace un nom de fichier : `alphabet`, le mot qu'une scène invoque.
import { famille } from 'bpscript/objets';
import { describe, it, expect } from 'vitest';

// Source de l'adaptateur lue par le bundler (même route que le garde de corpus,
// `library/corpus-compile.test.ts:60`) : rien de Node ici, `src/` n'en porte pas les types.
const ADAPTATEUR = Object.values(
  import.meta.glob('./bpx-adapter.ts', { query: '?raw', import: 'default', eager: true }) as Record<
    string,
    string
  >
)[0];

/** Les trois conventions de notes du moteur BP3 natif, portées par l'amont depuis le 2026-07-29. */
const CONVENTIONS_BP3 = ['bp3_english', 'bp3_fr', 'bp3_indian'] as const;

const ALPHABETS = new Set((famille('alphabet')?.entrees ?? []).map((e) => e.nom));

describe('un seul catalogue de hauteur', () => {
  it('l’adaptateur n’étale AUCUN second catalogue dans le `pitchLib` qu’il tend à Kairos', () => {
    expect(
      ADAPTATEUR,
      'source de l’adaptateur illisible — ce banc ne mesurerait rien'
    ).toBeTruthy();
    // On ne juge que le CODE : les lignes de commentaire (dont celle qui raconte ce retrait)
    // sont écartées, sinon ce banc interdirait d'expliquer sa propre raison d'être.
    const fautives = ADAPTATEUR.split('\n')
      .map((t: string, i: number) => ({ n: i + 1, t }))
      .filter(({ t }) => !/^\s*(\/\/|\*|\/\*)/.test(t))
      .filter(({ t }) => /BP3_PITCH_CATALOG/.test(t));
    expect(
      fautives.map(({ n, t }) => `${n}: ${t.trim()}`),
      'un second catalogue de hauteur est de nouveau étalé dans PITCH_LIB — voir l’en-tête de ce banc'
    ).toEqual([]);
  });

  it('les trois conventions BP3 sont des entrées ORDINAIRES de la famille `alphabet`', () => {
    // ANTI-VACUITÉ : une famille vide passerait un « chacune est là » en n'ayant rien examiné.
    expect(
      ALPHABETS.size,
      'la famille `alphabet` est VIDE à la porte — rien à vérifier'
    ).toBeGreaterThan(3);
    for (const nom of CONVENTIONS_BP3) {
      expect(ALPHABETS.has(nom), `alphabet ${nom} absent de l’amont`).toBe(true);
    }
  });
});
