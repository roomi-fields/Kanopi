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

/** GRAINE FIGÉE — sans elle ce garde BASCULE, et un garde qui bascule est pire qu'un rouge.
 *
 * MESURÉ le 2026-07-29, après m'être trompé une première fois : `koto2.bps` jetait à 15h02,
 * dérivait à 15h20 sans que j'aie touché au fichier. J'ai d'abord conclu « ce n'est pas un
 * aléa » sur 20 dérivations passant 20/20 — CONCLUSION FAUSSE : la graine est semée UNE FOIS
 * par processus, mes 20 tirages partageaient donc la même. Entre deux runs, elle change.
 * Sous graine figée, koto1 ET koto2 jettent systématiquement, et sous les trois graines
 * essayées (1, 42, 7) : le comportement est reproductible, le « passe parfois » venait d'un
 * tirage d'horloge favorable.
 *
 * ⚠️ CE QUE CE GARDE NE PROUVE DONC PAS, et il faut le lire ici plutôt que le découvrir :
 * une scène verte l'est SOUS CETTE GRAINE. Une grammaire aléatoire peut dériver sous un
 * tirage et jeter sous un autre. Le déterminisme est ce qu'on gagne ; l'exhaustivité des
 * tirages n'est pas couverte. C'est le même choix que le mode test à graine figée ([921]) :
 * reproductible d'abord. */
const GRAINE = 1;

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
 *   • 'forme-a-venir' — rouge VOULU par une décision datée (Romain, 2026-08-08), pas encore
 *     mécaniquement réparable : la forme qui préserverait le sens de la scène (réglages de
 *     départ) existe dans la référence du langage mais pas dans le parseur, et elle sera
 *     COMPLÈTEMENT REVUE avec un chantier identifié (FaustX) — l'écrire maintenant reviendrait
 *     à écrire une forme qu'on remplacera. Migrer vers la forme sans réglages changerait la
 *     musique (enveloppes aux valeurs par défaut) : ce n'est pas une option silencieuse.
 *  Toute AUTRE cause de rouge est une régression, donc un échec : cette liste n'est pas un
 *  dépotoir de scènes cassées, chaque entrée porte sa raison. */
