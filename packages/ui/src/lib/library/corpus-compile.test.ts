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
// ou `@language: strudel` est du BPScript tout autant qu'une autre : elle a ses `core`, ses
// `actor`, ses règles `S -> …`. CE QUE LE FILTRE A COÛTÉ : `cv/cv-backtick.bps` et
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
// ⚠️ CONTRE QUELLE SURFACE CE GARDE EST-IL VERT ? MESURÉ le 2026-08-09 : la SOURCE de BPx
// (`/BPx/src/session.ts`, lu dans la pile d'appel réelle), pas son paquet bâti — son `exports`
// porte les deux conditions et c'est `development` qui gagne ici.
// POURQUOI C'EST ÉCRIT ICI : un vert de ce banc vaut contre ce qu'il EXÉCUTE. S'il lisait le
// paquet, une correction amont non rebâtie le laisserait vert contre l'ancien code et LE FAUX
// VERT SE TAIRAIT. Lisant la source, il suit l'arbre de travail du voisin — donc il voit ses
// corrections tout de suite, ET ses cassures avant qu'il publie.
// ⚠️ ET L'ENJEU A GRANDI : les scènes d'exemple d'Atlas et de bpscript entreront dans ce corpus,
// et ce banc les dérivera. Mon vert devient LEUR preuve — il doit donc dire de quoi il est la
// preuve. MESURER À NOUVEAU si la configuration de résolution change : la déduire du
// `package.json` ne suffit pas, la résolution réelle et le manifeste ne donnent pas toujours la
// même réponse (mesuré chez plusieurs voisins cette semaine). Le moyen employé ici : provoquer
// une erreur dans le module et lire le chemin dans sa pile.
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
 *  dépotoir de scènes cassées, chaque entrée porte sa raison.
 *
 *  ✅ RESSERRÉS LE MÊME JOUR, la perte amont ayant été réparée — l'épisode complet est gardé
 *  ci-dessous parce qu'il montre à quoi sert d'écrire un desserrage au lieu de le subir.
 *  Le refus nomme à nouveau l'entité (`'cv env1' est supprimé du langage…`), donc les cinq
 *  motifs l'exigent à nouveau et redeviennent discriminants scène par scène.
 *  ✅ ET LA NUANCE A ÉTÉ FERMÉE DANS LA FOULÉE : le refus liste désormais TOUTES les entités de
 *  la scène (« …en déclare 2 : envGroup, envNote »), et reste sobre quand il n'y en a qu'une.
 *  Les deux motifs concernés exigent donc la liste ENTIÈRE — c'est-à-dire aussi le COMPTE : si
 *  une scène gagne ou perd un modulateur, le garde le voit.
 *  ⚠️ ET LE COMPTE ANNONCÉ N'ÉTAIT PAS LE BON : bpscript annonçait 3 entités pour `patchbay`, le
 *  code en produit 4 (`lead, open, close, glide`). Mesuré, pas recopié — c'est la raison d'avoir
 *  relu le message entier au lieu de reprendre le chiffre du courrier.
 *
 *  ⚠️ CINQ MOTIFS AVAIENT ÉTÉ ÉLARGIS LE 2026-08-09, ET UN MOTIF ÉLARGI EST UN GARDE PLUS FAIBLE :
 *  je l'écris ici plutôt que de laisser le desserrage passer inaperçu. Ils exigeaient que le refus
 *  NOMME les entités concernées (`env1`, `sweep`, `envGroup, envNote`, `lead, open, close,
 *  glide`) — ce que le message amont faisait, et ne fait plus depuis la suppression des deux
 *  directives (bpscript 7a2d351). Le refus dit désormais que la directive est supprimée, sans dire
 *  CE QU'ELLE PORTAIT. Les motifs suivent donc le réel au maximum de spécificité disponible ; ce
 *  n'est pas un contournement, c'est une perte d'information en amont, signalée à bpscript le
 *  jour même. Si le nom des entités revient dans le message, RESSERRER ces cinq motifs. */
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
    // ⚠️ CETTE ENTRÉE A CHANGÉ DE MOTIF DEUX FOIS LE 2026-08-09, EN QUELQUES HEURES, ET LES DEUX
    // ALLERS-RETOURS SONT LA VRAIE INFORMATION — pas le motif final.
    // Le soir, bpscript a fermé `randomize` comme attribut de sac AVANT que sa relève existe : la
    // scène cessait d'ANALYSER, et j'ai basculé le motif dessus en écrivant dans `attend` que la
    // cause historique reviendrait DERRIÈRE. Elle est revenue moins d'une heure plus tard, la
    // fermeture ayant été reprise en amont — et le motif est donc rétabli tel qu'il était.
    // CE QUE ÇA VAUT : avoir écrit l'ORDRE des causes empilées a permis de rebrancher le garde
    // sans rien redécouvrir. Un rouge déclaré n'a pas UNE cause, il a une PILE ; ne pas croire le
    // sujet clos quand la première se lève.
    motif: /terminal '(a|b)' non déclaré/,
    cause: 'arbitrage-attendu',
    attend:
      "COMMENT BPScript écrit « un alphabet PLUS une convention de notes » — question chez Romain, 11 conversions concernées, 61 notes à déclarer. La source répond pour le CONTENU (le réglage natif -se.trySrand porte « NoteConvention: 0 » = anglaise, et -ho.tryKeyXpand déclare l'alphabet « a b ») ; ce qui manque est sa GRAPHIE en BPScript. Je n'y touche pas : c'est l'écriture de bpscript et l'arbitrage est chez Romain. ✅ ET SON SAC DE MODE N'EST PLUS UNE EXCEPTION EN ATTENTE — c'est LA FORME JUSTE. Décision Romain du 2026-08-09 : le critère est l'ISO avec le moteur natif, pas une préférence de graphie. BPx a dérivé cette grammaire AU BINAIRE et établi que LE NATIF A LES DEUX PLACES ET QUE LES DEUX AGISSENT — une règle varie à cause de la re-semence posée EN TÊTE, une autre à cause de celle qui la précède DANS UNE RÈGLE. Ce ne sont pas deux graphies pour une fonction, ce sont DEUX PORTÉES d'une même fonction. Le sac ne se ferme donc pas pour `randomize`, et cette scène le garde sans dérogation. ⚠️ CE QUI M'AVAIT FAIT LA DÉFAIRE RESTE VRAI ET N'EST PLUS UN OBSTACLE : j'avais migré, puis mesuré que la scène cessait de refuser sous graine figée — le mot quittait le champ que BPx lit. La mesure était juste ; c'est sa CONCLUSION qui a changé de sens. Ce n'était pas « la migration casse », c'était « les deux places existent, et l'une d'elles porte cette fonction »."
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
  // ── Les CINQ scènes cv/macro, décision Romain 2026-08-08 (KAN-40). 'cv' et 'macro' sont
  // supprimés du langage ; BPx refuse de les dériver au lieu de les avaler en silence (sans ce
  // refus, la scène dériverait SANS ERREUR et le dispatch en aval retomberait muet — mesuré sur
  // patchbay : 8 événements avant, 8 après, mais plus aucun armement). On ne migre PAS vers la
  // forme sans réglages qui compile aujourd'hui : ces déclarations portent des réglages de
  // départ (attack/decay/sustain/release, rate/amplitude/shape) que cette forme nue jetterait,
  // ce qui changerait la musique. La forme qui les préserve — « instance de module avec ses
  // réglages de départ » — existe dans la référence du langage mais pas dans le parseur, et elle
  // sera COMPLÈTEMENT REVUE avec l'arrivée de FaustX : l'écrire maintenant serait écrire une
  // forme qu'on remplacera. Elles RESTENT dans le corpus, déclarées rouges. Suivi : KAN-40.
  // CHANTIER DES GABARITS — CLOS, ET PAS PAR OÙ ON L'ATTENDAIT. On guettait la seconde marche chez
  // BPx ; c'est la SECTION ELLE-MÊME qui est sortie du langage (décision Romain 2026-08-16, retrait
  // et non conversion). `simpletemplates` garde ses gabarits vivants — `$` et `&` — et a perdu sa
  // section. `catalogue-de-gabarits-les-rangs` ne tenait QUE par elle : mesuré, aucun `$`, aucun `&`,
  // et la scène redevient verte en retirant ses trois lignes de catalogue. Elle est SUPPRIMÉE, donc
  // son inscription ici part avec elle — un rouge déclaré sans fichier est un mensonge de registre.
  {
    fichier: 'cv/cv-adsr.bps',
    motif: /'cv env1' est supprim(é|e) du langage/,
    cause: 'forme-a-venir',
    attend:
      'la forme « instance de module avec ses réglages de départ » (attack:5, decay:150, sustain:0.2, release:400 sur env1), pas encore dans le parseur, revue avec FaustX. Suivi : KAN-40.'
  },
  {
    fichier: 'cv/cv-lfo.bps',
    motif: /'cv sweep' est supprim(é|e) du langage/,
    cause: 'forme-a-venir',
    attend:
      'la forme « instance de module avec ses réglages de départ » (rate:0.4, amplitude:0.9, shape:sine sur sweep), pas encore dans le parseur, revue avec FaustX. Suivi : KAN-40.'
  },
  {
    fichier: 'synthesis/group-cutoff.bps',
    motif: /'cv env1' est supprim(é|e) du langage/,
    cause: 'forme-a-venir',
    attend:
      'la forme « instance de module avec ses réglages de départ » (attack:8, decay:750, sustain:0.1, release:300 sur env1), pas encore dans le parseur, revue avec FaustX. Suivi : KAN-40.'
  },
  {
    fichier: 'synthesis/superp-cutoff.bps',
    // ⚠️ LE MOTIF A MAIGRI PARCE QUE LE MESSAGE A MAIGRI, pas parce que j'ai relâché le garde. Le
    // compilateur nommait le COMPTE des déclarations (« déclare 2 : envGroup, envNote ») ; il ne le
    // fait plus. Ce qui reste discrimine encore cette scène de `group-cutoff` — le nom `envGroup`
    // n'appartient qu'à elle. La perte est remontée à bpscript le 2026-08-18.
    motif: /'cv envGroup' est supprim(é|e) du langage/,
    cause: 'forme-a-venir',
    attend:
      'la forme « instance de module avec ses réglages de départ » (envGroup : attack:600, decay:500, sustain:0.5, release:700 ; envNote : attack:5, decay:110, sustain:0.2, release:160), pas encore dans le parseur, revue avec FaustX. Suivi : KAN-40.'
  },
  {
    fichier: 'synthesis/patchbay.bps',
    // ⛔ CETTE SCÈNE A CHANGÉ D'ÉTAGE D'ÉCHEC, ET C'EST UNE PERTE DE DIAGNOSTIC, PAS UN PROGRÈS.
    // Avec l'arobase, le compilateur nommait le retrait : « '@macro lead' est supprimé du langage ».
    // Sans elle, `macro` n'est plus reconnu comme mot d'invocation : l'analyse le lit comme une tête
    // de règle et tombe sur la syntaxe (`Expected IDENT, got GT`), sans jamais dire POURQUOI. Les
    // quatre scènes `cv` du même lot, elles, sont toujours diagnostiquées nommément sous la forme
    // nue — donc le trou est propre à `macro`, chez bpscript, et il lui est remonté le 2026-08-18.
    // Le motif du jour dit ce que le compilateur écrit RÉELLEMENT ; il redeviendra nommé quand le
    // message le sera, et ce garde rougira alors pour le réclamer.
    motif: /Expected IDENT, got GT \(>\) at line 30/,
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
// ⚠️ CE BANC A ÉTÉ ÉTEINT ET RALLUMÉ **DEUX FOIS DANS LA MÊME JOURNÉE**, par deux fermetures
// amont différentes du même mot — et les deux fois il a repris tel quel.
//   · le matin : `randomize` fermé AU FIL DU FLUX. Romain rouvre la place, le banc reprend.
//   · le soir  : `randomize` fermé COMME ATTRIBUT DE SAC. La scène-témoin cessait même
//     d'ANALYSER. Suspendu, daté ; la fermeture est reprise en amont moins d'une heure plus tard,
//     le banc reprend.
// CE QUE J'EN RETIENS, ET C'EST LA RAISON DE GARDER CE TEXTE : un banc dont le sujet vit dans une
// surface en cours de refonte s'éteint et se rallume au rythme de l'amont. Le réflexe utile n'est
// pas de le protéger — c'est de SUSPENDRE DATÉ avec la condition de rallumage, pour que le
// rallumage soit mécanique au lieu d'être une redécouverte. Il l'a été deux fois.
// ⛔ ET IL RESTE FRAGILE : la scène porte encore un sac de mode, et le sac doit disparaître. Ce
// banc s'éteindra une troisième fois. La condition de rallumage est la même : que trySrand.bps
// analyse de nouveau.
// ⚠️ SUSPENDU LE 2026-08-10, DATÉ ET MOTIVÉ — pas « réparé », pas « sauvé ».
// Ce témoin n'ANALYSE plus : « terminal 'a' non déclaré ». Il porte lui-même la garde qui le dit
// (« le témoin existe et ANALYSE proprement, sinon on ne mesure pas la dérivation ») — il fait donc
// exactement son travail en refusant de rendre un vert.
//
// POURQUOI SUSPENDRE PLUTÔT QUE RÉPARER : sa scène a DEUX causes empilées, mesurées. Sur l'état
// commité d'hier elle échouait déjà, sur un attribut de brassage que le langage ne connaît plus ;
// la migration `controls` → `core` n'a fait que CHANGER SON MESSAGE. Le rebrancher sur un
// vocabulaire qui passe le viderait de son sujet — il mesure le rattrapage de graine, pas la
// capacité d'une scène à analyser.
//
// CONDITION DE LEVÉE : réécrire sa scène témoin dans la forme du jour, ET vérifier qu'elle exerce
// encore le rattrapage — les deux, pas l'un.
//
// ═════════════════════════════════════════════════════════════════════════════
// ⛔ LE SAUT EST RETIRÉ — UNE EXCEPTION SE NOMME, JAMAIS NE SE COMPTE (architecte [1283]/[1288]).
//
// CE BLOC A ÉTÉ UN `describe.skip` DU 2026-08-10 AU 2026-08-11, ET CE QUE LE RALLUMAGE A MONTRÉ
// EST LA RAISON MÊME DE LA RÈGLE : le saut couvrait TROIS bancs, et L'UN DES TROIS PASSAIT —
// « sous graine figée, la scène REFUSE » était VERT, et l'a été pendant toute la suspension.
// Un saut n'anesthésie pas ce qui casse : il anesthésie TOUT CE QU'IL CONTIENT, y compris la
// mesure qui marchait et qu'on croyait éteinte. Personne ne pouvait le savoir sans le rallumer.
//
// LA FORME QUI REMPLACE : la suspension devient une CLÉ, avec son MOTIF, exactement comme
// `ROUGES_DECLAREES` plus haut — et elle mord dans les deux sens.
//  · SENS 2 — le témoin se remet à analyser ⇒ ces bancs ROUGISSENT en réclamant leur propre
//    restauration. Une suspension morte ne peut plus survivre en affirmant un problème résolu.
//  · SENS 1 — le témoin échoue POUR UNE AUTRE RAISON ⇒ non couvert, donc rouge. Une seconde
//    casse ne peut plus se cacher derrière la première.
const SUSPENSION_TEMOIN = {
  /** La cause EXACTE, mesurée le 2026-08-11 : `analyse : terminal 'a' non déclaré — absent des
   *  alphabets en portée | terminal 'b' non déclaré — absent des alphabets en portée`. */
  motif: /terminal '[ab]' non déclaré/,
  /** Deux causes empilées : la scène porte encore un sac de mode que le langage ne connaît plus,
   *  et son alphabet en mémoire ne déclare plus ses deux terminaux. */
  levee:
    'réécrire la scène témoin dans la forme du jour ET vérifier qu’elle exerce encore le rattrapage'
} as const;
describe('le rattrapage de graine mord', () => {
  const source = Object.entries(BPS).find(([c]) => c.endsWith('BPScript-tests/trySrand.bps'))?.[1];
  const avecAlphabet = () =>
    source!.replace(
      'controls',
      'alphabet.bp3_english:midi\n@gate a:midi\n@gate b:midi\ncontrols'
    );

  it('SUSPENDU — le témoin n’analyse pas, et POUR SA RAISON déclarée', () => {
    expect(source, 'trySrand.bps introuvable dans le corpus').toBeDefined();
    const { errors } = compileToBPxAST(avecAlphabet()) as {
      ast: unknown;
      errors: { message?: string }[];
    };
    const msg = errors.map((e) => e.message ?? String(e)).join(' | ');
    // SENS 2 — elle analyse de nouveau : la suspension est levée, elle réclame son propre retrait.
    expect(
      errors.length,
      `trySrand.bps ANALYSE de nouveau — la suspension est levée : restaurer \`expect(errors).toEqual([])\` ici ET \`expect(statut(avecAlphabet())).toBeNull()\` plus bas, puis retirer SUSPENSION_TEMOIN (${SUSPENSION_TEMOIN.levee})`
    ).toBeGreaterThan(0);
    // SENS 1 — et pour LA raison déclarée, pas pour une seconde casse qui se cacherait derrière.
    expect(msg, `le témoin échoue, mais pas sur « terminal non déclaré » : ${msg}`).toMatch(
      SUSPENSION_TEMOIN.motif
    );
  });

  // VERROU REMIS À L'ENDROIT LE 2026-08-09, après avoir été RETOURNÉ quelques heures le même jour.
  // Il avait cessé de mordre, et la cause était DOUBLE — deux défauts indépendants qui se
  // masquaient l'un l'autre, chacun suffisant à éteindre ce banc :
  //   1. CHEZ BPx : son port du moteur natif ne lisait qu'une branche du `switch` qui traite
  //      `_destru`/`_randomize`/`_srand` au niveau de la déclaration de mode. `randomize` restait
  //      donc FAUX dans la grammaire compilée, et le refus ne pouvait pas se déclencher. Corrigé
  //      chez eux, banc de garde à 5 cas, morsure prouvée par injection.
  //   2. CHEZ MOI : ma migration du matin avait collé l'outil de brassage APRÈS l'accolade
  //      fermante, où il tombe dans les réglages du bloc que rien ne consomme. Corrigé ici.
  // ⚠️ CE BANC NE COUVRE QUE LE DÉFAUT 1, ET IL FAUT LE SAVOIR : BPx a posé que le refus dépend
  // de la DÉCLARATION seule, jamais de la position de l'outil — il revient donc dans les DEUX
  // écritures. Un vert ici n'a jamais rien dit, et ne dira jamais rien, du brassage lui-même.
  // C'est le banc suivant qui couvre le défaut 2, et son absence est exactement ce qui m'a laissé
  // rendre une scène inerte sans qu'aucun rouge ne se lève.
  it('sous graine figée, la scène REFUSE — le refus suit la DÉCLARATION de re-semence', () => {
    const { ast } = compileToBPxAST(avecAlphabet()) as { ast: unknown; errors: unknown[] };
    expect(() =>
      createSession(ast as Parameters<typeof createSession>[0], { seed: GRAINE }).derive()
    ).toThrow(/reseedOrShuffle/);
  });

  // ⚠️ CE BANC NE PROUVE PLUS RIEN TANT QUE LA RÉGRESSION CI-DESSUS TIENT, et il faut le dire au
  // lieu de le laisser vert : il passait parce que le rattrapage AVALAIT le refus ; il passe
  // aujourd'hui parce qu'il n'y a plus de refus à avaler. Même vert, deux causes opposées — et
  // rien dans le résultat ne les distingue. Il reprend son sens quand l'amont répare.
  it('SUSPENDU — le rattrapage ne se mesure pas, et POUR LA MÊME RAISON', () => {
    const echec = statut(avecAlphabet());
    // SENS 2 — le garde rend VERT : la cause est levée, ce banc reprend son assertion d'origine.
    expect(
      echec,
      `le garde rend VERT sur le témoin — la suspension est levée : restaurer \`expect(statut(avecAlphabet())).toBeNull()\` et retirer SUSPENSION_TEMOIN`
    ).not.toBeNull();
    // SENS 1 — et pour LA raison déclarée. Sans ceci, un échec de DÉRIVATION (le sujet du banc)
    // passerait pour l'échec d'ANALYSE de la suspension, et la mesure serait perdue en silence.
    expect(echec!, `il échoue, mais pas sur « terminal non déclaré » : ${echec}`).toMatch(
      SUSPENSION_TEMOIN.motif
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LE BANC QUI MANQUAIT, ET SON ABSENCE A COÛTÉ UNE SCÈNE INERTE PENDANT UNE JOURNÉE.
// Le 2026-08-09, en migrant la graphie, j'ai déplacé l'outil de brassage de DEVANT le bloc vers
// APRÈS l'accolade fermante. Le compte de jetons est resté IDENTIQUE, aucune erreur, aucun
// avertissement — et la scène ne brassait plus. Rien dans le dépôt ne pouvait le dire : le seul
// banc qui regardait par là mesure le REFUS, qui ne dépend que de la déclaration.
// CE BANC MESURE LA POSITION, ET ELLE SEULE. Il compare les deux écritures sous la MÊME graine :
// devant le bloc l'outil est consommé et l'ordre change ; collé après la fermante il tombe dans
// les réglages et l'ordre est celui de la scène sans outil du tout. C'est cette égalité-là — la
// forme collée indiscernable de l'absence d'outil — qui est le vrai visage du défaut.
// La re-semence est écartée dans les variantes en mémoire, et c'est délibéré : sans cela la
// dérivation refuse sous graine figée et on ne peut PAS observer l'ordre. Ce qu'on écarte ici
// n'est pas le sujet — le sujet est la position.
// ET LE GARDE QUI PROTÈGE LE CORPUS LUI-MÊME. Les trois bancs qui suivent mesurent des FORMES ;
// aucun ne regarde mes scènes. Sans celui-ci, on pourrait recoller l'outil dans un `.bps` sans
// qu'une seule assertion bouge — c'est précisément ce qui s'est produit le 2026-08-09. Un banc de
// forme dit ce que le langage fait ; seul un balayage dit ce que MES fichiers écrivent.
// LES BARRES AUTOUR D'UN NOM SONT SORTIES DU LANGAGE (décision Romain 2026-08-09) — elles ne
// restent qu'en ENTRÉE BP3, où `bp3-frontend` les lit et rend un nom ordinaire. Une scène
// BPScript qui les porte écrit donc une graphie que le langage ne reconnaît plus.
// MIGRÉES LE JOUR MÊME : `ruwet.bps` (182) et `transposition1.bps` (6). La migration a été
// mesurée AVANT/APRÈS sur l'arbre dérivé ENTIER — strictement identique, au temps de dérivation
// près (le seul champ non déterministe). Un compte de jetons égal n'aurait pas suffi : c'est
// exactement ce qui a laissé passer une scène inerte le matin même.
// `mm` EST SUPPRIMÉ, REMPLACÉ PAR `tempo` (décision Romain 2026-08-09, migration AVANT la
// fermeture amont). Ce garde couvre MES scènes ; les scènes `kairos-*` sont les siennes et il les
// migre de son côté — les exclure serait masquer sa dette, donc elles sont NOMMÉES ici tant
// qu'elles restent, et ce banc devra les inclure quand il aura poussé.
// ⚠️ LE GARDE LIT LES COMMENTAIRES, ET C'EST DÉLIBÉRÉ. La seule occurrence qu'il me restait
// vivait dans le `@tagline` de `learn/tuto-04-tempo.bps` — pas dans le code de la scène, qui
// écrivait déjà `tempo`, mais dans la MÉTADONNÉE DE CARTE affichée au rail (`scenes.ts:97`).
// Une forme morte dans une vitrine enseigne avant même qu'on ouvre le fichier ; un garde qui
// sauterait les lignes de commentaire ne l'aurait jamais vue.
// ⚠️ ET MON PREMIER BALAYAGE L'AVAIT RATÉE : mon motif exigeait un caractère après le mot, elle
// est en fin de phrase. C'est l'architecte qui l'a trouvée, pas moi. D'où le motif nu ci-dessous.
// ⛔ SECOND TROU, LE MÊME JOUR : la première version de ce garde cherchait `mm` — L'AROBASE. Or
// le mot vit AUSSI dans un sac de mode (`mode:ord(mm:60)`), où il n'y a pas d'arobase. Il ne
// voyait donc NI `tryTimePatterns.bps` NI `tryKeyXpand.bps`, les deux seuls fichiers réellement
// concernés — un garde posé contre une forme, aveugle à sa moitié. Les deux graphies sont
// couvertes depuis. La leçon vaut au-delà : un mot supprimé se cherche PAR LE MOT, pas par la
// ponctuation d'UNE de ses places.
describe('aucune scène à moi n’écrit `mm`, supprimé au profit de `tempo`', () => {
  it('balayage nommé, métadonnées ET sacs de mode compris', () => {
    const fautifs = Object.entries(BPS)
      .filter(([chemin]) => !chemin.includes('/kairos-'))
      // ⛔ LE DEUX-POINTS EST CE QUI TIENT CE GARDE, depuis que l'arobase est sortie du langage :
      // c'est lui qui sépare l'invocation `mm:70` du digramme `mm` de n'importe quel mot français.
      // Mesuré : le motif nu `/mm/` a rendu 122 scènes fautives sur 326 — « comment », « somme »,
      // « programme ». Un garde trop large fait migrer dans le vide aussi sûrement qu'un garde
      // trop étroit laisse passer. Les deux graphies d'hier — en tête de scène et dans un sac de
      // mode — ont FUSIONNÉ sous la forme nue : `mm:` les couvre toutes les deux.
      .filter(([, src]) => /\bmm\s*:/.test(src))
      .map(([chemin]) => chemin.split('/scenes/')[1] ?? chemin);
    expect(
      fautifs,
      '`mm` est supprimé du langage : écrire `tempo`. Vaut aussi dans les commentaires et les ' +
        'métadonnées de carte (`@tagline`), qui enseignent avant que le fichier soit ouvert.'
    ).toEqual([]);
  });
});

describe('aucune scène du corpus ne porte de barres autour d’un nom', () => {
  it('balayage nommé, fichier par fichier', () => {
    const fautifs = Object.entries(BPS)
      .filter(([, src]) =>
        src.split('\n').some((l) => !l.trimStart().startsWith('//') && /\|[^|\s]+\|/.test(l))
      )
      .map(([chemin]) => chemin.split('/scenes/')[1] ?? chemin);
    expect(
      fautifs,
      'la graphie à barres est sortie du langage BPScript : écrire le nom nu. Elle ne reste ' +
        'qu’en entrée BP3, lue par bp3-frontend.'
    ).toEqual([]);
  });
});

describe('aucune scène du corpus ne colle un outil sériel à une fermante', () => {
  const OUTILS = ['shuffle', 'order', 'retro', 'rotate', 'srand', 'randomize'];
  // Collé à `}` ou à `]` : les deux graphies de la faute, l'ancienne et celle de ma migration.
  const COLLE = new RegExp(`[}\\]]\\s*[([](?:${OUTILS.join('|')})\\b`);

  it('balayage nommé, fichier par fichier', () => {
    const fautifs = Object.entries(BPS)
      .filter(([, src]) =>
        src.split('\n').some((l) => !l.trimStart().startsWith('//') && COLLE.test(l))
      )
      .map(([chemin]) => chemin.split('/scenes/')[1] ?? chemin);
    expect(
      fautifs,
      'un outil sériel collé après une fermante tombe dans les réglages du bloc et n’est JAMAIS ' +
        'consommé : la scène compile, produit le même compte de jetons, et ne fait plus rien. ' +
        'L’écrire DEVANT le bloc, avec le point d’exclamation.'
    ).toEqual([]);
  });
});

describe('le brassage AGIT, et seulement devant le bloc', () => {
  const BLOC = '{C4 D4 E4 F4 G4}';
  // Le délimiteur sépare les invocations de la production : sans arobase pour les marquer, c'est
  // lui seul qui dit où finit le déclaratif. Une tête qui l'oublie ne s'analyse plus.
  const TETE = 'core\nalphabet.western:midi\n\n-----\nS -> ';
  const ordre = (regle: string) => {
    const { ast, errors } = compileToBPxAST(TETE + regle + '\n') as {
      ast: unknown;
      errors: unknown[];
    };
    expect(errors, `« ${regle} » doit analyser`).toEqual([]);
    const r = createSession(ast as Parameters<typeof createSession>[0], { seed: 3 }).derive();
    return (JSON.stringify((r as { tree: unknown }).tree).match(/"symbolId":\d+/g) ?? []).join(' ');
  };

  it('DEVANT le bloc : l’ordre CHANGE par rapport à la scène sans outil', () => {
    expect(ordre(`!(shuffle) ${BLOC}`)).not.toBe(ordre(BLOC));
  });

  it('et il suit la graine : deux graines, deux ordres', () => {
    const avec = (seed: number) => {
      const { ast } = compileToBPxAST(`${TETE}!(shuffle) ${BLOC}\n`) as { ast: unknown };
      const r = createSession(ast as Parameters<typeof createSession>[0], { seed }).derive();
      return (JSON.stringify((r as { tree: unknown }).tree).match(/"symbolId":\d+/g) ?? []).join(
        ' '
      );
    };
    expect(avec(3)).not.toBe(avec(11));
  });

  // ✅ LE CAS « COLLÉ = INERTE » A ÉTÉ RETIRÉ LE 2026-08-09, ET C'EST LE BANC LUI-MÊME QUI L'A
  // DEMANDÉ. Il était écrit pour rougir de deux façons, avec le geste inscrit pour chacune ; c'est
  // la seconde qui s'est produite, quelques heures plus tard : l'analyse REFUSE désormais la forme
  // collée (« 'shuffle' ne peut pas s'écrire sur un groupe — il ne vaut QUE dans le flux »,
  // bpscript 7a2d351). Le défaut ne peut donc plus s'écrire, et un cas qui vérifie l'inertie d'une
  // forme inécrivable ne garde rien.
  // CE QUI L'A TRANCHÉ N'EST PAS UN ARBITRAGE DE GRAPHIE mais une mesure du moteur d'origine :
  // l'outil sériel y cible ce qui SUIT le marqueur et la boucle s'arrête net sur une fermante —
  // 32 occurrences avant un bloc contre 2 après, qui portent sur la suite. La forme DEVANT n'est
  // donc pas seulement la seule qui agit : c'est la seule que le moteur ait jamais su lire.
  // Le balayage du corpus, lui, RESTE : le parseur ferme `shuffle` sur un groupe, mais rien ne
  // prouve qu'il ferme les cinq autres outils que ce balayage surveille, ni la forme collée à un
  // crochet. Un garde redondant qui NOMME le fichier fautif vaut mieux qu'un refus générique.
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
