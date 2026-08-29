// UNE ENTRÉE DE CATALOGUE EST UN OBJET — le verrou de ce que mes listes affichent.
//
// ⛔ CE BANC VERROUILLE UNE ABSENCE, ET C'EST VOULU. Le défaut qu'il ferme ne rougissait nulle
// part : mon filtre écartait la clé `domain`, renommée `resolves` chez bpscript le 2026-08-10, et
// laissait donc passer `resolves` et `resolvedBy` — deux CHAÎNES — dans mes cinq catalogues de
// ressources. Dix non-entrées, deux par catalogue, sans un seul test rouge. Elles n'étaient pas
// affichées : `RESOURCE_GROUPS` sert une recherche PAR NOM, jamais une liste. Le défaut était
// latent, et c'est bien pour ça qu'il a tenu dix jours.
//
// Verrouiller sur la NATURE plutôt que sur des noms est ce qui rend ce banc durable : il ne cite
// aucun champ de bpscript, donc aucun renommage chez lui ne peut le périmer. C'est exactement la
// faute qu'il ferme, appliquée à lui-même.
import { describe, it, expect } from 'vitest';
import { RESOURCE_GROUPS, RESOURCE_FILES } from './resources';

describe('les entrées affichées dans mes listes de ressources', () => {
  it('sont toutes des OBJETS — jamais un champ de catalogue pris pour une entrée', () => {
    const intrus: string[] = [];
    for (const groupe of RESOURCE_GROUPS) {
      for (const entree of groupe.entries) {
        if (typeof entree.data !== 'object' || entree.data === null) {
          intrus.push(`${groupe.type}.${entree.id} = ${JSON.stringify(entree.data)}`);
        }
      }
    }
    expect(
      intrus,
      "Une entrée qui n'est pas un objet est un CHAMP du catalogue affiché comme s'il était une " +
        "ressource. Ne pas ajouter son nom à une liste d'exclusion : le filtre doit rester fondé " +
        'sur la nature, sinon le prochain renommage rouvrira ce trou en silence.'
    ).toEqual([]);
  });

  // ANTI-VACUITÉ : le test ci-dessus passe trivialement si les groupes sont vides — c'est-à-dire
  // précisément quand la donnée n'arrive plus. Le plancher est nettement sous le compte réel
  // (mesuré le 2026-08-20 : 176 tempéraments et 185 gammes à eux seuls).
  it('et elles sont là en nombre — un catalogue vide passerait le test précédent sans rien dire', () => {
    const total = RESOURCE_GROUPS.reduce((n, g) => n + g.entries.length, 0);
    expect(
      total,
      `${total} entrée(s) au total sur ${RESOURCE_GROUPS.length} groupe(s)`
    ).toBeGreaterThan(300);
  });

  // ⛔ UNE ADRESSE QUI CESSE DE RÉSOUDRE, ET C'EST LA SEULE DES DEUX FORMES QUI SE TAIT.
  //
  // J'adresse sept catalogues du paquet de bpscript par une clé écrite en dur — `LIBS.alphabets`,
  // `…tunings`, `…temperaments`, `…scales`, `…octaves`, `…core`, `…digital`. Ces clés sont
  // aujourd'hui le NOM DU FICHIER amont, et elles deviendront le MOT qui invoque la librairie
  // (décision `2026-08-29-le-paquet-publie-les-prototypes-et-un-catalogue-est-un-objet-distinct`).
  // Chaque clé qui change est une adresse de plus qui rend `undefined`.
  //
  // ⇒ MESURÉ LE 2026-08-29, ET LES DEUX FORMES NE SE VALENT PAS :
  //   · six des sept alimentent aussi `RESOURCE_GROUPS` — `entriesFromNamedCatalog(undefined)` JETTE
  //     au chargement du module, donc tout banc qui l'importe rougit. Elles crient déjà.
  //   · `digital` n'existe QUE comme carte de fichier entier. Sa disparition rend une carte au
  //     contenu vide, sans une seule assertion rouge. C'est exactement ce qu'a fait `mod` le
  //     2026-08-23 : `LIBS.mod` est passé à `undefined`, la carte est restée affichée, et rien
  //     ne l'a signalé (cf. l'en-tête de `resources.ts`).
  //
  // Ce verrou porte donc sur la population qui se tait — les cartes de fichier entier — et il ne
  // cite aucune clé : il lit la surface que je rends réellement, si bien qu'une carte ajoutée
  // demain entre dans son assiette sans qu'on y pense.
  it('chaque carte de librairie amont porte sa donnée — une adresse qui ne résout plus est un carton vide', () => {
    const vides: string[] = [];
    let examinees = 0;
    for (const fichier of RESOURCE_FILES) {
      if (fichier.language !== 'bpscript') continue;
      examinees++;
      if (typeof fichier.data !== 'object' || fichier.data === null) {
        vides.push(`${fichier.id} = ${JSON.stringify(fichier.data)}`);
      }
    }
    // ANTI-VACUITÉ : un garde qui n'a rien examiné passe, et il passerait le jour où la provenance
    // `bpscript` est renommée — c'est-à-dire au moment même où il devrait mordre.
    expect(examinees, 'ZÉRO carte de provenance bpscript examinée').toBeGreaterThan(0);
    expect(
      vides,
      "Cette carte adresse un catalogue amont par une clé qui ne résout plus : elle s'affiche avec " +
        'un contenu vide au lieu de disparaître ou de crier. Corriger la CLÉ, jamais retirer la carte.'
    ).toEqual([]);
  });
});