const ROUGES_DECLAREES: Array<{
  fichier: string;
  motif: RegExp;
  cause:
    | 'nommage-attendu'
    | 'rouge-definitif'
    | 'arbitrage-attendu'
    | 'bug-moteur-route'
    | 'forme-a-venir';
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
      "COMMENT BPScript écrit « un alphabet PLUS une convention de notes » — question chez Romain, 11 conversions concernées, 61 notes à déclarer. La source répond pour le CONTENU (le réglage natif -se.trySrand porte « NoteConvention: 0 » = anglaise, et -ho.tryKeyXpand déclare l'alphabet « a b ») ; ce qui manque est sa GRAPHIE en BPScript. Je n'y touche pas : c'est l'écriture de bpscript et l'arbitrage est chez Romain. ⚠️ UNE SECONDE CAUSE S'EST POSÉE DEVANT CELLE-CI PENDANT QUELQUES HEURES le 2026-08-09, et elle s'est levée : la fermeture de `randomize` au fil du flux (6b6a351) arrêtait l'analyse AVANT ce point. Migrer la scène l'aurait DÉTRUITE — le natif pose `_randomize` dans le flux et c'est le sujet même du test (« the two sequences derived from C also vary from one item to the next because of the _randomize tool that PRECEDES them », -gr.trySrand:18, là où `_srand(1)` fige B et D). Mesure portée à bpscript ; Romain a rouvert la place le jour même, et la scène est écrite en `!(randomize)`, à l'endroit du natif."
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
    attend:
      "idem koto1 — même erreur, même règle SUB à jokers, même origine amont. ⚠️ C'est elle qui a révélé que ce garde basculait : elle est SORTIE de cette liste puis y est RENTRÉE dans la même heure, parce qu'un tirage d'horloge favorable l'avait fait dériver une fois. Sous la GRAINE FIGÉE ci-dessus, elle jette de façon reproductible."
  },
  // ── Les CINQ scènes @cv/@macro, décision Romain 2026-08-08 (KAN-40). '@cv' et '@macro' sont
  // supprimés du langage ; BPx refuse de les dériver au lieu de les avaler en silence (sans ce
  // refus, la scène dériverait SANS ERREUR et le dispatch en aval retomberait muet — mesuré sur
  // patchbay : 8 événements avant, 8 après, mais plus aucun armement). On ne migre PAS vers la
  // forme sans réglages qui compile aujourd'hui : ces déclarations portent des réglages de
  // départ (attack/decay/sustain/release, rate/amplitude/shape) que cette forme nue jetterait,
  // ce qui changerait la musique. La forme qui les préserve — « instance de module avec ses
  // réglages de départ » — existe dans la référence du langage mais pas dans le parseur, et elle
  // sera COMPLÈTEMENT REVUE avec l'arrivée de FaustX : l'écrire maintenant serait écrire une
  // forme qu'on remplacera. Elles RESTENT dans le corpus, déclarées rouges. Suivi : KAN-40.
  {
    fichier: 'cv/cv-adsr.bps',
    motif: /'@cv' est supprimé du langage.*env1\./,
    cause: 'forme-a-venir',
    attend:
      'la forme « instance de module avec ses réglages de départ » (attack:5, decay:150, sustain:0.2, release:400 sur env1), pas encore dans le parseur, revue avec FaustX. Suivi : KAN-40.'
  },
  {
    fichier: 'cv/cv-lfo.bps',
    motif: /'@cv' est supprimé du langage.*sweep\./,
    cause: 'forme-a-venir',
    attend:
      'la forme « instance de module avec ses réglages de départ » (rate:0.4, amplitude:0.9, shape:sine sur sweep), pas encore dans le parseur, revue avec FaustX. Suivi : KAN-40.'
  },
  {
    fichier: 'synthesis/group-cutoff.bps',
    motif: /'@cv' est supprimé du langage.*env1\./,
    cause: 'forme-a-venir',
    attend:
      'la forme « instance de module avec ses réglages de départ » (attack:8, decay:750, sustain:0.1, release:300 sur env1), pas encore dans le parseur, revue avec FaustX. Suivi : KAN-40.'
  },
  {
    fichier: 'synthesis/superp-cutoff.bps',
    motif: /'@cv' est supprimé du langage.*envGroup, envNote\./,
    cause: 'forme-a-venir',
    attend:
      'la forme « instance de module avec ses réglages de départ » (envGroup : attack:600, decay:500, sustain:0.5, release:700 ; envNote : attack:5, decay:110, sustain:0.2, release:160), pas encore dans le parseur, revue avec FaustX. Suivi : KAN-40.'
  },
  {
    fichier: 'synthesis/patchbay.bps',
    motif: /'@macro' est supprimé du langage.*lead, open, close, glide\./,
    cause: 'forme-a-venir',
    attend:
      "la forme « instance de module avec ses réglages de départ », pas encore dans le parseur, revue avec FaustX — ET deux causes de plus, propres à cette scène : le domicile du câblage persistant (lead/open/close/glide) n'a pas de forme de remplacement tranchée, et ses modules (saw, lpf) sont absents du catalogue de modules (qui n'en porte que trois : adsr, lfo, ramp). Suivi : KAN-40."
  }
];

const rougeDeclaree = (chemin: string) => ROUGES_DECLAREES.find((r) => chemin.endsWith(r.fichier));

/** Le statut RÉEL d'une scène : analysée, PUIS dérivée. Rend le premier échec rencontré, ou
 *  `null` si les deux étages passent. Le mot « analyse » ou « dérivation » est dans le message
 *  pour qu'un échec dise TOUT DE SUITE à quel étage il est tombé. */
