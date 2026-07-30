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
import { describe, it, expect } from 'vitest';
import alphabetsJson from 'bpscript/lib/alphabets.json';
import tuningsJson from 'bpscript/lib/tunings.json';
import temperamentsJson from 'bpscript/lib/temperaments.json';
import octavesJson from 'bpscript/lib/octaves.json';

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

type Entree = Record<string, unknown>;
const ALPHABETS = alphabetsJson as unknown as Record<string, Entree>;
const ACCORDAGES = tuningsJson as unknown as Record<string, Entree>;
const TEMPERAMENTS = temperamentsJson as unknown as Record<string, Entree>;
const OCTAVIERS = octavesJson as unknown as Record<string, Entree>;

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

  it('les trois conventions BP3 sont des entrées ORDINAIRES du catalogue amont', () => {
    for (const nom of CONVENTIONS_BP3) {
      expect(ALPHABETS[nom], `alphabet ${nom} absent de l’amont`).toBeDefined();
    }
  });

  it('aucune référence ne pend : accordage, tempérament et octavier de chaque convention existent', () => {
    for (const nom of CONVENTIONS_BP3) {
      const alph = ALPHABETS[nom];
      const octavier = alph.octaves as string;
      const accordage = alph.defaultTuning as string;
      expect(OCTAVIERS[octavier], `${nom} → octavier « ${octavier} » introuvable`).toBeDefined();
      expect(
        ACCORDAGES[accordage],
        `${nom} → accordage « ${accordage} » introuvable`
      ).toBeDefined();
      const temperament = ACCORDAGES[accordage].temperament as string;
      expect(
        TEMPERAMENTS[temperament],
        `${accordage} → tempérament « ${temperament} » introuvable`
      ).toBeDefined();
      // L'ANCRE : sans note de référence + diapason, un alphabet émet sa clé et résout MUET
      // (c'était le défaut [79] d'origine). On garde donc les trois pièces sous verrou.
      expect(alph.baseNote, `${nom} sans note d’ancrage`).toBeTruthy();
      expect(alph.diapason, `${nom} sans diapason`).toBeTruthy();
      expect(alph.baseRegister, `${nom} sans registre d’ancrage`).toBeDefined();
    }
  });
});
