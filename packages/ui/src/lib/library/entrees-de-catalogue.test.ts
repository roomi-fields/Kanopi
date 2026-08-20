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
import { RESOURCE_GROUPS } from './resources';

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
});