export function statut(src: string): string | null {
  const { ast, errors } = compileToBPxAST(src) as {
    ast: unknown;
    errors: Array<{ message?: string }>;
  };
  if (errors.length) return `analyse : ${errors.map((e) => e.message ?? String(e)).join(' | ')}`;
  try {
    createSession(ast as Parameters<typeof createSession>[0], { seed: GRAINE }).derive();
    return null;
  } catch (e) {
    // MÊME RATTRAPAGE QUE L'APPLICATION — et il est ÉPROUVÉ, voir le banc « le rattrapage de
    // graine mord » plus bas. Une grammaire à RE-SEMIS refuse de dériver sous graine figée : le
    // moteur exige une graine d'HORLOGE. L'adaptateur réessaie alors UNE fois sans graine
    // (`isRandomizeNeedsClock`, bpx-adapter.ts:1276 et 1876) et JOUE la scène. Sans ce
    // rattrapage, le garde la déclarerait rouge alors qu'elle marche à l'écran — un FAUX rouge,
    // aussi nuisible que le vert menteur.
    //
    // ⛔ CE RATTRAPAGE A ÉTÉ ÉCRIT, RETIRÉ, PUIS REMIS DANS LA MÊME HEURE, et la raison de
    // l'aller-retour est le principe qui compte : je l'avais retiré faute de TÉMOIN — un
    // rattrapage jamais exécuté dans un garde est du code qui a l'air de protéger et ne protège
    // rien. Je croyais alors qu'aucune scène BPScript ne pouvait exiger l'horloge. FAUX, et
    // c'est bpscript qui m'a corrigé ([1061]) : la graphie existe (`[shuffle]`, `![@seed:N]`),
    // ce sont `_rndseq`/`_randomize` — les mots INTERNES du moteur natif — qui n'en ont pas.
    // Le témoin est donc constructible, il est écrit plus bas, et le rattrapage est éprouvé.
    if (/reseedOrShuffle/.test(String(e)) && /wall-clock/.test(String(e))) {
      try {
        createSession(ast as Parameters<typeof createSession>[0], {}).derive();
        return null;
      } catch (e2) {
        return `dérivation (même sans graine figée) : ${String(e2)}`;
      }
    }
    return `dérivation : ${String(e)}`;
  }
}

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

