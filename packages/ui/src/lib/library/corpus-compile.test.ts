// GARDE DE STATUT DU CORPUS — chaque scène BPScript de la bibliothèque a un statut ATTENDU, et
// le portillon échoue dès que le réel s'en écarte, DANS LES DEUX SENS.
//
// ⛔ DEUX ÉTAGES, ET LE SECOND A ÉTÉ AJOUTÉ LE 2026-07-29 PARCE QUE LE GARDE MENTAIT : il ne
// mesurait que l'ANALYSE. Or `koto1.bps` et `koto2.bps`, que je venais de réparer le matin même,
// analysaient proprement et JETAIENT à la dérivation (« SUB Insert: wildcard substitution
// misses ») — deux scènes déclarées vertes qui ne produisent rien. Un garde qui s'arrête à
// l'analyse dit « le corpus va bien » d'un corpus qui ne joue pas.
// MESURÉ AVANT D'ÉTENDRE, comme pour l'élargissement du périmètre plus bas : sur les 197 scènes
// qui analysent, 195 dérivent, 2 jettent (koto1/koto2), 0 ne produit zéro jeton. L'étage ajouté
// coûte exactement les 2 rouges RÉELS et aucun faux.
//
// POURQUOI (chantier `script`, [932], 2026-07-26) : quatre scènes deviennent ROUGES par
// INTENTION. Elles emploient des intentions qui n'ont pas encore de nom dans le langage (attente
// d'un nommage par Romain) et elles DOIVENT échouer bruyamment plutôt que rendre une musique
// plausible bâtie sur un mot vide. Or mon portillon ne compilait AUCUNE scène du corpus : il ne
// les voyait donc ni rouges ni vertes — pas « un lecteur pressé voit quatre scènes cassées »,
// mais « personne ne voit rien ». Une régression de compilation sur n'importe quelle scène
// passait tout aussi inaperçue.
//
// CE QUE CE GARDE DONNE, et qu'un simple « tout doit compiler » ne donne pas :
//   • une scène rouge PAR INTENTION est un PASS — mais seulement si elle échoue POUR LA RAISON
//     déclarée (le motif est vérifié dans le message), pas pour une autre casse ;
//   • une scène rouge NON déclarée = ÉCHEC = régression, avec son message ;
//   • une scène déclarée rouge qui se met à COMPILER = ÉCHEC AUSSI : sa cause a été levée en
//     amont, ce fichier doit sortir de la liste. Un rouge déclaré ne peut pas se fossiliser.
//
// CE QUE LA POSE DU GARDE A DÉJÀ ATTRAPÉ : deux rouges que le chantier n'avait pas vus —
// `generative/alan-dice.bps` et `world/shapes-rhythm.bps`, copies divergentes figées au
// 2026-07-13 des scènes de `BPScript-tests/`, exposées toutes deux dans le rail (l'utilisateur
// voyait deux cartes de la même pièce, dont une périmée). Romain a tranché : SUPPRIMÉES ([933]).
// Leurs entrées ont donc quitté la liste ci-dessous — et c'est le garde lui-même qui l'a réclamé,
// en échouant sur « déclarée rouge mais absente du corpus ».
//
// Périmètre : TOUTES les scènes `.bps` du corpus. (Les `.gr` ont leur propre analyse, parseBP3.)
//
// ⛔ CE PÉRIMÈTRE A ÉTÉ ÉLARGI LE 2026-07-29, ET LA RAISON NE DOIT PAS SE REPERDRE : le garde
// filtrait sur l'en-tête `@language: bpscript`, prenant une ÉTIQUETTE DE VITRINE pour un critère
// de périmètre. Or `@language` ne dit pas en quel langage la scène est écrite — il dit quel
// langage de VOIX elle met en scène, et il ne sert qu'au filtre déroulant de la bibliothèque
// (`stores/library.svelte.ts:103`) ; aucun code d'exécution ne le lit. Une scène `@language: js`
// ou `@language: strudel` est du BPScript tout autant qu'une autre : elle a ses `@core`, ses
// `@actor`, ses règles `S -> …`. CE QUE LE FILTRE A COÛTÉ : `cv/cv-backtick.bps` et
// `code-voices/cv-curve-js.bps` sont tombées avec le cassant du 2026-07-29 (forme déclarative nue
// supprimée) SANS que ce garde crie — deux scènes de vitrine cassées, invisibles.
// MESURÉ avant d'élargir, pour ne pas échanger un trou contre un faux rouge : sur les 202 `.bps`,
// 13 échouent, TOUTES étiquetées `bpscript`. Aucune des 49 scènes étiquetées strudel/p5/mercury/
// csound/hydra/js/sc n'échoue à l'analyse. L'élargissement ajoute 49 scènes surveillées et zéro
// échec nouveau.

import { describe, it, expect } from 'vitest';
// MÊME spécificateur que l'adaptateur (`bpx-adapter.ts:20`) — c'est lui que `tsconfig.paths`
// résout vers la surface typée du dépôt amont. Pas de second chemin d'import, pas de `declare
// module` recopié : le garde analyse par la porte que l'application emprunte.
import { compileToBPxAST } from 'bpscript/src/transpiler/index.js';
// MÊME porte de dérivation que l'application (`bpx-adapter.ts:52,1847`) : le garde mesure par
// où l'app passe, pas par un chemin de test à lui.
import { createSession } from 'bpx';

