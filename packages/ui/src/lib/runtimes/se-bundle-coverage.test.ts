// Garde de COUVERTURE -se (backlog SE-BUNDLE, point 7).
//
// Un `.gr` référence son timing moteur BP3 dans un fichier `-se.<name>` frère. Si le nom
// référencé n'est PAS dans `BUNDLED_SE`, `resolveSeSettings` retombe à un beat 1000 ms
// (×4/3 hors tempo natif) — historiquement EN SILENCE. Le runtime avertit désormais bruyamment
// (`warnSeOnce`), et ce garde attrape le trou AU BUILD : chaque `-se` référencé par une scène
// bundle DOIT être présent dans `BUNDLED_SE`. Ajouter un `.gr` qui pointe un `-se` non bundlé
// fait ÉCHOUER la CI, pas jouer une scène muettement dégradée.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { BUNDLED_SE } from './bp3-aux';
import { resolveSeSettings } from './bpx-adapter';

// ⛔ CE GARDE A ÉTÉ VERT SUR LE MAUVAIS DOSSIER, DU JOUR DE SON ÉCRITURE AU 2026-08-11.
//
// Il ne lisait que `library/scenes/bp3/*.gr` — LA VITRINE, une trentaine de grammaires — alors que
// le corpus de conformité vit dans `scenes/BP3-tests` et en porte 113. Mesuré le jour où on l'a
// élargi : les 113 référencent 81 réglages DISTINCTS, le bundle en portait 24. CINQUANTE-SEPT
// grammaires dérivaient donc au timing moteur par défaut au lieu du leur — pas d'erreur, pas de
// rouge, un `console.warn`, et la scène joue faux.
//
// LA FAUTE EST DANS L'INSTRUMENT, PAS DANS LA LECTURE : le garde écrit pour empêcher exactement ce
// défaut regardait ailleurs. Un garde ne prouve que sur le périmètre qu'il balaie, et son vert ne
// dit jamais lequel — il faut donc que le périmètre soit ÉCRIT ici, pas déduit d'un chemin.
const GR = import.meta.glob(
  ['../../../../library/scenes/bp3/*.gr', '../../../../library/scenes/BP3-tests/*.gr'],
  {
    query: '?raw',
    import: 'default',
    eager: true
  }
) as Record<string, string>;

/** Extrait les noms de `-se` référencés dans un texte `.gr` (`-se.<nom>`).
 *
 * ⛔ ON MESURE LA FORME, PAS UN JEU DE CARACTÈRES DEVINÉ — et il a fallu trois essais.
 * Le motif d'origine `[A-Za-z0-9_]+` tronquait au point ; corrigé en `[A-Za-z0-9_.]+`, il
 * tronquait encore au tiret et à l'esperluette. `-se.check&` devenait `check`, `-se.dhin--`
 * devenait `dhin`, `-se.look-and-say` devenait `look` : trois noms inventés, qui n'existent nulle
 * part, et donc trois FAUX ROUGES nommant des fichiers imaginaires.
 *
 * LA FORME, MESURÉE SUR LES 113 GRAMMAIRES : la référence est TOUJOURS seule sur sa ligne, à la
 * colonne zéro, et le nom court jusqu'à la fin de la ligne. Aucune occurrence de `-se.` ailleurs
 * dans le corpus. On lit donc la LIGNE, et le nom est tout ce qui suit le préfixe. Un jeu de
 * caractères se devine et se retrouve faux ; une forme se mesure. */
function referencedSe(gr: string): string[] {
  return gr
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('-se.'))
    .map((l) => l.slice('-se.'.length).trim())
    .filter(Boolean);
}

// LES EXCEPTIONS SE NOMMENT, JAMAIS NE SE COMPTENT — chacune avec SA cause et SA condition de
// levée (architecte [1303] : « les 57 se traitent ou se nomment une par une »). Cinquante-quatre
// ont été TRAITÉES en dérivant le bundle des dossiers ; il en reste TROIS, et aucune ne se
// ressemble.
const SANS_REGLAGE: { cle: string; cause: string; levee: string }[] = [
  {
    // Le fichier `-se.checkVolChan` n'existe PAS dans `test-assets/bp3/commun`, et la table de
    // correspondance de bp3-engine ne donne AUCUN `-se` à cette grammaire (seulement un `-al`).
    // Ce n'est donc pas un oubli de bundle : le réglage n'existe nulle part.
    cle: 'checkVolChan.gr → -se.checkVolChan ABSENT de BUNDLED_SE',
    cause: 'réglage inexistant — ni fichier, ni entrée dans la table de correspondance',
    levee: 'que bp3-engine livre le fichier ou déclare le couple'
  },
  {
    // Identique : aucun fichier, aucune entrée `-se` dans la table.
    cle: 'tryConsoleMaxTime.gr → -se.tryConsoleMaxTime ABSENT de BUNDLED_SE',
    cause: 'réglage inexistant — ni fichier, ni entrée dans la table de correspondance',
    levee: 'que bp3-engine livre le fichier ou déclare le couple'
  },
  {
    // ⚠️ CELLE-CI N'EST PAS UN TROU DE BUNDLE, C'EST UNE GRAMMAIRE ABÎMÉE. Le réglage
    // `-se.tryflags3` EXISTE. La ligne du fichier porte littéralement `-se.tryflags3<br>` : le
    // corpus contient deux fichiers `*.html.gr` exportés depuis une page web, balises comprises.
    // Le frontal lira donc le même nom fantaisiste que ce garde — la grammaire est cassée pour
    // tout le monde, pas seulement ici. NE PAS « nettoyer » la balise dans le lecteur : ce serait
    // réparer un corpus dans un instrument de mesure, et masquer un fichier à corriger.
    cle: 'tryflags3.html.gr → -se.tryflags3<br> ABSENT de BUNDLED_SE',
    cause: 'grammaire exportée en HTML — la balise <br> est collée au nom du réglage',
    levee: 'que le fichier du corpus soit nettoyé de ses balises (le réglage, lui, existe)'
  }
];