// ─────────────────────────────────────────────────────────────────────────────
// LE RATTRAPAGE DE GRAINE MORD — et il sait aussi SE TAIRE. Un témoin qui ne prouve qu'un seul
// sens laisserait passer un rattrapage qui avale TOUT échec de dérivation.
//
// LE TÉMOIN N'EST PAS INVENTÉ : c'est `trySrand.bps` du corpus, à qui on donne EN MÉMOIRE
// l'alphabet que sa propre source déclare (son réglage natif `-se.trySrand` porte
// « NoteConvention: 0 » = anglaise, et `-ho.tryKeyXpand` déclare les deux terminaux « a b »).
// Rien n'est écrit dans le fichier : la scène reste rouge dans le corpus, son arbitrage est chez
// Romain. On se sert seulement du fait MESURÉ qu'elle exige une graine d'horloge — c'est
// exactement la cause que bpscript a fini par isoler chez lui ([1060]).
//
// ⚠️ CE BANC A ÉTÉ SUSPENDU QUELQUES HEURES LE 2026-08-09, ET CE QUI L'A RALLUMÉ VAUT D'ÊTRE SU.
// bpscript avait fermé ce matin-là (6b6a351) le mot `randomize` posé AU FIL DU FLUX — exactement
// ce qui portait la propriété mesurée ici. MESURÉ alors : `(shuffle)` seul dérive sans jeter, et
// `randomize` en tête de sous-grammaire dérive sans jeter non plus ; plus aucune scène ne refusait
// sous graine figée, le rattrapage n'avait plus rien à mordre.
// J'AI D'ABORD ESSAYÉ DE SAUVER LE BANC en écartant la ligne fermée dans la variante en mémoire :
// il est repassé au VERT en ne mesurant plus rien. C'est ce faux vert qui a imposé la mesure — et
// c'est elle, portée à bpscript avec la source native (`-gr.trySrand:12` et `:18`), qui a fait
// rouvrir la place par Romain le jour même. Le banc reprend donc tel quel, sur la forme rouverte
// `!(randomize)`, à l'endroit où le natif la pose.
describe('le rattrapage de graine mord', () => {
  const source = Object.entries(BPS).find(([c]) => c.endsWith('BPScript-tests/trySrand.bps'))?.[1];
  const avecAlphabet = () =>
    source!.replace(
      '@controls',
      '@alphabet.bp3_english:midi\n@gate a:midi\n@gate b:midi\n@controls'
    );

  it('le témoin existe et ANALYSE proprement (sinon on ne mesure pas la dérivation)', () => {
    expect(source, 'trySrand.bps introuvable dans le corpus').toBeDefined();
    const { errors } = compileToBPxAST(avecAlphabet()) as { ast: unknown; errors: unknown[] };
    expect(errors).toEqual([]);
  });

  // ⛔ VERROU RETOURNÉ LE 2026-08-09 — CE VERT EST UN CONSTAT DE PANNE, PAS UNE VALIDATION.
  // Jusqu'à ce jour, cette scène REFUSAIT de dériver sous graine figée, et c'est ce refus que le
  // rattrapage existe pour attraper. Elle ne refuse plus. MESURÉ, et la mesure dit que
  // l'information part bien mais n'arrive pas :
  //   - l'arbre PORTE `randomize` trois fois (un `InstantControl` dans le flux, un `modifiers[]`
  //     de sous-grammaire), donc bpscript le grave ;
  //   - BPx lit `subgram.randomize` (BPx/src/session.ts:930), un champ DIRECT de sous-grammaire ;
  //   - le même mécanisme MORD TOUJOURS par le chemin BP3 natif (test-mode-seed.test.ts:157,
  //     vert), donc le refus n'a pas été retiré de BPx — c'est la JOINTURE BPScript→BPx qui ne
  //     transmet plus.
  // CONSÉQUENCE MUSICALE, et c'est elle qui compte : une scène BPScript qui re-sème son tirage ne
  // le re-sème peut-être plus. Routé le 2026-08-09 (dérivation/arbre/contrôles → bpx).
  // POURQUOI RETOURNÉ ET NON SUSPENDU : un banc suspendu se tait ; celui-ci doit REDEVENIR ROUGE
  // le jour où l'amont répare, pour me forcer à le remettre à l'endroit. Le vert ci-dessous
  // verrouille donc l'ANOMALIE, pas le bon comportement.
  it('RÉGRESSION ROUTÉE — la scène ne refuse PLUS sous graine figée (à remettre à l’endroit)', () => {
    const { ast } = compileToBPxAST(avecAlphabet()) as { ast: unknown; errors: unknown[] };
    expect(() =>
      createSession(ast as Parameters<typeof createSession>[0], { seed: GRAINE }).derive()
    ).not.toThrow();
  });

  // ⚠️ CE BANC NE PROUVE PLUS RIEN TANT QUE LA RÉGRESSION CI-DESSUS TIENT, et il faut le dire au
  // lieu de le laisser vert : il passait parce que le rattrapage AVALAIT le refus ; il passe
  // aujourd'hui parce qu'il n'y a plus de refus à avaler. Même vert, deux causes opposées — et
  // rien dans le résultat ne les distingue. Il reprend son sens quand l'amont répare.
  it('sait MORDRE : le garde rend VERT une scène que la graine figée refuse', () => {
    expect(statut(avecAlphabet())).toBeNull();
  });
});

// Le second sens du rattrapage, lui, garde son sujet : il ne dépend pas de la scène suspendue
// ci-dessus. On ne suspend que ce qui a perdu de quoi mordre — le reste continue de verrouiller.
describe('le rattrapage de graine sait SE TAIRE', () => {
  it('il n’avale pas un échec de dérivation ORDINAIRE', () => {
    // koto1 jette sur les règles SUB à jokers, PAS sur la graine — le rattrapage ne doit pas
    // s'en mêler, et le message doit rester celui de la vraie cause.
    const koto1 = Object.entries(BPS).find(([c]) => c.endsWith('BPScript-tests/koto1.bps'))?.[1];
    expect(koto1).toBeDefined();
    expect(statut(koto1!)).toMatch(/SUB Insert: wildcard substitution misses/);
  });
});
