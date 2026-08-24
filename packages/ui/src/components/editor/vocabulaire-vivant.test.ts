// ⛔ MON ÉDITEUR DÉRIVE SON VOCABULAIRE DE LA SORTIE VIVE DE BPscript, ET RIEN NE LE VERROUILLAIT.
//
// `lang-bpscript.ts:26` et `bps-libword-highlight.ts:28` appellent `describeVocabulary()` à chaque
// construction. C'est le bon choix — l'éditeur suit le langage sans code à écrire, et une librairie
// d'utilisateur qui déclare un contrôle le voit apparaître. ⇒ Mais ce que ça achète, ça le paie :
// **un vocabulaire qui rétrécit chez BPscript retire des propositions et des couleurs à l'écran, et
// AUCUN rouge ne le dit.** Ni chez lui — il n'a pas d'instrument pour voir ce que je dérive — ni
// chez moi, où rien ne comparait.
//
// ⇒ CETTE POPULATION-LÀ EST ABSENTE DE SES PRÉAVIS, ET IL LA DEMANDE LUI-MÊME (2026-08-24) :
//   « Que faites-vous de ce que je publie — vous le COMPAREZ, vous l'EMPREIGNEZ, ou vous en
//     EXTRAYEZ une structure ? » Sa grille en compte cinq. Celle-ci en est une sixième, et elle est
//   plus discrète que les cinq : elle ne lit aucune de ses clés, ne compare aucun de ses textes,
//   n'empreint rien. Elle CONSOMME sa sortie et la met à l'écran.
//
// ⛔ CE QUE CE BANC VERROUILLE, ET CE QU'IL NE VERROUILLE PAS — la distinction fait tout.
//
// Il ne fige AUCUN compte : une égalité rougirait à chaque mot qu'un voisin ajoute légitimement, et
// un garde qui crie sur le travail juste est un garde qu'on désarme. Il pose un PLANCHER par axe et
// un TÉMOIN NOMMÉ, et il faut les deux :
//
//   le plancher seul   passerait si les 96 contrôles étaient remplacés par 96 AUTRES
//   le témoin seul     passerait si tout le reste s'effondrait autour de ses quelques mots
//
// Les mots du témoin sont pris parmi ceux que la bible du langage définit et que mes propres scènes
// écrivent — pas parmi les entrées d'une librairie, qui vont et viennent avec elle.
//
// ⛔ ET SON MORDANT SE PROUVE ICI, PAR INJECTION. La vérification est une fonction PURE, exercée
// sur des vocabulaires écrits à la main — jamais dérivés de la sortie réelle, faute de quoi le juge
// serait tiré de l'accusé. Injecter chez BPscript pour l'éprouver serait faire la chose que ce banc
// existe pour voir. Le contrôle POSITIF compte autant : une vérification qui refuserait tout serait
// rouge sur chaque injection et n'aurait rien prouvé.

import { describe, it, expect } from 'vitest';
// ⛔ ON LIT LA DÉRIVATION DE L'ÉDITEUR, PAS LA PORTE. Rappeler `describeVocabulary()` ici
// mesurerait ce que BPscript rend ; ce qui compte est ce que MON éditeur a en main — la même
// valeur que la complétion, les info-bulles et la coloration consomment. Et c'est aussi ce qui
// évite d'ouvrir une TRENTE-TROISIÈME lecture de source voisine : cette dette ne peut que
// rétrécir (décision de Romain, 2026-08-24), et mon pré-vol l'a refusée à juste titre.
import { vocab } from './lang-bpscript';

type Vocabulaire = Record<string, unknown>;

/** Les axes que mon éditeur consomme, avec le plancher sous lequel ils ne peuvent pas tomber.
 *  Mesuré le 2026-08-24 : voices 15 · keywords 68 · controls 96 · functions 4 · components 6 ·
 *  addressKeys 5 · qualifierKeys 7. Le plancher est posé BAS — il attrape un effondrement, pas
 *  une variation. */
const PLANCHERS: Record<string, number> = {
  voices: 5,
  keywords: 30,
  controls: 40,
  functions: 3,
  addressKeys: 3,
  qualifierKeys: 4
};

/** Des mots que la bible définit et que mes scènes écrivent — leur disparition est un fait, jamais
 *  un ajustement de librairie. */
const TEMOIN: Record<string, string[]> = {
  keywords: ['scale', 'alphabet', 'tuning', 'octaves', 'sound', 'eval', 'def', 'init', 'actor'],
  controls: ['wave', 'attack', 'release', 'volume'],
  functions: ['transpose'],
  addressKeys: ['channel', 'note', 'port'],
  qualifierKeys: ['legato', 'staccato']
};

/** Les axes rendus sous forme d'objet, dont mon éditeur lit les CLÉS. */
const CLES_ATTENDUES: Record<string, string[]> = {
  components: ['alphabet', 'tuning', 'octaves', 'scale', 'sound', 'eval'],
  syntaxWords: ['->', '<-']
};

const noms = (axe: unknown): string[] =>
  Array.isArray(axe)
    ? axe.map((e) =>
        typeof e === 'string'
          ? e
          : String((e as { name?: string; label?: string }).name ?? (e as { label?: string }).label ?? '')
      )
    : Object.keys((axe ?? {}) as Record<string, unknown>);

/**
 * LA VÉRIFICATION, PURE — rend la liste des manques, vide quand tout tient.
 *
 * ⛔ ELLE EST SÉPARÉE DE LA PORTE pour une seule raison : un garde qu'on n'a pas vu mordre est une
 * hypothèse, et le seul moyen de le voir mordre ici serait d'appauvrir le vocabulaire d'un voisin.
 */