const BPS = import.meta.glob('../../../../library/scenes/**/*.bps', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

/** Rouges DÉCLARÉS : chemin → motif attendu dans l'erreur + ce que la scène attend.
 *  DEUX causes, qui ne veulent pas dire la même chose et ne se confondent pas :
 *   • 'nommage-attendu' — rouge TRANSITOIRE. La scène emploie une intention dont la forme
 *     existe désormais mais qu'elle n'a pas encore reçue. L'entrée doit disparaître quand la
 *     migration arrive, et le test le réclame de lui-même.
 *   • 'rouge-definitif' — rouge PERMANENT et VOULU. La verdir exigerait de mentir : soit
 *     inventer un nom pour une commande qui ne fait rien, soit retirer du natif ce que la
 *     scène traduit. Un rouge qui dit la vérité vaut mieux qu'un vert qui ment.
 *   • 'arbitrage-attendu' — rouge qui n'est ni voulu ni mécaniquement réparable : la forme
 *     existe, mais l'appliquer exigerait de CHOISIR quelque chose que la source ne dit pas.
 *     Catégorie ajoutée le 2026-07-29 plutôt que de ranger ces scènes sous 'nommage-attendu',
 *     qui aurait été faux : ce n'est pas un nom qui manque, c'est une décision. Chaque entrée
 *     nomme CE QU'ELLE ATTEND ET DE QUI. Un rouge d'arbitrage qui traîne est un arbitrage à
 *     relancer, pas un dû — s'il se fossilise, c'est le signe qu'on a cessé de demander.
 *  Toute AUTRE cause de rouge est une régression, donc un échec : cette liste n'est pas un
 *  dépotoir de scènes cassées, chaque entrée porte sa raison. */
const ROUGES_DECLAREES: Array<{
  fichier: string;
  motif: RegExp;
  cause: 'nommage-attendu' | 'rouge-definitif' | 'arbitrage-attendu' | 'bug-moteur-route';
  attend: string;
}> = [
  {
    fichier: 'BPScript-tests/shapes-rhythm.bps',
    motif: /script/,
    cause: 'rouge-definitif',
    attend:
      'RIEN — état stable : Tick cycle ON/OFF et Reset tick cycle ont un CORPS VIDE dans le moteur natif (ScriptUtils.c:1840,1844,1914), les nommer promettrait un effet inexistant ; Beep est hors périmètre par décision (Romain 2026-07-26). Ne pas « réparer ».'
  },
  {
    fichier: 'BPScript-tests/beatrix-dice.bps',
    motif: /script/,
    cause: 'nommage-attendu',
    attend: 'migration de « Wait for <note> channel » vers le trigger entrant (la forme existe)'
  },
  {
    fichier: 'BPScript-tests/alan-dice.bps',
    motif: /script/,
    cause: 'nommage-attendu',
    attend: 'migration de « Wait for <note> channel » vers le trigger entrant (la forme existe)'
  },
  // ── Les QUATRE rescapées du chantier « déclarer les terminaux » (2026-07-29). Six autres
  // scènes ont été réparées mécaniquement en LISANT la destination dans l'original BP3
  // (-ho./-mi. des `BP3-tests/*.gr`). Ces quatre-là résistent, et chacune pour une raison
  // DIFFÉRENTE — c'est ce qui interdit de les traiter d'un seul geste.
  // (Alarm.bps a QUITTÉ cette liste le 2026-07-29 : l'alphabet qu'elle attendait — `bp3_fr`,
  // la convention française du moteur natif — a été intégré en amont le matin même, et c'est
  // CE GARDE qui a réclamé le retrait, en échouant sur « COMPILE désormais ». Un rouge
  // d'arbitrage ne se fossilise pas : il sort dès que sa cause est levée.)
  {
    fichier: 'BPScript-tests/dhadhatite_v2.bps',
    motif: /terminal 'dha(dha)?' non déclaré/,
    cause: 'arbitrage-attendu',
    attend:
      "un arbitrage de TRADUCTION, pas de déclaration : la scène emploie des bols COMPOSÉS (dhadha, dhadhatitedhadhadheena) que l'alphabet original -al.dhadhatite ne contient pas — il n'a que les bols simples (dha, ti, te, na, dhee, tr). Les déclarer un par un figerait des composés que la source ne connaît pas. Attend : architecte."
  },
  {
    fichier: 'BPScript-tests/tryCsoundObjects.bps',
    motif: /terminal '(a|b|c|d|e|f|midiobject)' non déclaré/,
    cause: 'arbitrage-attendu',
    attend:
      "la DESTINATION Csound. L'alphabet original charge -mi ET -cs : ce sont des objets sonores Csound. Toutes les scènes déjà migrées vont vers :midi ; aucune ne montre comment s'écrit une destination Csound. Je n'invente pas un précédent. Attend : architecte / bpscript."
  },
  // (trySrand.bps est SORTIE puis RENTRÉE dans cette liste le 2026-07-29, et les deux mouvements
  // sont instructifs : bpscript a renommé ses cinq têtes A…E en A_r…E_r chez moi — elle a alors
  // analysé ET dérivé 35 jetons, et ce garde a exigé son retrait. Deux heures plus tard, le
  // fail-loud des groupes du MÊME auteur (e249886) l'a refait rougir, sur la raison qu'il avait
  // lui-même gravée dans le fichier : « aucun alphabet n'est déclaré, DÉLIBÉRÉMENT ».)
  {
    fichier: 'BPScript-tests/trySrand.bps',
    motif: /terminal '(a|b)' non déclaré/,
    cause: 'arbitrage-attendu',
    attend:
      "la question OUVERTE chez Romain : « un alphabet ET des notes dans la même portée ». La scène écrit simultanément des notes occidentales et des symboles abstraits `a`/`b` ; bpscript a délibérément refusé d'y déclarer un alphabet pour ne pas trancher cette question dans une scène, puis son propre fail-loud des groupes l'a rendue rouge. Je n'y touche pas : c'est son écriture, sa raison documentée, et l'arbitrage n'est ni à lui ni à moi. NOTE : l'alphabet EXISTE à la source (-ho.tryKeyXpand contient « a b ») — il n'est simplement pas déclaré dans la traduction."
  },
  {
    fichier: 'BPScript-tests/koto1.bps',
    motif: /SUB Insert: wildcard substitution misses/,
    cause: 'bug-moteur-route',
    attend:
      "un correctif du moteur de dérivation sur les règles SUB à jokers. MESURÉ que ce n'est PAS ma déclaration de terminaux : les trois variantes qui compilent (4 en @gate, seul `d` en @gate, seul `d` en @var) jettent TOUTES la même erreur. Ma migration du 2026-07-29 n'a pas causé ce défaut — elle l'a rendu ATTEIGNABLE (avant, la scène ne compilait pas, la dérivation n'était jamais lancée). Routé à l'architecte."
  },
  {
    fichier: 'BPScript-tests/koto2.bps',
    motif: /SUB Insert: wildcard substitution misses/,
    cause: 'bug-moteur-route',
    attend: 'idem koto1 — même erreur, même règle SUB à jokers, même origine amont.'
  }
];

const rougeDeclaree = (chemin: string) => ROUGES_DECLAREES.find((r) => chemin.endsWith(r.fichier));

const scenes = Object.entries(BPS).map(([chemin, src]) => ({ chemin, src }));

describe('[932] statut de compilation du corpus BPScript', () => {
  it('a bien trouvé le corpus (le glob ne ment pas par un ensemble vide)', () => {
    expect(scenes.length).toBeGreaterThan(20);
  });

  it('les rouges DÉCLARÉES sont toutes présentes dans le corpus', () => {
    for (const r of ROUGES_DECLAREES) {
      const trouvee = scenes.some((s) => s.chemin.endsWith(r.fichier));
      expect(trouvee, `${r.fichier} déclarée rouge mais absente du corpus`).toBe(true);
    }
  });

  /** Le statut RÉEL d'une scène : analysée, PUIS dérivée. Rend le premier échec rencontré,
   *  ou `null` si les deux étages passent. Le mot « analyse » ou « dérivation » est dans le
   *  message pour qu'un échec dise TOUT DE SUITE à quel étage il est tombé. */
  function statut(src: string): string | null {
    const { ast, errors } = compileToBPxAST(src) as {
      ast: unknown;
      errors: Array<{ message?: string }>;
    };
    if (errors.length) return `analyse : ${errors.map((e) => e.message ?? String(e)).join(' | ')}`;
    try {
      createSession(ast as Parameters<typeof createSession>[0], {}).derive();
      return null;
    } catch (e) {
      return `dérivation : ${String(e)}`;
    }
  }

  for (const { chemin, src } of scenes) {
    const attendu = rougeDeclaree(chemin);
    const nom = chemin.replace(/^.*\/scenes\//, '');

    if (attendu) {
      it(`${nom} — ROUGE DÉCLARÉ [${attendu.cause}] (attend : ${attendu.attend})`, () => {
        const echec = statut(src);
        // Elle DOIT échouer : si elle passe, sa cause est levée en amont et cette entrée doit
        // disparaître de ROUGES_DECLAREES (un rouge déclaré ne se fossilise pas).
        expect(
          echec,
          `${nom} PASSE désormais — sa cause (${attendu.cause} : ${attendu.attend}) a dû être levée : retirer cette entrée de ROUGES_DECLAREES`
        ).not.toBeNull();
        // …et pour LA RAISON déclarée, pas pour une autre casse qui se cacherait derrière.
        expect(echec!, `${nom} échoue, mais pas sur « ${attendu.motif} » : ${echec}`).toMatch(
          attendu.motif
        );
      });
    } else {
      it(`${nom} — analyse ET dérive`, () => {
        expect(statut(src), `${nom} ne passe plus`).toBeNull();
      });
    }
  }
});