describe('couverture -se — chaque -se référencé par une scène bundle est bundlé', () => {
  const files = Object.keys(GR);

  it('a trouvé les grammaires bundlées', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('tout -se référencé existe dans BUNDLED_SE (sinon timing ×4/3 muet)', () => {
    // Un couple (grammaire, réglage) par CAUSE — une grammaire qui cite son `-se` trois fois dans
    // son texte n'est pas trois défauts. Sans cette déduplication le rapport disait 210 pour
    // 57 causes, et un nombre gonflé se lit comme un chantier plus gros qu'il n'est.
    const missing = [
      ...new Set(
        files.flatMap((path) => {
          const base = path.split('/').pop();
          return [...new Set(referencedSe(GR[path]))]
            .filter((name) => !(name in BUNDLED_SE))
            .map((name) => `${base} → -se.${name} ABSENT de BUNDLED_SE`);
        })
      )
    ].sort();
    const nommees = SANS_REGLAGE.map((e) => e.cle);
    // SENS 1 — un trou NON nommé n'est pas couvert : il rougit, avec son nom.
    const inattendues = missing.filter((m) => !nommees.includes(m));
    expect(
      inattendues,
      `${inattendues.length} réglage(s) référencé(s) mais non bundlé(s) ET NON NOMMÉ(S) — chacune ` +
        `de ces grammaires dérive au timing moteur PAR DÉFAUT au lieu du sien, sans erreur ni ` +
        `rouge :\n  ` +
        inattendues.join('\n  ')
    ).toEqual([]);
    // SENS 2 — une exception dont l'écart a DISPARU fait échouer le garde et réclame son retrait.
    // Sans ce sens, la liste accumule des entrées mortes qui affirment un problème déjà réglé.
    const eteintes = SANS_REGLAGE.filter((e) => !missing.includes(e.cle));
    expect(
      eteintes.map((e) => e.cle),
      `exception(s) nommée(s) dont l'écart a DISPARU : le réglage est désormais résolu, retirer ` +
        `ces entrées de SANS_REGLAGE (${eteintes.map((e) => e.levee).join(' · ')})`
    ).toEqual([]);
  });

  it('le détecteur mord (non-vacuité) : un -se fictif non bundlé est vu manquant', () => {
    const fakeGr = '// grammaire\n-se.__pas_bundle__\ngram#1[1] S --> A';
    const refs = referencedSe(fakeGr);
    expect(refs).toContain('__pas_bundle__');
    expect('__pas_bundle__' in BUNDLED_SE).toBe(false);
  });
});

// ⛔ LE TÉMOIN QUI PROUVE QUE LA RÉPARATION SERT À QUELQUE CHOSE — sans lui, tout ce qui précède
// ne prouve que « le compte a grossi », ce qui n'est pas la question.
//
// CE QU'IL VERROUILLE : trois grammaires du corpus dont le réglage n'était PAS embarqué avant le
// 2026-08-11 doivent maintenant rendre un timing moteur RÉEL. Elles dérivaient au défaut — beat de
// 1000 ms au lieu du leur — sans erreur ni rouge.
//
// ⚠️ ET IL EXIGE UNE VALEUR, PAS UNE PRÉSENCE : un réglage résolu qui ne porterait aucun champ de
// timing laisserait le moteur à son défaut tout en passant un banc qui vérifie « c'est défini ».
describe('les réglages du corpus sont RÉSOLUS, et ils portent un timing', () => {
  // Trois des cinquante-sept, prises dans des familles différentes du corpus.
  for (const nom of ['koto1', 'dhadhatite', 'tryRagas']) {
    it(`-se.${nom} rend un timing moteur réel (il était absent du bundle avant)`, () => {
      const s = resolveSeSettings([{ prefix: 'se', name: nom }] as never);
      expect(s, `-se.${nom} ne se résout pas : la grammaire dérive au défaut moteur`).toBeDefined();
      const champs = Object.entries(s ?? {}).filter(([, v]) => v !== undefined);
      expect(
        champs.length,
        `-se.${nom} se résout mais ne porte AUCUN champ de timing — le moteur reste à son défaut, ` +
          `et un banc qui n'exige que « défini » l'aurait laissé passer`
      ).toBeGreaterThan(0);
    });
  }
});

describe("resolveSeSettings n'échoue plus EN SILENCE (avertit bruyamment)", () => {
  afterEach(() => vi.restoreAllMocks());

  it('un -se RÉFÉRENCÉ mais absent → console.warn (+ undefined, dégradation gracieuse)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = resolveSeSettings([{ prefix: 'se', name: '__conf_test_absent__' }] as never);
    expect(out).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/__conf_test_absent__.*ABSENT/);
  });

  it('AUCUN -se référencé → undefined SANS warn (défaut moteur légitime)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = resolveSeSettings([{ prefix: 'al', name: 'x' }] as never);
    expect(out).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });
});
