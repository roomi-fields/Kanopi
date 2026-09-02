import { describe, it, expect } from 'vitest';

// LES CATALOGUES DE PROJECTION ONT UNE SEULE SOURCE — le garde qui empêche les copies de revenir.
//
// ⛔ CE QU'IL FERME, et c'est moi qui l'ai mesuré avant de le subir : les catalogues de projection
// (numérique, voix, homomorphisme, modulation — et la hauteur, tant que l'hôte la transportait)
// étaient RECOPIÉS À LA MAIN sur TROIS sites — l'évaluation, la mise à jour vivante, le re-tirage
// de boucle. Trois listes à tenir d'accord, et rien pour le vérifier.
//
// POURQUOI UN GARDE PLUTÔT QU'UNE RELECTURE : un câblage PARTIEL NE CRIE PAS. Kairos refuse
// bruyamment quand rien n'est branché — mais un catalogue manquant sur UN des trois sites fait
// simplement DISPARAÎTRE sa facette. La hauteur devient absente, les sons ne se résolvent plus,
// et la scène continue de jouer. Le défaut se lit alors « cette scène est comme ça ».
// Et les deux copies dérivées ne sont exercées QUE par un geste vivant (re-éval du même fichier,
// bord de boucle) : les chemins que les bancs traversent le moins.
//
// ⚠️ CE GARDE LIT LE TEXTE DE LA SOURCE, ET C'EST ASSUMÉ. Le défaut est STRUCTUREL — « la liste
// est écrite à plusieurs endroits » — pas comportemental. Aucune exécution ne peut le voir : les
// trois sites se comportent identiquement TANT QU'ILS SONT D'ACCORD, et le jour où ils divergent
// c'est une facette qui manque, pas une erreur. Un banc de comportement arriverait après.
// Lu par le même moyen que les autres gardes de source du dépôt (`entete-carte.test.ts`) : le
// glob de Vite, qui marche en banc comme à la construction.
const SOURCE = (
  import.meta.glob('./bpx-adapter.ts', {
    query: '?raw',
    import: 'default',
    eager: true
  }) as Record<string, string>
)['./bpx-adapter.ts'];

// ⚠️ LES COMMENTAIRES SORTENT AVANT DE COMPTER, ET LE GARDE ME L'A APPRIS SUR LUI-MÊME : sa
// première passe a accusé `modulation:` de deux poses. La seconde était une LIGNE DE COMMENTAIRE
// (`bpx-adapter.ts:94`) qui décrit le contrat de `charger`. Un marqueur doit compter une FORME —
// une clé POSÉE dans un objet — jamais un mot. J'ai corrigé le garde plutôt que son attente :
// ajuster le nombre à ce qui sort est précisément la triche que ce fichier existe pour empêcher.
const CODE = SOURCE.split('\n')
  .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
  .join('\n');

/** Les clés que porte le contexte de projection, au-delà de ce que BPx construit. */
const CATALOGUES = ['digitalLib:', 'voicesLib:', 'homomorphismeLib:', 'modulation:'];

describe('le contexte de projection a UNE source, pas trois', () => {
  it('la fabrique existe (sinon ce garde mesurerait le vide)', () => {
    expect(SOURCE).toContain('function contexteDeProjection(');
  });

  for (const cle of CATALOGUES) {
    it(`${cle} n’est posé qu’à UN endroit`, () => {
      const n = CODE.split(cle).length - 1;
      expect(
        n,
        `${cle} apparaît ${n} fois dans bpx-adapter.ts. Un catalogue posé à plusieurs endroits ` +
          `est une liste à tenir d’accord à la main : le jour où l’une diverge, sa facette ` +
          `disparaît SANS erreur. Passer par contexteDeProjection().`
      ).toBe(1);
    });
  }

  // ⛔ LE VERROU RETOURNÉ, DEUX FOIS.
  //
  // `pitchLibMine:` — un canal dédié aux librairies personnelles — est sorti le 2026-08-20 : « il ne
  // doit y avoir strictement aucune particularité relative aux librairies personnelles, et c'est le
  // compilateur qui résout les fichiers de librairie » (décision Romain 2026-08-19), en lockstep
  // avec Kairos qui l'a retiré de son type publié au même moment.
  //
  // `pitchLib:` — le sac des catalogues de hauteur que l'hôte tendait à Kairos — est sorti le
  // 2026-09-02 : « l'arbre joint le contenu des librairies qu'il invoque » (décision Romain), Kairos
  // lit `metadata.librairies` et l'a confirmé avec sa mesure (écart de fréquence section-contre-sac
  // ZÉRO, amendement ratifié `afe4f48`). « L'hôte fournit les catalogues à l'utilisateur, pas aux
  // composants de l'infrastructure. »
  //
  // Le cas qui verrouillait une PRÉSENCE ne se supprime pas, il verrouille son ABSENCE : sinon rien
  // n'empêcherait le transport de repousser — sous son nom ou sous un nom neutre — et les deux
  // décisions interdisent exactement cela. Le compilateur résout, l'arbre porte, l'aval lit.
  it('et AUCUN sac de hauteur, ni AUCUN canal de librairie personnelle, n’est transporté', () => {
    const suspects = ['pitchLib:', 'pitchLibMine', 'personalPitchLib', 'libMine', 'mineLib'];
    const poses = suspects.filter((c) => CODE.includes(c));
    expect(
      poses,
      'un transport de hauteur est reposé dans bpx-adapter.ts. La hauteur se lit dans ' +
        "`metadata.librairies` de l'arbre ; l'hôte ne tend plus de sac à Kairos, et ne monte pas " +
        'un chemin neuf sous un nom neutre.'
    ).toEqual([]);
  });

  // ⚠️ ET LE SENS INVERSE, sinon ce garde passerait sur une fabrique VIDE : elle doit porter
  // chaque catalogue de la liste. Sans ce cas, supprimer une ligne de la fabrique rendrait le
  // compte « 0 » — donc pas « plusieurs » — et les autres cas resteraient verts pendant qu'une
  // facette a disparu.
  it('et la fabrique les porte TOUS', () => {
    const debut = CODE.indexOf('function contexteDeProjection(');
    const corps = CODE.slice(debut, CODE.indexOf('\n}', debut));
    const absents = CATALOGUES.filter((c) => !corps.includes(c));
    expect(
      absents,
      'catalogues absents de la fabrique — leur facette ne sera jamais gravée'
    ).toEqual([]);
  });

  // Les trois sites de `charger` s'en servent — un quatrième site qui reconstruirait sa propre
  // liste serait attrapé par les cas ci-dessus ; celui-ci vérifie que les trois connus l'appellent.
  it('les trois sites de projection appellent la fabrique', () => {
    const n = CODE.split('contexteDeProjection(').length - 1;
    // 1 définition + 3 appels.
    expect(n, 'un site de projection ne passe pas par la fabrique').toBe(4);
  });
});