export function verifierLeVocabulaire(entree: unknown): string[] {
  // La conversion vit ICI, au seul endroit où l'ignorance est réelle : cette fonction accepte
  // aussi bien la dérivation typée de l'éditeur que les vocabulaires injectés de l'épreuve.
  // La forcer à l'appel masquerait lequel des deux ne correspond pas.
  const v = (entree ?? {}) as Vocabulaire;
  const manques: string[] = [];

  // ⛔ UN GARDE COMPTE CE QU'IL A EXAMINÉ ET REFUSE D'AVOIR EXAMINÉ ZÉRO. Un axe absent rend
  // `undefined` : chaque comparaison de plancher passerait sur un test qui ne teste rien.
  for (const axe of [...Object.keys(PLANCHERS), ...Object.keys(CLES_ATTENDUES)])
    if (!(axe in v)) manques.push(`l'axe « ${axe} » a disparu de describeVocabulary()`);
  if (manques.length) return manques;

  for (const [axe, plancher] of Object.entries(PLANCHERS)) {
    const n = noms(v[axe]).length;
    if (n < plancher)
      manques.push(
        `describeVocabulary().${axe} rend ${n} entrée(s), plancher ${plancher}. Mon éditeur dérive ` +
          `ses propositions et sa coloration de cette sortie : ce qui disparaît ici disparaît de ` +
          `l'écran, SANS autre signal. Si le rétrécissement est voulu en amont, baisse le plancher ` +
          `DÉLIBÉRÉMENT et dis-le ; ne le retire pas.`
      );
  }

  for (const [axe, mots] of Object.entries(TEMOIN)) {
    const presents = noms(v[axe]);
    for (const mot of mots)
      if (!presents.includes(mot))
        manques.push(
          `le mot « ${mot} » a quitté describeVocabulary().${axe}. Mon éditeur cesse de le proposer ` +
            `et de le colorer, sans un rouge ailleurs. Un plancher seul ne l'aurait pas vu : le ` +
            `compte peut rester entier pendant que le vocabulaire change entièrement.`
        );
  }

  for (const [axe, cles] of Object.entries(CLES_ATTENDUES)) {
    const presentes = Object.keys((v[axe] ?? {}) as Record<string, unknown>);
    for (const c of cles)
      if (!presentes.includes(c))
        manques.push(`la clé « ${c} » a quitté describeVocabulary().${axe}`);
  }

  return manques;
}

/** Un vocabulaire de contrôle, conforme et écrit à la main — jamais dérivé de la porte réelle. */
function vocabulaireConforme(): Vocabulaire {
  const remplir = (n: number, prefixe: string) =>
    Array.from({ length: n }, (_, i) => `${prefixe}${i}`);
  return {
    voices: remplir(15, 'voix'),
    keywords: [...TEMOIN.keywords, ...remplir(60, 'mot')],
    controls: [...TEMOIN.controls, ...remplir(90, 'ctl')],
    functions: [...TEMOIN.functions, ...remplir(3, 'fn')],
    addressKeys: [...TEMOIN.addressKeys, ...remplir(2, 'adr')],
    qualifierKeys: [...TEMOIN.qualifierKeys, ...remplir(5, 'qua')],
    components: Object.fromEntries(CLES_ATTENDUES.components.map((c) => [c, []])),
    syntaxWords: Object.fromEntries(CLES_ATTENDUES.syntaxWords.map((c) => [c, []]))
  };
}

describe("le vocabulaire VIVANT que mon éditeur met à l'écran", () => {
  it('la dérivation de mon éditeur le tient aujourd’hui', () => {
    const manques = verifierLeVocabulaire(vocab);
    expect(manques, manques.join('\n')).toEqual([]);
  });

  // ─── LE MORDANT, ÉPROUVÉ PAR INJECTION, DANS LES DEUX SENS ─────────────────────────────────
  const INJECTIONS: [string, () => Vocabulaire, boolean][] = [
    ['le cas CONFORME — rien ne manque', vocabulaireConforme, false],
    [
      'un axe entier DISPARAÎT',
      () => {
        const v = vocabulaireConforme();
        delete v.controls;
        return v;
      },
      true
    ],
    [
      'un axe S’EFFONDRE sous son plancher',
      () => ({ ...vocabulaireConforme(), controls: TEMOIN.controls }),
      true
    ],
    [
      '⛔ le compte TIENT et les mots ont TOUS changé — ce que le plancher seul laisserait passer',
      () => ({
        ...vocabulaireConforme(),
        controls: Array.from({ length: 94 }, (_, i) => `inconnu${i}`)
      }),
      true
    ],
    [
      'UN SEUL mot de référence s’en va',
      () => {
        const v = vocabulaireConforme();
        v.keywords = (v.keywords as string[]).filter((m) => m !== 'actor');
        return v;
      },
      true
    ],
    [
      'une CLÉ d’un axe-objet s’en va',
      () => {
        const v = vocabulaireConforme();
        const c = { ...(v.components as Record<string, unknown>) };
        delete c.sound;
        v.components = c;
        return v;
      },
      true
    ],
    ['une porte qui rend un objet VIDE', () => ({}), true]
  ];

  for (const [quoi, fabriquer, doitMordre] of INJECTIONS) {
    it(`${doitMordre ? 'MORD' : 'laisse passer'} : ${quoi}`, () => {
      const manques = verifierLeVocabulaire(fabriquer());
      expect(manques.length > 0, manques.join('\n') || '(aucun manque)').toBe(doitMordre);
    });
  }
});
