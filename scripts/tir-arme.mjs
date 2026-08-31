#!/usr/bin/env node
/**
 * TIRER SUR UNE FENÊTRE MESURÉE — jamais au jugé, et jamais sans l'avoir demandée.
 *
 * ⛔ POURQUOI CE FICHIER EXISTE. Une campagne de portillon dure 15 à 16 minutes, dont 13 d'écran.
 * Les voisins que je lis VIVANTS enregistrent sous mes portes toutes les 3 à 8 minutes quand ils
 * sont en chantier. Le 2026-08-20, TROIS campagnes consécutives ont été invalidées par une bascule :
 * 906 unitaires verts et 109 bancs d'écran verts à chaque fois, et aucun verdict attribuable.
 * Rejouer jusqu'à tomber sur un creux est la relance interdite sous un autre nom.
 *
 * ARBITRAGE DE L'ARCHITECTE, 2026-08-20 — `hub/contrats/ce-qu-un-banc-lit-chez-son-voisin.md`,
 * section « une fenêtre de mesure se DEMANDE » : la fenêtre se demande, elle ne se subit pas, et la
 * charge de s'adapter n'est pas toute chez le mesureur — le voisin en chantier GROUPE ses frappes.
 *
 * LES DEUX CONDITIONS, ET LA SECONDE A ÉTÉ TROUVÉE EN MESURANT :
 *
 *   1. aucune écriture sous les racines exposées d'aucun voisin depuis CALME_MS ;
 *   2. aucun arbre sale qui ferme ma construction de production.
 *
 * ⛔ UN VOISIN CALME PEUT AVOIR UN ARBRE SALE. Mesuré le 2026-08-20 à 17:12 : quatre fichiers non
 * enregistrés chez BPscript, aucune écriture depuis cinq minutes. La première condition était
 * remplie et la campagne serait morte à la PREMIÈRE minute au lieu de la quinzième — le greffon de
 * `vite.config.ts` refuse de construire sur du non enregistré qui entre dans mon paquet. Cette
 * condition-là ne figurait dans aucune des trois options que j'avais soumises ; elle est au contrat
 * parce qu'une mesure l'a produite.
 *
 * ⛔ ET LE PRÉAVIS PART D'ICI, PAS D'UNE BONNE INTENTION. Pendant toute la journée du 2026-08-20 mes
 * voisins m'ont préavisé leurs frappes et je ne leur ai jamais annoncé mes campagnes : BPscript a
 * écrit trois fois « si ta campagne courait, elle te nommera » — il DEVINAIT. Une annonce qui dépend
 * de ma vigilance se périme au premier tour où je suis occupé ailleurs.
 *
 * ⛔ ET ELLE PART AVANT LE TIR, PAS PENDANT. Mesuré le même jour à 17:05 : j'ai averti un voisin au
 * moment où je tirais, il était déjà dans son geste, et ça n'a rien empêché. UN PRÉAVIS SIMULTANÉ
 * INFORME, IL NE COORDONNE PAS. D'où le délai de grâce ci-dessous, pendant lequel je continue de
 * mesurer : si le voisin écrit après avoir reçu la demande, je retourne attendre.
 *
 * QUI EST PRÉVENU : les voisins qui ont ÉCRIT récemment, pas les onze. Prévenir un dépôt qui dort
 * depuis trois jours est du bruit, et le bruit fait qu'on ne lit plus les préavis.
 */
import { execFileSync } from "node:child_process";
import {
  writeFileSync,
  unlinkSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { causeDuRouge, attributionDuRouge } from "./lib/cause-du-rouge.mjs";
import { qualifierEcriture } from "./lib/qualifier-ecriture.mjs";
import { geleParUnVoisin } from "./lib/gel-recu.mjs";
import {
  racinesSurveillees,
  derniereEcriture,
  basculesEntre,
} from "./lib/releve-des-ecritures.mjs";
import { homedir } from "node:os";
import { join } from "node:path";
import { lireReleve } from "./lib/releve-du-portillon.mjs";
import {
  voisinsLies,
  racinesExposees,
  raisonDuRefus,
  depotsSales,
} from "./lib/voisins-lies.mjs";
import { voisinsLusParChemin } from "./lib/voisins-lus-par-chemin.mjs";

const RACINE = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

/**
 * ⛔ MON PROPRE SOURCE, TEL QU'IL ÉTAIT AU LANCEMENT — et pourquoi je le retiens.
 *
 * Le 2026-08-30 à 03:01, mon verdict est parti avec une phrase que j'avais CORRIGÉE, ENREGISTRÉE et
 * que cette campagne-là POUSSAIT au même moment. Un processus charge son source au lancement : éditer
 * pendant qu'il tourne change le dépôt, jamais le processus. ⇒ « corrigé, enregistré et poussé » ne
 * veut pas dire « le message qui vient de partir le porte ».
 *
 * ⇒ C'était ma troisième sur-déclaration de la nuit et la plus difficile à voir : les deux premières
 *   venaient d'un correctif que je n'avais pas encore écrit — celle-ci vient d'un correctif ÉCRIT, et
 *   tout ce que le dépôt pouvait me montrer disait que c'était réparé.
 *
 * ⇒ ⚠️ UNE PROMESSE DE CONDUITE NE TIENT PAS — je m'étais déjà interdit d'écrire pendant ma fenêtre,
 *   et je l'avais dit AU MOMENT DE LE FAIRE. Le garde existe parce que l'avoir dit n'a pas suffi.
 */
const MON_SOURCE_AU_LANCEMENT = (() => {
  try {
    return readFileSync(new URL(import.meta.url).pathname, "utf-8");
  } catch {
    return null;
  }
})();

/** Mon source a-t-il changé sur le disque depuis que je l'ai chargé ? Rendu au verdict, jamais tu. */
function monSourceABouge() {
  if (MON_SOURCE_AU_LANCEMENT === null) return "empreinte de lancement ILLISIBLE";
  try {
    const maintenant = readFileSync(new URL(import.meta.url).pathname, "utf-8");
    return maintenant === MON_SOURCE_AU_LANCEMENT ? null : "MODIFIÉ depuis mon lancement";
  } catch {
    return "source DEVENU ILLISIBLE depuis mon lancement";
  }
}
/** ⛔ LA TOUR S APPELLE EN TABLEAU, JAMAIS À TRAVERS UN SHELL — et ce n est pas parce qu un texte y
 *  transite aujourd hui, mais parce que rien n empêche d y en remettre demain. C est le raisonnement
 *  que j ai opposé à `--fichier` le 2026-08-25 : une parade qui déplace le texte hors du shell sans
 *  RETIRER le shell laisse le piège armé pour la phrase suivante. Formulation de runtime-codevoices,
 *  que je garde : « le remède appartient à celui qui possède le shell » — je possède le code qui
 *  compose, donc je retire le shell. */
const TOUR = join(homedir(), "dev", "bp", "hub", "tour");
/** L'atelier — le dossier qui porte tous les dépôts, et le seul endroit où un chemin sortant atterrit. */
const ATELIER = join(homedir(), "dev", "bp");

/** Depuis combien de temps un voisin doit être silencieux pour que la fenêtre s'ouvre. */
const CALME_MS = 150_000;
/** Le délai entre la DEMANDE et le tir — ce qui sépare une coordination d'une information. */
const GRACE_MS = 90_000;
/**
 * ⛔ LA FENÊTRE ANNONCÉE SE DÉRIVE DE MES CAMPAGNES MESURÉES — arbitrage de l'architecte du
 * 2026-08-22, qui applique une règle qui existait déjà : aucune valeur en dur quand la donnée
 * existe. Elle valait 20 en dur pendant que trois campagnes couraient 21 min 02, 23 min 39 et
 * 22 min 30 ; deux voisins ont écrit sur l'heure annoncée pendant que je mesurais encore, et une
 * campagne de vingt-trois minutes sur onze dépôts gelés est partie avec.
 *
 * LE REGISTRE VIT HORS DU DÉPÔT, ET C'EST VOULU : une durée de campagne est une propriété de la
 * MACHINE qui l'exécute, pas du code. La versionner salirait en plus l'arbre à chaque tir — donc
 * fermerait la construction de production que le tir suivant exige.
 */
const REGISTRE = join(homedir(), ".local", "state", "kanopi", "campagnes.json");

/** Les durées enregistrées, en minutes décimales, de la plus longue à la plus courte. */
function dureesEnregistrees() {
  if (!existsSync(REGISTRE)) return [];
  try {
    const brut = JSON.parse(readFileSync(REGISTRE, "utf8"));
    return (Array.isArray(brut) ? brut : [])
      .map((c) => Number(c?.minutes))
      .filter((m) => Number.isFinite(m) && m > 0)
      .sort((a, b) => b - a);
  } catch {
    return [];
  }
}

/**
 * La fenêtre à annoncer, dérivée des TROIS PLUS LONGUES campagnes enregistrées :
 * `max + (max − min de ces trois)` — la marge est l'étendue observée, donc la dispersion que
 * mes campagnes imposent réellement, jamais un facteur choisi.
 *
 * ⛔ LES TROIS PLUS LONGUES, ET PAS LES TROIS DERNIÈRES : une campagne qui échoue tôt (mise en
 * forme, refus de la tour) dure moins d'une minute et n'apprend RIEN sur la durée d'une mesure
 * complète. Prise dans la moyenne elle raccourcirait la fenêtre, c'est-à-dire exactement le
 * défaut qu'on répare.
 *
 * ⛔ ET SANS DONNÉES, ON NE TIRE PAS : inventer un nombre ici rendrait la valeur en dur sous un
 * autre nom, avec la caution d'avoir l'air calculée.
 */
function fenetreDeriveeMin() {
  const hautes = dureesEnregistrees().slice(0, 3);
  if (hautes.length < 3) {
    console.log(
      `⛔ FENÊTRE NON DÉRIVABLE — ${hautes.length} campagne(s) enregistrée(s) dans ${REGISTRE}, il en ` +
        "faut trois. Une fenêtre inventée fait écrire les gelés pendant que je mesure encore : " +
        "c'est le défaut du 2026-08-22. Lancer les campagnes qui manquent, ou reporter les durées " +
        "mesurées dans ce registre.",
    );
    process.exit(2);
  }
  return Math.ceil(hautes[0] + (hautes[0] - hautes[2]));
}

/**
 * ⛔ TOUTE OUVERTURE ENTRE AU REGISTRE, PAS SEULEMENT CELLES QUI ABOUTISSENT.
 *
 * Mesuré le 2026-08-25 : runtime-in a audité ses 66 avis depuis le 27 juillet et trouvé TROIS
 * épisodes où un second avis de moi lui est arrivé sans clôture du premier — dont un du 21/08 que je
 * ne connaissais pas. J'avais écrit « un incident isolé » en comptant sur ma mémoire de session.
 *
 * ⇒ CE QUE MON REGISTRE GARDAIT : les campagnes ABOUTIES, et rien d'autre. Une annulée, une écrasée,
 *   une refusée par la tour ne laissaient AUCUNE trace — et mes journaux de tir ne survivent pas à la
 *   session. **Mes voisins avaient une meilleure archive de mes campagnes que moi**, et c'est la forme
 *   exacte que je relève chez les autres depuis ce matin : publier une absence sans avoir le périmètre
 *   pour la soutenir.
 *
 * ⚠️ LE CALCUL DE LA FENÊTRE NE VOIT QUE LES ABOUTIES, et ça ne change pas : `dureesEnregistrees()`
 * filtre sur `minutes > 0`, et une ouverture sans arrivée n'en porte pas. Une campagne morte à la
 * première minute n'apprend rien sur la durée d'une mesure complète — c'est déjà écrit là-haut.
 */
function inscrireAuRegistre(entree) {
  const brut = existsSync(REGISTRE)
    ? JSON.parse(readFileSync(REGISTRE, "utf8") || "[]")
    : [];
  brut.push(entree);
  mkdirSync(join(homedir(), ".local", "state", "kanopi"), { recursive: true });
  writeFileSync(REGISTRE, JSON.stringify(brut, null, 1));
}

/** Une fenêtre vient de s'ouvrir. Inscrite AVANT toute mesure : c'est ce qui manquait pour qu'une
 *  campagne qui n'aboutit pas laisse une trace chez moi. */
function enregistrerLOuverture(identifiant, arme, geles) {
  inscrireAuRegistre({
    le: new Date().toISOString(),
    evenement: "ouverture",
    campagne: identifiant,
    arme,
    geles: geles.length,
  });
}

/** Une fenêtre s'est refermée sans mesure. La cause part avec, sinon la trace ne dit que « rien ». */
function enregistrerLAnnulation(identifiant, arme, ferme) {
  inscrireAuRegistre({
    le: new Date().toISOString(),
    evenement: "annulation",
    campagne: identifiant,
    arme,
    cause: ferme.join(" · "),
  });
}

/** Ajoute une campagne ABOUTIE — c'est ce qui rend la fenêtre suivante juste. */
function enregistrerLaCampagne(depart, arrivee, sortie, identifiant, arme) {
  const minutes = (arrivee.getTime() - depart.getTime()) / 60_000;
  inscrireAuRegistre({
    le: arrivee.toISOString(),
    evenement: "campagne",
    campagne: identifiant,
    arme,
    minutes: Number(minutes.toFixed(2)),
    sortie,
  });
  console.log(
    `campagne enregistree : ${minutes.toFixed(2)} min (sortie ${sortie})`,
  );
}

const FENETRE_MIN = fenetreDeriveeMin();

const PAS_MS = 15_000;
const PLAFOND_MS = 60 * 60_000;

const hh = (d) => d.toTimeString().slice(0, 8);

/**
 * ⛔ L'IDENTITÉ DE LA CAMPAGNE, QUI VIVAIT DANS MON PROCESSUS SANS ENTRER DANS LA PHRASE.
 *
 * Relevé par kronos le 2026-08-25, après que DEUX de mes armes eurent ouvert deux fenêtres à une
 * minute d'intervalle : « attends mon message de fin » n'est pas décidable dès qu'il y a deux
 * fenêtres en vol. Mon premier verdict lui aurait dit « libre » pendant que la seconde mesurait
 * encore — libéré par une phrase juste, portant sur l'autre fenêtre. Et l'HEURE, que je lui ai
 * justement interdit d'utiliser, était la seule chose qui les distinguait.
 *
 * ⇒ Complété par bpx dans le même quart d'heure : un avis réémis ne dit pas qu'il REMPLACE celui
 *   d'avant, et la copie mangée reste dans onze boîtes. L'identifiant répond aux deux d'un coup.
 *
 * ⇒ IL SE DÉRIVE DE L'HEURE D'OUVERTURE, donc il est opposable et personne ne peut l'inventer. Un
 *   compteur, lui, se réinitialiserait à chaque relance et rendrait deux campagnes homonymes.
 *
 * ⚠️ TROISIÈME FOIS EN UN JOUR pour la même forme : l'heure d'ouverture d'abord, le manifeste
 * ensuite, l'identité de la campagne maintenant — une donnée qui entre dans le calcul sans entrer
 * dans le relevé.
 *
 * ⛔ ET IL PORTE SON `Z`, PARCE QUE DEUX RÉGIMES D'HEURE COHABITAIENT DANS LE MÊME AVIS. Posé sans
 * lui, il valait `kanopi-20260825T100231` sur un avis annonçant « départ 12:02, arrivée 12:31 » : la
 * graphie promet du local, la valeur est en UTC, et l'écart de deux heures se lit exactement comme
 * un identifiant recyclé d'une campagne d'avant — soit le doute que l'identifiant existe pour lever.
 * CINQ voisins ont dépensé le même quart d'heure à le mesurer, et bpx a rendu ce qu'aucun avis ne
 * montrait seul : « c'est un voisin qui te rend une fausse alerte, avec l'assurance de celui qui a lu
 * un écart de deux heures — tu en recevras d'autres, et chacune coûtera à quelqu'un le temps de la
 * lever ». La graphie ne mentait à personne ; elle faisait travailler tout le monde.
 *
 * ⇒ L'HEURE LOCALE ÉTAIT LA MAUVAISE SORTIE, et c'est kronos qui l'a tranché : « le défaut n'est pas
 *   le fuseau choisi, c'est que deux régimes cohabitent sans qu'aucun ne soit nommé ». En local, un
 *   nom changerait de sens deux fois par an et deux campagnes seraient homonymes à la bascule
 *   d'automne. Le `Z` rend le régime AUTO-DÉCLARÉ ; la notation cesse de promettre du local.
 */
const identifiantDeCampagne = (ouverte) =>
  `kanopi-${ouverte.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;

/**
 * ⛔ L'IDENTITÉ DE L'ARME — LA QUATRIÈME DONNÉE DE LA MÊME FAMILLE, ET CELLE QUI REND LA TROISIÈME
 * VÉRIFIABLE DE L'EXTÉRIEUR.
 *
 * J'avais annoncé aux voisins que ma campagne suivante PROUVERAIT par occurrence que l'identifiant
 * nomme la campagne et non le processus. C'était faux, et kronos l'a mesuré : mes deux campagnes
 * venaient de DEUX processus, donc un tampon pris au démarrage aurait produit exactement la même
 * observation. Les deux hypothèses prédisaient le même résultat.
 *
 * ⇒ runtime-codevoices est allé plus loin : SON épreuve était vide. Une campagne aboutie termine le
 *   processus, donc la branche « tampon répété » n'avait presque aucun mécanisme pour se produire.
 *   Sa formule, gardée : « la branche qui réfuterait, quel mécanisme la produirait ? Si aucun,
 *   l'épreuve est déjà finie. »
 *
 * ⇒ ET LA VRAIE LIMITE EST STRUCTURELLE : son épreuve devait être produite par MON code, sur lequel
 *   il n'avait aucune prise. Une prédiction portant sur le code d'un voisin ne peut pas garantir sa
 *   propre branche réfutante — elle dépend de lui. Cette ligne lui rend la prise : deux ouvertures
 *   d'une même arme (après un refus de la tour ou une annulation, `:818` et `:789`) portent le MÊME
 *   nom d'arme et des noms de campagne DIFFÉRENTS. La question se tranche alors chez eux.
 *
 * ⚠️ J'avais moi-même écrit « ma réponse est une lecture de code, pas une observation », puis annoncé
 * dans la phrase suivante que l'occurrence la lèverait. Annoncer d'avance qu'une observation future
 * prouvera quelque chose EST DÉJÀ UNE CONCLUSION.
 */
const ARME = `arme-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;

/**
 * LA LISTE DE GEL SE DÉRIVE DE LA LISTE LUE — c'est la même liste, jamais une seconde.
 *
 * ⛔ J'AVAIS ÉCARTÉ LES VOISINS CONSOMMÉS PAR LEUR PAQUET, sur ce raisonnement : « son paquet est
 * immuable, seule sa poussée change ce que je lis ». Le contenu d'un paquet l'est ; le LIEN qui le
 * désigne ne l'est pas. Quand runtime-osc publie, `~/dev/bp/.paquets/runtime-osc` bascule sous ma
 * campagne — et mon propre détecteur l'a compté, 31 entrées, pendant la fenêtre de 14:02.
 * ⇒ Il était SURVEILLÉ par un instrument et ABSENT de l'autre : deux listes tenues côte à côte, qui
 *   se recouvraient le jour de leur pose et ont divergé au premier élargissement. Vingt minutes
 *   perdues, sur un voisin qui n'avait reçu aucun avis et n'avait rien enfreint.
 * ⇒ L'asymétrie tranche le sens de l'erreur à préférer : un dépôt gelé pour rien coûte quelques
 *   minutes de discipline ; un dépôt LU mais NON gelé fait porter le verdict sur deux états, donc
 *   sur aucun. (Relevé par runtime-audio, arbitré par l'architecte le 2026-08-24.)
 */
function voisinsAGeler() {
  const lies = voisinsLies(RACINE);
  // ⛔ LA CLÉ DE FUSION SE NORMALISE, SINON LA CASSE LA CASSE. Mesuré EN SERVICE le 2026-08-25 à
  // 23:36 : mon avis a gelé « …, bpscript, …, atlas, bpscript » — TREIZE noms pour douze dépôts. Le
  // lié rend le nom du dossier (`BPscript`), le lu-par-chemin rend le nom résolu en minuscules
  // (`bpscript`) : deux clés pour un dépôt, et la fusion écrite pour empêcher exactement ce doublon
  // ne le voyait pas. Kairos, lui, fusionnait — son dossier est déjà en minuscules, et c'est ce qui
  // m'a fait croire la fusion prouvée.
  // ⇒ Un cas qui passe pour la mauvaise raison ressemble à un cas qui passe.
  const cle = (v) => nomDeGel(v).toLowerCase();
  const parNom = new Map(lies.map((v) => [cle(v), v]));
  // ⛔ UN VOISIN PEUT ÊTRE LES DEUX, ET LE DOUBLON EST SILENCIEUX. Kairos est une dépendance ET une
  // lecture par chemin (`cause-du-rouge.mjs:54` lit son `dist`). Deux entrées sous le même nom : la
  // tour recevrait son nom deux fois, et surtout `dernieresEcritures()` indexe par nom — la seconde
  // aurait ÉCRASÉ la première, et son relevé serait tombé de ses racines exposées à `dist` seul.
  // ⇒ Une régression du relevé, invisible, produite par l'élargissement censé le combler. On FUSIONNE
  //   les racines au lieu d'empiler les entrées : le voisin garde ce que son manifeste expose ET ce
  //   que ma chaîne lit chez lui.
  for (const lu of voisinsLusParChemin(ATELIER, ...ceQueMaChaineLit())) {
    const deja = parNom.get(lu.nom);
    if (deja) deja.racines = new Set([...racinesDeCeVoisin(deja), ...lu.racines]);
    else parNom.set(lu.nom, lu);
  }
  return [...parNom.values()];
}

/**
 * ⛔ ET UN VOISIN PEUT ÊTRE LU SANS ÊTRE UNE DÉPENDANCE — mesuré EN SERVICE le 2026-08-25.
 *
 * Pendant ma campagne `kanopi-20260825T205824Z`, atlas a écrit sous `doc-utilisateur/` à 23:00:22 et
 * poussé au vert : ma fenêtre ne le nommait pas, donc le garde de la tour ne lui refusait rien. À
 * 23:03:08 ma propre construction a réécrit 132 de mes 138 fichiers de `packages/ui/public/` depuis
 * son arbre vif. ⇒ **Deux gardes verts, aucun des deux en défaut** : `public` est une racine relevée,
 * sa SOURCE vit chez lui, et le lien vit dans un SCRIPT que ni sa surface ni la mienne ne déclare.
 *
 * ⇒ Décision de méthode de l'architecte, 2026-08-25 : « qui ouvre une fenêtre sur une racine qu'il
 *   construit depuis un voisin gèle aussi ce voisin ». Elle ne peut pas vivre dans la tour, qui
 *   connaît des dépôts et des racines mais jamais la chaîne qui remplit une racine.
 *
 * ⚠️ LE BALAYAGE PORTE SUR MA CHAÎNE, PAS SUR MES DOCUMENTS. Un chemin dans une charte envoie un AGENT
 * lire ailleurs — `garde-chemins-sortants.mjs` tient déjà cette population. Ici c'est un PROGRAMME qui
 * lit, pendant ma mesure, et le cas discriminant est qu'il écrit ensuite chez moi.
 */
function ceQueMaChaineLit() {
  const suivis = execFileSync("git", ["ls-files"], { cwd: RACINE, encoding: "utf-8" })
    .split("\n")
    // ⛔ UN `tsconfig` PORTE UN CHEMIN DE DISQUE, ET MA PORTÉE NE LE VOYAIT PAS. Trouvé par BPx le
    // 2026-08-25 : `packages/ui/tsconfig.json:18` mappe `bpx/dist/index.js` vers `../../../BPx/dist/
    // index.d.ts`. Sa cible était déjà gelée, donc aucun écart — mais ma portée nommait des SCRIPTS et
    // ratait les fichiers de CONFIGURATION, qui portent exactement le même genre de chemin.
    // ⚠️ Sa première passe portait la casse exacte `BPx` et aurait raté une graphie minuscule ; c'est en
    // la reprenant insensible que le `tsconfig` est sorti. Mon motif est déjà insensible à la casse.
    // ⛔ ET MES BANCS NE FIGURAIENT PAS DANS CETTE PORTÉE — pourtant ce sont EUX qui ouvrent des
    // fichiers pendant la campagne. Leçon de bp3-frontend, relayée par bpscript le 2026-08-30 :
    // « je n'ai pas de scène se mesure sur le CHEMIN D'EXÉCUTION, jamais sur les fichiers suivis ».
    // Lui a répondu zéro en toute bonne foi parce qu'il comptait ses fichiers versionnés, alors que
    // son exécution lit 177 scènes qui vivent chez moi.
    //
    // ⇒ MESURÉ CHEZ MOI LE 2026-08-30, AVANT D'ÉLARGIR : aucun de mes bancs n'ouvre un chemin hors
    //   de mon dépôt — ni par chemin relatif, ni par balayage, ni par spécificateur nu. La population
    //   gelée est donc IDENTIQUE avant et après cet élargissement, et aucun voisin ne change d'état.
    //
    // ⇒ ⚠️ C'EST EXACTEMENT POURQUOI JE L'ÉLARGIS MAINTENANT : ce zéro tient à ce que mes bancs font
    //   aujourd'hui, pas à ce que mon instrument sait voir. Un banc écrit demain sur le corpus d'un
    //   voisin entrerait dans ma mesure sans entrer dans mon gel, et rien ne le dirait.
    .filter(
      (f) =>
        /^(scripts\/|packages\/[^/]+\/(scripts\/|tests\/|vite\.config|playwright\.config|tsconfig)|vite\.config|tsconfig)/.test(
          f,
        ) ||
        /\.(test|spec)\.[cm]?[jt]s$/.test(f),
    )
    .filter((f) => /\.(sh|mjs|cjs|js|ts|json)$/.test(f));
  const lireTexte = (f) => {
    try {
      return readFileSync(join(RACINE, f), "utf-8");
    } catch {
      return null;
    }
  };
  const depots = readdirSync(ATELIER, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  return [() => suivis, lireTexte, depots, existsSync];
}

/**
 * LE NOM SOUS LEQUEL LA TOUR CONNAÎT UN VOISIN.
 *
 * ⚠️ Le dossier ne le donne pas pour un paquet publié : il est versionné — `runtime-osc-6ad69f3` —
 * et la tour refuse « dépôt inconnu ». C'est ce refus, mesuré à la première bascule, qui m'avait
 * fait exclure ces voisins au lieu de dériver leur nom. Le SPÉCIFICATEUR, lui, est stable à travers
 * les bascules et c'est exactement le nom de la tour (`runtime-osc`).
 */
function nomDeGel(v) {
  // Un voisin LU PAR CHEMIN porte déjà son nom résolu contre le dossier réel de l'atelier : il n'a ni
  // spécificateur ni manifeste d'où le tirer.
  if (v.nom !== undefined) return v.nom;
  return (v.tete === null ? v.specificateurs[0] : v.depot.split("/").pop())
    .split("/")
    .pop();
}

/**
 * ⛔ CE QUE JE SURVEILLE CHEZ UN VOISIN — SES RACINES EXPOSÉES, PLUS LE FICHIER QUI LES DÉFINIT.
 *
 * Relevé par kronos le 2026-08-25, et c'est un trou que ma correction de la veille n'atteignait pas :
 * mon relevé LIT son manifeste pour en DÉRIVER les racines à surveiller, et ne SURVEILLE PAS ce
 * manifeste. Un voisin qui bascule `exports` ou `files` pendant ma fenêtre fait changer la liste des
 * racines SOUS ma mesure — et mon témoin reste vert, en attestant l'immobilité d'un périmètre qui a
 * bougé. Ma phrase de verdict était vraie et ne couvrait pas le cas qui la rend creuse.
 *
 * ⇒ Même famille que la qualification d'annulation corrigée le même jour : là, une donnée vivait dans
 *   le processus sans entrer dans la phrase ; ici, une donnée entre dans le CALCUL sans entrer dans
 *   le RELEVÉ.
 *
 * ⛔ ET LE CALENDRIER LE REND ACTIF, pas théorique : la décision de Romain du 2026-08-25 (régime
 * `.paquets/<nom>-<commit>`) fera changer le manifeste de plusieurs de mes onze voisins, donc le trou
 * s'ouvrirait chez plusieurs en même temps — et pendant la seule campagne où ça compte.
 *
 * ⚠️ UNE SEULE LISTE, JAMAIS DEUX : ce que je surveille et ce que j'annonce dans l'avis de gel sortent
 * d'ici tous les deux. Deux listes tenues côte à côte se recouvrent le jour de leur pose et divergent
 * au premier élargissement — c'est déjà arrivé sur les dépôts à geler, le 2026-08-24.
 *
 * ⛔ LE RELEVÉ LUI-MÊME VIT DANS `lib/releve-des-ecritures.mjs`, ET C'EST LA MOITIÉ DU SUJET. J'avais
 * écrit, en frappant cette règle : « je n'ai pas pu la faire mordre par injection — injecter voudrait
 * dire toucher un fichier chez l'un d'eux, ce que ma propre règle interdit ». C'EST FAUX, et kronos
 * l'a nommé : ma règle interdit d'injecter DANS leurs arbres, elle n'interdit pas d'injecter. Une
 * injection s'éprouve sur une COPIE — donc l'arbre balayé est un paramètre, et l'épreuve fabrique le
 * cas discriminant que le réel ne porte jamais (un manifeste plus récent que toutes les racines).
 *
 * ⛔ ET LA RACINE D'UN VOISIN LU PAR CHEMIN VIENT DU CHEMIN, JAMAIS DE SON MANIFESTE. `../atlas/doc-
 * utilisateur` dit ce que JE lis chez lui ; son `files` dirait ce qu'IL publie — deux ensembles
 * différents, et c'est le premier qui a bougé sous ma mesure le 2026-08-25. Atlas n'a d'ailleurs pas
 * de manifeste : dériver du sien aurait rendu un ensemble vide, donc un gel qui ne surveille rien.
 */
function racinesDeCeVoisin(v) {
  if (v.racines !== undefined) return v.racines;
  return racinesSurveillees(v.depot, racinesExposees);
}

/**
 * ⛔ LES RACINES QUE MA CHAÎNE LIT CHEZ SES VOISINS — L'UNION, DÉRIVÉE, ET ELLE A DEUX LECTEURS.
 *
 * Ma campagne la déclare à la tour en ouvrant sa fenêtre. ⇒ ET `trace-du-portillon.mjs` en a besoin
 * pour EXACTEMENT la même raison : sans elle, la tour refuse d'ouvrir dès qu'un dépôt gelé porte un
 * fichier non enregistré n'importe où. Mesuré le 2026-08-31 : onze dépôts refusés, dont dix pour la
 * même fiche de skill diffusée par atlas — pas une seule sous une racine que je lis.
 *
 * ⇒ Elle vit ici, en UN endroit, parce que la recopier chez le relevé ferait une seconde liste qui
 *   dériverait de la première. Le relevé la demande à l'arme par `--releve-racines`, comme
 *   bp3-frontend demande son périmètre par `--releve` : la réponse vient de l'arme, jamais d'un
 *   harnais qui la copie.
 */
function racinesQueJeLis() {
  return [...new Set(voisinsAGeler().flatMap((v) => [...racinesDeCeVoisin(v)]))].sort();
}

/**
 * La dernière écriture de chaque voisin sous ce que je surveille, et le fichier concerné.
 *
 * ⛔ IL REFUSE D'AVOIR EXAMINÉ ZÉRO CHEZ UN GELÉ, et cette clause manquait. `derniereEcriture` rend
 * `examines` exprès — je le jetais. Trouvé le 2026-08-25 par bp3-frontend, qui a lu mon code et rendu
 * le lien sans le qualifier ; atlas a tranché quelle fonction décidait.
 *
 * ⇒ CE QUE ÇA PRODUISAIT : chez un lié SANS manifeste, `racinesExposees` rend `null`, donc
 *   `racinesSurveillees` rend `{ package.json }` — un fichier qui n'existe pas chez lui. Zéro fichier
 *   examiné, `quand: 0`, et ma phrase de verdict « AUCUNE BASCULE pendant ma mesure » **aurait attesté
 *   l'immobilité de rien**.
 *
 * ⚠️ Le cas ne se produit pas aujourd'hui : mes onze liés portent tous un manifeste avec au moins un
 * des six champs. C'est exactement pourquoi il fallait le fermer — un défaut armé qui ne tire pas
 * encore ne rougit nulle part, et le jour où il tire, c'est un verdict qui ment.
 *
 * ⇒ « Examiné zéro » et « écarté zéro » ne sont pas la même chose : refuser le premier protège
 *   l'instrument, refuser le second serait une hypothèse sur la donnée (architecte, 2026-08-25).
 */
function dernieresEcritures() {
  const par = new Map();
  const vides = [];
  for (const v of voisinsAGeler()) {
    const { quand, quoi, examines, lues, nonLues } = derniereEcriture(
      v.chemin,
      racinesDeCeVoisin(v),
    );
    if (examines === 0) vides.push(`${nomDeGel(v)} (${[...racinesDeCeVoisin(v)].join(", ")})`);
    // ⛔ UNE RACINE NON LUE SE DIT, ELLE NE SE PERD PLUS. Elle n arrête pas le tir — une racine
    // déclarée qu un voisin ne porte pas est un fait ordinaire — mais elle entre dans le relevé, et
    // `basculesEntre` compare les DEUX ensembles : lue au départ et pas à l arrivée est une bascule
    // qui ne porte aucun horodatage, donc invisible à la comparaison des dates.
    if (nonLues.length) console.log(`  ⚠️ ${nomDeGel(v)} — racine(s) NON LUE(S) : ${nonLues.join(", ")}`);
    par.set(nomDeGel(v), { quand, quoi, lues });
  }
  if (vides.length) {
    console.error(
      `⛔ RELEVÉ VIDE chez ${vides.length} gelé(s) — ZÉRO fichier examiné : ${vides.join(" · ")}\n` +
        "   Mon verdict attesterait l'immobilité d'un périmètre que je n'ai pas regardé.\n" +
        "   Cause probable : un voisin sans manifeste, ou dont aucune racine déclarée n'existe.",
    );
    process.exit(1);
  }
  return par;
}

/**
 * ⛔ LE PRÉ-VOL — CE QUI SE MESURE SANS GELER PERSONNE SE MESURE AVANT DE GELER QUELQU'UN.
 *
 * Le 2026-08-24, trois campagnes consécutives ont rendu 1 en deux minutes chacune, et les trois se
 * sont arrêtées sur MES gardes ou MON typage — bien avant les treize minutes d'écran, seul étage où
 * l'état des arbres gelés compte. Onze dépôts ont donc été gelés pour un chemin que la campagne
 * n'atteignait jamais.
 *
 * ⇒ Relevé par runtime-audio en comptant mes avis depuis le DEHORS : « le gel est dépensé sur un
 *   chemin que la campagne n'atteint pas ». Et par runtime-MIDI, avant même de connaître la cause :
 *   « ta fenêtre s'ouvre seulement quand les arbres consommés sont propres, donc la cause de ton 1
 *   est derrière ta porte ». Elle l'était, deux fois sur deux.
 *
 * ⚠️ CE PRÉ-VOL NE REMPLACE PAS LE PORTILLON : il n'exécute que la part qui ne dépend d'aucun
 * voisin en chantier, et son vert n'autorise rien — seul le crochet décide. Il ne fait qu'éviter de
 * geler onze dépôts pour un rouge qui est le mien.
 */
function preVol() {
  // ⛔ LE PRÉ-VOL COUVRE CE QUE LE PORTILLON VÉRIFIE AVANT SES BANCS, ÉTAPE POUR ÉTAPE. Le
  // 2026-08-24 il portait `arch` et le typage seulement : la campagne est partie, dix dépôts ont
  // été gelés, et elle est morte à 2,42 min sur un fichier MAL FORMATÉ — un fichier déplacé hors
  // de `src/` qui entrait pour la première fois dans le périmètre du style. Un pré-vol qui couvre
  // moins que le portillon ne protège personne de la classe qu'il ne regarde pas ; il faisait une
  // voie parallèle à `verify`, et elle a dérivé au premier déplacement de fichier.
  // ⚠️ LES DEUX SEULS SHELLS QUI RESTENT DANS CE FICHIER SONT ICI ET AU `git push`, ET ILS SONT
  // DÉLIBÉRÉS : ils ont besoin des opérateurs du shell (`&&`, `;`, `2>&1`) que `execFileSync` ne
  // porte pas. Aucun texte de message n'y transite — seulement des chemins que je fabrique — et c'est
  // la raison pour laquelle ils survivent au retrait du 2026-08-25. Y faire passer une phrase
  // destinée à un voisin rouvrirait le piège de l'accent grave, qui n'a pas de garde possible en aval.
  for (const [nom, cmd] of [
    ["gardes de structure", `cd ${RACINE} && npm run --silent arch`],
    [
      "typage",
      `cd ${RACINE}/packages/ui && npx --no-install svelte-check --output human-verbose`,
    ],
    ["style et lint", `cd ${RACINE}/packages/ui && npm run --silent lint`],
    ["construction", `cd ${RACINE}/packages/ui && npm run --silent build`],
  ]) {
    try {
      execFileSync("bash", ["-c", cmd], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      const sortie = `${e.stdout ?? ""}${e.stderr ?? ""}`;
      const lignes = sortie
        .split("\n")
        .filter((l) => /^\s*(✗|✘|Error|error|ERROR|\s+•)/.test(l))
        .slice(0, 6);
      return {
        etape: nom,
        // ⛔ UN ROUGE DE PRÉ-VOL DONT LA CAUSE EST L'ARBRE D'UN VOISIN N'EST PAS LE MIEN, ET
        // L'ANNONCER COMME TEL EST UNE ATTRIBUTION FAUSSE. Mesuré le 2026-08-30 à 23:56 : l'étape
        // `construction` a rendu 1 en NOMMANT sa cause — « BPscript @ e35cbe4 — 1 non enregistré(s)
        // dans le paquet » — et l'arme a quand même écrit « la cause est chez moi », puis s'est
        // arrêtée. Or c'est EXACTEMENT la condition que ma boucle d'attente sait attendre : elle
        // l'avait attendue treize minutes plus tôt, sur le même voisin.
        //
        // ⇒ L'en-tête du pré-vol dit qu'il n'exécute « que la part qui ne dépend d'aucun voisin en
        //   chantier ». La construction en dépend. Le texte était juste, l'étape ne l'était pas.
        //
        // ⇒ Le marqueur est la PHRASE QUE MON REFUS ÉCRIT (`voisins-lies.mjs`), pas une déduction
        //   sur l'étape : un jour la construction rougira pour une raison qui EST la mienne, et ce
        //   jour-là il faut s'arrêter.
        //
        // ⇒ ET LA LISTE DES MARQUEURS VIT CHEZ `cause-du-rouge.mjs`, éprouvée, jamais recopiée ici.
        //   Elle en portait DEUX quand ce test était écrit à la main ; le troisième — un voisin qui
        //   RECONSTRUIT sous la mesure — a été mesuré le 2026-08-30 et n'aurait été ajouté qu'à une
        //   des deux copies.
        attribution: attributionDuRouge(sortie),
        cause: lignes.length
          ? lignes.join("\n")
          : sortie.split("\n").slice(-8).join("\n"),
      };
    }
  }
  return null;
}

/**
 * ⛔ SUIS-JE MOI-MÊME GELÉ PAR UN VOISIN ? — la condition qui manquait, et qui coûte le plus cher.
 *
 * Mesuré le 2026-08-25 à 13:11 : runtime-in a ouvert une fenêtre sur `kanopi` jusqu'à 13:21 pendant
 * que mon arme attendait. Rien dans ce fichier ne regardait les fenêtres où JE suis gelé — mes trois
 * conditions portaient toutes sur l'état des voisins, jamais sur le mien.
 *
 * ⇒ CE QUE ÇA PRODUIT : ma campagne ouvre sa fenêtre, gèle onze dépôts, mesure quinze minutes, et sa
 *   POUSSÉE est refusée par le garde de la tour — parce qu'un voisin me gèle. Onze dépôts immobilisés
 *   pour un refus CERTAIN, connu d'avance et lisible en une commande.
 *
 * ⇒ C'est la même famille que le pré-vol, qui existe pour la même raison : « rien ne se gèle avant que
 *   ce qui est à moi soit vert ». Il couvrait mes gardes et mon typage ; il ne couvrait pas le fait
 *   d'être gelé. Un rouge prévisible n'a pas à coûter un gel à onze dépôts.
 *
 * Rend la raison en clair, ou `null` si personne ne me gèle. La tour muette ne bloque rien : un outil
 * qui ne répond pas ne doit pas m'interdire de tirer — même décision que pour le crochet d'écriture.
 */
function quiMeGele() {
  let brut;
  try {
    brut = execFileSync(TOUR, ["fenetre", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, BP_AGENT: "kanopi" },
    });
  } catch {
    return null; // la tour ne répond pas — on ne se bloque pas là-dessus
  }
  try {
    // La DÉCISION vit dans `lib/gel-recu.mjs`, éprouvée sur des fenêtres fabriquées : je ne peux pas
    // demander à un voisin d'ouvrir une fenêtre sur moi pour voir ce garde mordre.
    return geleParUnVoisin(JSON.parse(brut), "kanopi");
  } catch {
    return null; // réponse illisible — on ne se bloque pas là-dessus non plus
  }
}

/**
 * Ce qui empêche la fenêtre de s'ouvrir, en clair. Vide = elle est ouverte.
 *
 * ⛔ UNE ÉCRITURE RÉCENTE A DEUX CAUSES OPPOSÉES, ET CETTE LIGNE LES DISAIT PAREIL. Le 2026-08-25,
 * deux annulations à une demi-heure d'écart ont porté le même texte : la première sur une écriture
 * survenue 45 s APRÈS mon ouverture — un gel rompu — la seconde sur une écriture survenue 67 s
 * AVANT elle, c'est-à-dire un arbre simplement plus frais que `CALME_MS`, où le voisin n'avait rien
 * à respecter puisque rien n'était encore gelé.
 * ⇒ kronos a lu la seconde comme un reproche, m'a rendu ses horloges pour se défendre, et s'est
 *   attribué un coût qui n'était pas le sien. bp3-frontend l'a vu avant lui et avant moi.
 * ⇒ CE QUI SÉPARE LES DEUX EST L'HEURE D'OUVERTURE, que je connais et que je ne rendais pas. Donc
 *   elle entre ici, et la qualification voyage jusqu'au destinataire.
 *
 * `ouverteA` vaut `null` tant qu'aucune fenêtre n'est ouverte : personne n'est gelé, il n'y a rien
 * à qualifier, et prétendre le contraire serait l'erreur symétrique.
 */
function ceQuiFerme(ecritures, ouverteA = null) {
  const seuil = Date.now() - CALME_MS;
  const raisons = [];
  // ⛔ MA PROPRE SITUATION D'ABORD : être gelé rend le tir inutile avant même de le tenter.
  const gele = quiMeGele();
  if (gele) raisons.push(gele);
  // ⛔ L'ARBRE SALE RESTE ICI, ET CE N'EST PAS UN DOUBLON DE LA TOUR. Elle refuse d'OUVRIR sur un
  // état non publié ; moi je refuse de CONSTRUIRE — mon greffon de production s'arrête sur du non
  // enregistré qui entre dans mon paquet. Les deux se recouvrent aujourd'hui et ne disent pas la
  // même chose : la sienne protège la mesure, la mienne protège l'artefact.
  // ⛔ ET LE NOM SORT. Sans lui, ce relevé disait « un arbre SALE » trois fois d'affilée sans dire
  // chez qui — impossible d'aller demander l'enregistrement à quiconque. Le prédicat vient de la
  // même source que le refus lui-même ; il n'est pas réécrit ici.
  const sales = depotsSales(voisinsLies(RACINE));
  if (sales.length > 0) {
    // ⛔ ET LE FICHIER SORT AVEC LE NOM. Le 2026-08-24 cette ligne a répété « bp3-frontend (2) »
    // vingt-quatre fois en quarante-huit minutes : le compte seul ne dit pas s'il s'agit d'un
    // travail en cours — qui s'attend — ou de deux artefacts oubliés — qui se remisent en dix
    // secondes. C'étaient deux artefacts. Un relevé qui ne nomme pas laisse attendre pour rien.
    const noms = sales
      .map(({ v, entrantes }) => {
        const cites = entrantes
          .slice(0, 2)
          .map((m) => m.fichier)
          .join(" ");
        const reste = entrantes.length > 2 ? ` +${entrantes.length - 2}` : "";
        return `${v.depot.split("/").pop()} (${entrantes.length} : ${cites}${reste})`;
      })
      .join(", ");
    raisons.push(`un arbre SALE ferme ma construction de production : ${noms}`);
  }
  for (const [nom, { quand, quoi }] of ecritures) {
    if (quand <= seuil) continue;
    // La qualification vit dans `lib/qualifier-ecriture.mjs`, seule et éprouvable : ici la boucle
    // démarre à l'import, donc une copie posée dans ce fichier ne se vérifierait qu'en tirant.
    raisons.push(
      qualifierEcriture(
        nom,
        quand,
        quoi,
        ouverteA === null ? null : ouverteA.getTime(),
        CALME_MS,
        hh,
      ),
    );
  }
  return raisons;
}

/**
 * LA FENÊTRE SE DEMANDE À LA TOUR, ELLE NE SE BRICOLE PLUS ICI.
 *
 * ⛔ CE BLOC ENVOYAIT UN COURRIER ÉCRIT À LA MAIN. La tour porte depuis le 2026-08-20 un mécanisme
 * qui fait davantage et qui est PARTAGÉ : `tour fenetre ouvrir` prévient chaque dépôt gelé, REFUSE
 * SA PORTE d'écriture de backlog — `tour bl add` — pendant la fenêtre, et expire tout seul. Garder ma
 * version en aurait fait une voie parallèle : deux mécanismes pour un besoin, qui divergent au premier
 * changement.
 *
 * ⚠️ CETTE PHRASE DISAIT « REFUSE L'ÉCRITURE DE LEUR BACKLOG », ET C'ÉTAIT TROP LARGE. Mesuré par
 * bpscript le 2026-08-25 : il a édité son `BACKLOG.md` pendant une de mes fenêtres, sans aucun refus.
 * L'outil ne peut refuser que SA propre commande ; le backlog d'un voisin est un fichier de son dépôt,
 * qu'il édite avec ses outils. ⇒ Décrire un garde plus large qu'il n'est le fait passer pour une
 * garantie mécanique là où il n'en donne aucune — et le commentaire se relit comme une preuve.
 *
 * ⛔ ET L'OUTIL PORTE DÉJÀ MA SECONDE CONDITION, ce qui la retire d'ici : il REFUSE d'ouvrir quand un
 * dépôt gelé porte un état que personne n'a publié, parce que je lis le DISQUE. Mesuré à l'ouverture :
 * « FENÊTRE REFUSÉE — bpscript, 2 modifié(s) ». Ce que je garde, c'est la condition qu'il n'a pas :
 * le CALME, c'est-à-dire aucune écriture depuis un délai — un arbre propre ne dit rien de ce qui
 * s'écrira dans les quinze minutes suivantes.
 *
 * Rend la liste des dépôts gelés, ou `null` si la tour a refusé — auquel cas on retourne attendre.
 */
function demanderLaFenetre(ecritures, identifiant) {
  // ⛔ JE GÈLE CE QUE JE LIS, PAS CE QUI BOUGE. Ce filtre ne gardait que les voisins ayant enregistré
  // dans les deux dernières heures. Mesuré le 2026-08-21 : à 09:09 il n'a gelé QUE bpscript, pendant
  // que mes bancs lisaient les sources vives des onze — Kairos me l'a rendu, et il avait fait la
  // faute symétrique une heure plus tôt.
  //
  // MA RAISON ÉTAIT JUSTE POUR UN PRÉAVIS ET FAUSSE POUR UN GEL : prévenir un dépôt qui dort est du
  // bruit, mais le GELER ne lui coûte rien — et un dormeur se réveille au milieu de mes quinze
  // minutes, ce qui est arrivé la veille à 19:29. J'ai transporté le critère d'un mécanisme sur
  // l'autre sans relire ce qu'il tranchait.
  //
  // LA LISTE EST DÉRIVÉE, PAS RAPPELÉE : `voisinsLies()` énumère les dépôts que je résous par lien
  // symbolique, et c'est la même liste que ma légende de campagne affiche. Troisième fois en deux
  // jours qu'une liste écrite à la main survit à ce qu'elle décrit, alors que la bonne existait déjà.
  const actifs = [...ecritures].map(([nom]) => nom.toLowerCase());
  if (actifs.length === 0) return [];

  // ⛔ CE QUE JE LIS SE DÉCLARE, IL NE SE DEVINE PAS. Sans `--racines`, la tour refuse d'ouvrir dès
  // qu'un dépôt gelé porte un fichier non enregistré N'IMPORTE OÙ — un backlog, une charte, un banc.
  // Mesuré le 2026-08-21 : ma fenêtre est restée fermée trente minutes sur cinq fichiers dont AUCUN
  // n'entrait sous une racine que mes bancs lisent. Le critère n'était pas faux, il était au mauvais
  // niveau : « dépôt sale » là où il faut « racine lue sale ».
  //
  // LA LISTE EST DÉRIVÉE, comme celle des dépôts : c'est l'UNION des racines que les manifestes de
  // mes onze voisins exposent. La tour ne peut pas la lire — elle ne sait ni où vit mon manifeste ni
  // sous quelle forme — donc le DEMANDEUR déclare ce qu'il lit, exactement comme il déclare déjà
  // disque ou commit publié (arbitrage de l'architecte, 2026-08-21).
  const racinesLues = racinesQueJeLis();

  // ⛔ LE MOTIF NOMME LE CHEMIN, JAMAIS LE GESTE. Deux mots successifs ont échoué le 2026-08-21 :
  // « aucune écriture » a été lu de trois façons par trois voisins, puis « ni commit, ni push, ni
  // vérification » a nommé des gestes dont l'effet DIFFÈRE d'un voisin à l'autre. BPx l'a mesuré
  // chez lui, dans les deux sens : sa poussée PUBLIE (pre-push → verify → gate:dist →
  // check-dist-fresh → npm run build, dist basculé par renommage), et son commit ne construit rien.
  // Un motif qui interdit « le commit » exige donc du vide chez lui, pendant qu'un motif qui
  // n'interdirait que « la publication » laisserait passer sa poussée. Seul le voisin sait lequel de
  // ses gestes touche mes chemins ; moi je sais quels chemins je lis. La tour publie les racines
  // dans l'avis de gel depuis le 2026-08-21 — le gelé voit donc la borne que ce motif invoque.
  // ⛔ L'HEURE ANNONCÉE EST UN PLANCHER, ET LE MOTIF DOIT LE DIRE. Mesuré le 2026-08-22 :
  // `FENETRE_MIN` est une CONSTANTE de vingt minutes pendant que mes deux campagnes du jour ont couru
  // 21 min 02 s puis 23 min 39 s. bpscript s'est arrêté d'écrire à mon gel, a tout préparé hors dépôt,
  // puis a posé une attente mécanique sur l'heure ÉCRITE dans mon avis — et a enregistré une minute
  // avant l'arrivée réelle. Il a respecté l'heure ; l'heure ne couvrait pas la mesure. Vingt et une
  // minutes de campagne perdues sur onze dépôts gelés, et la casse était invisible chez lui.
  // CE QUI FERME UNE FENÊTRE EST DONC LE VERDICT, JAMAIS L'HORLOGE — `rendreLeVerdict` l'envoie aux
  // seuls gelés à l'arrivée. Le dire ici évite à chaque voisin de l'apprendre en se brûlant une fois.
  // ⛔ LA LISTE EST UNE UNION, ET LE MOTIF DOIT LE DIRE. La tour ne porte QU'UNE liste de racines par
  // fenêtre (`tour.cjs:1341`, `--racines a,b`) : je ne peux pas nommer à chacun les siennes. Mesuré le
  // 2026-08-23 — kairos et bp3-frontend ont signalé le même quart d'heure que trois et quatre de ces
  // six chemins n'existent pas chez eux, et ont craint que mon banc y lise du vide. Mon RELEVÉ vise
  // juste (il prend chez chacun ce que SON manifeste expose) ; c'était cet AVIS qui visait large, et
  // qui leur demandait une discipline sur des chemins que je ne lis pas chez eux.
  //
  // ⛔ ET LA PHRASE « LE RESTE DE VOTRE ARBRE EST LIBRE » A ÉTÉ RETIRÉE LE 2026-08-24 : ELLE MENTAIT.
  // bp3-frontend l'a signalé deux fois — le 2026-08-23, puis le 2026-08-24 quand mon portillon a refusé
  // sa poussée d'un commit ne touchant QUE `CLAUDE.md`, hors de mes six racines. Il a attendu, ce qui
  // est la bonne issue, et il ajoute qu'un refus large est plus sûr qu'un refus fin.
  // ⇒ ARBITRAGE DE L'ARCHITECTE, LE MÊME JOUR : le garde ne bouge pas, c'est l'avis qui se corrige.
  //   « Affiner au chemin serait pire : chez certains, pousser republie le paquet ENTIER quel que soit
  //   le fichier touché, donc un refus par chemin serait muet exactement là où il compte le plus. »
  // ⇒ Un avis qui promet une liberté que l'outil refuse fait attendre pour une raison que le lecteur
  //   ne trouve nulle part. Cet avis décrit désormais les DEUX : ce que je lis, et ce que le garde fait.
  const motif =
    `CAMPAGNE ${identifiant}, tirée par ${ARME} — le premier nomme CETTE campagne, le second le ` +
    "PROCESSUS qui la tire, et mon verdict portera les deux. ⚠️ DEUX ARMES SUCCESSIVES SONT LE "
    + "FONCTIONNEMENT NORMAL : une arme meurt avec sa campagne, donc deux campagnes d'affilée portent "
    + "toujours deux noms d'arme. Ne me signalez PAS cela. Deux avis de MÊME arme et de campagnes "
    + "différentes viennent d'une réouverture après refus ou annulation, et sont normaux aussi. "
    + "⛔ CE QUE JE VOUS DEMANDE DE ME SIGNALER EST AUTRE : UN SECOND AVIS DE MOI QUI VOUS ARRIVE AVANT "
    + "LE VERDICT DU PRÉCÉDENT, quelle que soit l'arme. C'est le seul signe observable de chez vous que "
    + "deux de mes armes tournent — la tour ne tient qu'une fenêtre par émetteur, donc vous ne verrez "
    + "JAMAIS deux des miennes coexister : vous verrez la seconde remplacer la première sans le savoir, "
    + "et c'est exactement ce qui vous est arrivé à onze le 2026-08-25 à 11:36. "
    + "(Le nom d'arme entre le 2026-08-25 : sans lui, personne ne pouvait vérifier de l'extérieur que "
    + "mon identifiant nomme la campagne et non le processus — relevé par kronos, expliqué par "
    + "runtime-codevoices. Et ma première rédaction de cette clause désignait le mauvais signe : elle "
    + "vous ordonnait de me signaler un défaut à chaque cycle normal, et aurait crié onze fois pour "
    + "rien avant le jour où ça compte — relevé par runtime-ui, qui avait déjà le bon critère sous les "
    + "yeux et que ma clause faisait regarder ailleurs.) " +
    `Cet identifiant est le NOM de cette campagne, et mon verdict le ` +
    "portera. ⛔ UN AVIS PLUS RÉCENT PORTANT UN AUTRE IDENTIFIANT REMPLACE CELUI-CI : n'attendez "
    + "alors que le verdict du DERNIER. Le 2026-08-25, deux de mes armes ont ouvert deux fenêtres à "
    + "une minute d'intervalle et rien ne les distinguait qu'une heure — que je vous interdis "
    + "justement d'utiliser (relevé par kronos et bpx). "
    + "campagne de portillon — NE FAITES BASCULER AUCUN FICHIER SOUS LES RACINES QUE JE LIS, nommées " +
    "dans cet avis. Le geste ne compte pas, le chemin compte : chez certains d'entre vous pousser " +
    "PUBLIE et une vérification lancée à la main CONSTRUIT, chez d'autres le commit ne touche rien. " +
    "Vous seul savez lequel de vos gestes bascule ces chemins. " +
    "⛔ MAIS CE QUE JE LIS ET CE QUE LE GARDE REFUSE NE SONT PAS LA MÊME CHOSE : je ne relève que ces " +
    "racines, et le garde de fenêtre refuse TOUTE poussée de votre dépôt pendant ma fenêtre, y compris " +
    "d'un fichier que je ne lis pas. C'est délibéré — chez certains d'entre vous pousser republie le " +
    "paquet ENTIER quel que soit le fichier touché, donc un refus par chemin serait muet là où il " +
    "compte le plus. " +
    "⚠️ CETTE LISTE ARRIVE SOUS DEUX RÉGIMES, ET VOUS SEUL VOYEZ LEQUEL. J'envoie l'UNION des racines " +
    "des onze ; depuis `74cf383` (architecte, 2026-08-25) la tour la FILTRE à la livraison quand votre " +
    "manifeste porte un champ `files` — vous recevez alors VOS racines seules, et il n'y a rien à en " +
    "retrancher. Sans ce champ, elle vous livre l'union entière, et les racines qui ne sont pas les " +
    "vôtres ne vous concernent pas. ⚠️ JE NE VOUS DIS PAS COMBIEN SONT DANS CHAQUE RÉGIME : ce compte " +
    "vit chez l'architecte, il a déjà changé une fois le 2026-08-25 (runtime-osc a réfuté son " +
    "inventaire, qui comptait en minuscules un dossier majuscule), et un chiffre relayé depuis le " +
    "message d'un tiers se périme sans que rien ne rougisse. Vous seul voyez lequel des deux vous " +
    "recevez : comparez la liste ci-dessus à votre manifeste. " +
    "⛔ NE RETRANCHEZ PAS DEUX FOIS : ma phrase précédente annonçait une union sans condition, et depuis " +
    "ce matin elle faisait écarter comme « appartenant aux autres » des racines qui étaient devenues " +
    "toutes les vôtres — une discipline EN MOINS, sur des chemins que je relève vraiment (relevé par " +
    "kronos et runtime-in, à la même minute, tous deux dans les cinq filtrés). " +
    "⇒ DANS LES DEUX RÉGIMES, LA RÈGLE NE CHANGE PAS, ET LA VOICI RÉÉCRITE : je relève LES SIX CHAMPS " +
    "QUE MON CODE RÉCOLTE — `exports` en profondeur, `main`, `module`, `types`, `browser`, `bin` — " +
    "PLUS `files` s'il existe, PLUS votre `package.json`. Le premier SEGMENT de chaque cible. " +
    "⛔ ET SI JE LIS VOTRE ARBRE PAR UN CHEMIN DE DISQUE EN DUR, LA RACINE VIENT DU CHEMIN, PAS DE " +
    "VOTRE MANIFESTE : un dépôt qui n'en publie pas peut être relevé, et il l'est. " +
    "⚠️ MA PHRASE PRÉCÉDENTE DISAIT « ce que VOTRE manifeste expose », ET ELLE ÉTAIT FAUSSE DEUX FOIS " +
    "(2026-08-25) : atlas n'a AUCUN manifeste — par la lettre je ne relevais rien chez lui pendant que " +
    "mon script lisait son arbre — et « expose » a fait lire à deux d'entre vous la surface d'un " +
    "empaquetage, qui est un SUR-ENSEMBLE de ce que je récolte. " +
    "⇒ ⛔ ET LE CRITÈRE QUI COMPTE N'EST PAS « une racine exposée que je ne gèle pas », C'EST « UN " +
    "FICHIER QUE JE LIS ET QUE JE NE GÈLE PAS ». Geler ce que je ne lis pas vous coûte une discipline " +
    "inutile ; lire ce que je ne gèle pas fait porter mon verdict sur deux états, et rien ne rougit. " +
    "SI VOUS EN TROUVEZ UN, C'EST ÇA QU'IL FAUT ME RENDRE — pas une racine de plus dans un paquet. " +
    "⛔ ET IL Y A DEUX RAISONS DE NE PAS RELEVER UNE RACINE, PAS UNE : soit elle n'existe " +
    "pas chez vous, soit elle existe et votre manifeste ne l'expose pas — dans les deux cas je ne " +
    "l'y lis pas. Ma phrase précédente ne nommait que la première, et kronos s'est imposé une " +
    "discipline sur un fichier que je ne lis pas chez lui, faute de pouvoir trancher son cas. " +
    "⛔ VOTRE `package.json` EST SURVEILLÉ CHEZ VOUS TOUS, MÊME S'IL N'EST PAS DANS VOS `files` : " +
    "c'est lui qui DÉFINIT les racines ci-dessus. Le laisser dehors permettait qu'il bascule sous ma " +
    "mesure — la liste changeait, et mon témoin restait vert en attestant l'immobilité d'un périmètre " +
    "qui avait bougé (relevé par kronos, 2026-08-25). " +
    "⛔ CE QUI FERME CETTE FENÊTRE EST MON MESSAGE DE FIN, JAMAIS L'HEURE : l'heure annoncée est un " +
    "PLANCHER calculé sur une constante, et mes campagnes la dépassent déjà de plusieurs minutes. " +
    "Attendez le verdict que je vous enverrai à l'arrivée ; une attente calée sur l'horloge écrite " +
    "vous fera écrire pendant que je mesure encore";
  // ⛔ CET APPEL NE PASSE PLUS PAR UN SHELL, ET C'EST LE MOTIF QUI L'EXIGE. Le 2026-08-25 j'ai ajouté
  // un accent grave dans ce texte — « votre `package.json` est surveillé » — et la tour a répondu
  // « bash: package.json : commande introuvable ». Un accent grave à l'intérieur des guillemets que
  // `JSON.stringify` pose est une SUBSTITUTION DE COMMANDE pour bash : il a exécuté le nom du fichier
  // dont je parlais. La campagne est morte à l'ouverture, sans que personne soit gelé.
  // ⇒ Retirer l'accent grave aurait été le contournement : le piège resterait armé pour la phrase
  //   suivante, et ce texte est fait pour être réécrit. Les arguments partent donc en TABLEAU, où
  //   aucun caractère n'a de sens pour personne. (Les autres appels à la tour n'interpolent que des
  //   noms de dépôts et des chemins que j'ai fabriqués : eux ne prennent aucun texte libre.)
  try {
    execFileSync(
      TOUR,
      [
        "fenetre", "ouvrir", "kanopi",
        "--minutes", String(FENETRE_MIN),
        "--lit", "disque",
        "--depots", actifs.join(","),
        "--racines", racinesLues.join(","),
        "--motif", motif,
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, BP_AGENT: "kanopi" },
      },
    );
  } catch (e) {
    // ⛔ LA RAISON DU REFUS, PAS LA COMMANDE QUI A ÉCHOUÉ. `e.message` commence par « Command
    // failed: » suivi de la ligne entière — motif compris — et noyait le seul mot qui compte : ce
    // que la tour a répondu. Mesuré le 2026-08-21 sur cinq refus d'affilée, tous illisibles, et
    // c'est exactement le grief que j'adresse aux refus des autres. La tour parle sur ses deux
    // sorties ; on les prend toutes les deux.
    const dit = [e.stderr, e.stdout]
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
      .join(" · ");
    console.log(
      `  la tour a refusé l'ouverture — ${dit || `aucune raison rendue (code ${e.status ?? "?"})`}`,
    );
    return null;
  }

  // ⛔ ON NE LIT PAS LE MESSAGE, ON MESURE L'ÉTAT — mais PAS pour la raison que j'avais écrite.
  //
  // J'avais noté « la commande rend 0 même quand elle refuse ». C'EST FAUX, et l'architecte l'a
  // mesuré avant moi. Remesuré ici, sans tube : un refus sort en CODE 1. Ma mesure d'origine lisait
  // `$?` DERRIÈRE UN TUBE, et `$?` rapporte le code du DERNIER maillon — `head`, jamais `tour`. Le
  // `execFileSync` ci-dessus lève donc bien sur un refus, et c'est lui qui l'attrape.
  //
  // CE CONTRÔLE RESTE PARCE QU'IL RÉPOND À UNE AUTRE QUESTION : « la commande a réussi » et « MA
  // fenêtre est ouverte » ne sont pas la même chose. Un texte se reformule, un code de sortie change
  // de convention ; la fenêtre, elle, existe sous mon nom ou n'existe pas.
  const ouvertes = execFileSync(TOUR, ["fenetre"], {
    encoding: "utf8",
    env: { ...process.env, BP_AGENT: "kanopi" },
  });
  if (!/kanopi/.test(ouvertes)) {
    console.log("  la tour a REFUSÉ la fenêtre — je retourne attendre :");
    for (const l of ouvertes.split("\n").slice(0, 4))
      if (l.trim()) console.log(`    ${l}`);
    return null;
  }
  return actifs;
}

/**
 * LE VERDICT REVIENT À CEUX QUI ONT ÉTÉ GELÉS, ET IL PART D'ICI.
 *
 * ⛔ JE LE FAISAIS À LA MAIN, DONC MAL, DONC PAS. runtime-osc a tenu trois de mes fenêtres et n'a
 * jamais reçu un seul code de sortie — il me l'a réclamé le 2026-08-21, à juste titre : « un gel dont
 * le verdict ne revient jamais s'use ; la fois suivante, on le respecte moins ». Le mécanisme entier
 * repose sur ce que des voisins acceptent de s'imposer sans que rien ne les y force.
 *
 * C'est la même correction que le préavis lui-même : ce qui dépend de ma vigilance se périme au
 * premier tour où je suis occupé ailleurs.
 */
function rendreLeVerdict(
  destinataires,
  depart,
  arrivee,
  sortie,
  sortiePush,
  identifiant,
  pendant,
  ecrituresChezMoi,
) {
  if (destinataires.length === 0) return;
  // ⛔ SI MON SOURCE A BOUGÉ DEPUIS MON LANCEMENT, CE MESSAGE PEUT NE PAS ÊTRE CELUI QUE MON DÉPÔT
  // PORTE — et le destinataire n'a aucun moyen de le savoir. Il le dit lui-même, en tête, avant tout
  // le reste : un message qui peut mentir sur sa propre version doit le déclarer.
  const derive = monSourceABouge();
  const avertissementDeVersion = derive
    ? `⛔ CE VERDICT PEUT NE PAS ÊTRE À JOUR — mon source a été ${derive}. Un processus charge son\n` +
      `source au LANCEMENT : ce que mon dépôt porte maintenant n'est pas forcément ce qui a écrit ces\n` +
      `lignes. Le 2026-08-30 à 03:01, un verdict est parti avec une phrase que la campagne elle-même\n` +
      `poussait corrigée. ⇒ Lire ce message contre le commit poussé ci-dessous, jamais contre mon\n` +
      `dépôt à l'instant de la lecture.\n\n`
    : "";
  const pousse = /main -> main/.test(sortiePush)
    ? (sortiePush.match(/[0-9a-f]{7}\.\.[0-9a-f]{7}/) ?? ["poussé"])[0]
    : "rien poussé";
  // ⛔ LE NOM SORT JUSQU'AU DESTINATAIRE. La première version disait « ⚠ UNE BASCULE A ÉTÉ NOMMÉE »
  // sans dire chez QUI — runtime-osc l'a relevé dans l'heure : dix dépôts mesurent pour rien pendant
  // que le onzième ne sait pas que c'est lui. C'est la même forme que le verdict qui ne revenait
  // jamais, corrigé le matin même : un verdict qui ne permet à personne d'agir s'use aussi vite
  // qu'un verdict absent. Mon garde CONNAÎT le nom, il l'écrit dans son refus — il n'y avait qu'à
  // le laisser passer.
  const nommes = [
    ...sortiePush.matchAll(/^\s*•\s+(\S+)\s+—\s+(\d+)\s+entrée/gm),
  ].map((m) => `${m[1]} (${m[2]} entrée(s))`);
  const bascule = /BASCUL/.test(sortiePush)
    ? `\n    ⚠ BASCULE NOMMÉE CHEZ : ${nommes.join(", ") || "nom non extrait — voir mon journal"}`
    : "";
  // ⛔ LE VERDICT NOMME SA CAUSE. Relevé par runtime-MIDI le 2026-08-24, après trois rouges en
  // quinze minutes : « un verdict qui ne nomme pas sa cause ne permet à personne de t'aider — tes
  // voisins ne peuvent que répondre "pas moi", et je viens de le faire trois fois ».
  // (le motif et le repli vivent dans `causeDuRouge`, éprouvée sur des sorties réelles)
  const causes = causeDuRouge(sortiePush).join("\n    ");
  const pourquoi =
    sortie === "0" ? "" : `\n    CE QUI A RENDU ${sortie} :\n    ${causes}\n`;
  const texte =
    avertissementDeVersion +
    `VERDICT DE LA CAMPAGNE ${identifiant}, tirée par ${ARME} — départ ${hh(depart)}, arrivée ${hh(arrivee)}.\n\n` +
    `⛔ CET IDENTIFIANT EST CELUI DE L'AVIS QUE VOUS AVEZ REÇU. S'il ne correspond pas au DERNIER\n` +
    `avis reçu de moi, ce verdict ne vous libère PAS : une autre campagne mesure encore.\n\n` +
    `    CODE DE SORTIE DU CROCHET : ${sortie}\n` +
    pourquoi +
    `    ${pousse}${bascule}\n\n` +
    `⛔ ET CE CODE NE DIT PAS SI VOTRE GEL A TENU — il rend 1 pour TOUTE cause qui me fait rougir :\n` +
    `un banc à moi, un garde à moi, une dépendance. Un voisin qui aurait basculé pendant ma mesure\n` +
    `produirait ce même 1, et un voisin parfaitement discipliné aussi. Ce code mesure MA porte, pas\n` +
    `vos gestes ; ce qui dirait vos gestes est le RELEVÉ D'INTERVALLE ci-dessous.\n\n` +
    `⛔ ET MOI, QU'AI-JE ÉCRIT PENDANT QUE JE VOUS GELAIS ? Un gel demande à l'autre de ne pas écrire,\n` +
    `et rien ne le demande à MON portillon, qui construit et efface sous mon propre arbre. Ceux d'entre\n` +
    `vous dont le banc lit MA source lisaient donc un arbre qui bougeait. Mesuré à la trace des\n` +
    `ouvertures de cette campagne même, jamais par lecture de mes scripts :\n\n` +
    `    ${(ecrituresChezMoi ?? "CE QUE MON PORTILLON A ÉCRIT CHEZ MOI : NON MESURÉ.").replace(/\n/g, "\n    ")}\n\n` +
    `⛔ CE QUI A BOUGÉ PENDANT QUE JE MESURAIS — comparaison DÉPART contre ARRIVÉE, chez chacun sous\n` +
    `les racines que SON manifeste expose et dans ce manifeste. ⚠️ CETTE LISTE EST GLOBALE : elle porte\n` +
    `les onze, pas vous seul. Cherchez votre nom ; son absence vous concerne autant que sa présence.\n` +
    (pendant.length
      ? `      ${pendant.join('\n      ')}\n` +
        `      ⇒ ${pendant.length} bascule(s) sur les ${destinataires.length} dépôts gelés.\n`
      : `      aucune bascule chez AUCUN des ${destinataires.length} dépôts gelés, ET VOICI CE QUE CETTE\n` +
        `      ABSENCE COUVRE — je nomme ma portée au lieu de déclarer une opposabilité pleine :\n` +
        `        ✓ les fichiers qui SURVIVENT sous les racines relevées, départ contre arrivée\n` +
        `        ✓ les DOSSIERS eux-mêmes — donc un fichier créé PUIS RETIRÉ, qui ne laisse aucune date\n` +
        `        ✓ les racines LUES des deux côtés — une racine absente à l'un de mes deux relevés est\n` +
        `          nommée, jamais sautée en silence\n` +
        `        ⛔ PAS une racine qui disparaît ET revient ENTIÈREMENT entre mes deux relevés : mes\n` +
        `          lectures sont à dix-huit minutes, un renommage dure des millisecondes.\n`) +
    `(Relevé par kronos le 2026-08-25 : cette phrase promettait « VOTRE manifeste » et rendait la liste\n` +
    `de tout le monde — fausse dès sa rédaction, deux heures plus tôt, pas héritée d'une forme ancienne.\n` +
    `Il a nommé le risque que la réparation naïve aurait introduit : filtrer par destinataire SANS rendre\n` +
    `le total ferait lire à celui qui a bougé un relevé qui ne le nomme pas — « un relevé qui nomme le\n` +
    `mauvais dépôt disculpe le bon coupable, et il le fait en vert ». D'où la ligne ET le compte.)\n` +
    `\n(⛔ POURQUOI CETTE PHRASE NOMME SA PORTÉE AU LIEU DE DÉCLARER « OPPOSABLE ». Le 2026-08-30, deux\n` +
    `verdicts consécutifs sont partis en promettant une opposabilité pleine que je savais déjà trop\n` +
    `large : celui de 02:11, une heure après avoir mesuré que le créé-puis-retiré m'échappait ; celui\n` +
    `de 02:36, PENDANT que BPx me montrait qu'une racine absente sortait de mon relevé en silence.\n` +
    `Relevé par runtime-UI puis par BPx, chacun en rapprochant deux de mes propres phrases.\n` +
    `⇒ La cause n'était pas ma lenteur à corriger : une phrase qui AFFIRME une opposabilité pleine\n` +
    `devient trop large dès qu'une cécité apparaît, et il en est apparu une par heure cette nuit-là.\n` +
    `J'avais répondu « à partir de ma prochaine campagne, la phrase couvre ce qu'elle dit » — une\n` +
    `promesse à date de péremption inconnue, démentie à la campagne suivante. ⇒ Une phrase qui dit sa\n` +
    `portée ne peut plus être débordée par une découverte : elle peut seulement être COMPLÉTÉE.)\n` +
    `\n(Relevé par kairos le 2026-08-25 : ma phrase disait « mesuré sur l'état de vos arbres à\n` +
    `l'instant de ma lecture », et j'appelais ça opposable. Une photo à l'arrivée ne peut pas\n` +
    `attester une immobilité pendant un intervalle : un dépôt qui écrivait puis commitait avant mon\n` +
    `arrivée me rendait le MÊME relevé qu'un dépôt immobile. Mes 90 s de grâce étaient surveillées en\n` +
    `continu, mes 18 minutes de mesure ne l'étaient pas. Le mot « opposable » valait pour la grâce et\n` +
    `pas pour la campagne ; il vaut désormais pour les deux. ⚠️ Et aucune de mes campagnes ANTÉRIEURES\n` +
    `à ce jour ne peut être requalifiée — fermer une cause n'efface pas un doute.)\n` +
    `(Le manifeste est entré dans le relevé le même jour : il en était exclu alors qu'il DÉFINIT le\n` +
    `reste, donc une bascule de vos exports faisait changer mon périmètre sous ma mesure sans qu'aucune\n` +
    `ligne ne le dise. Relevé par kronos.)\n` +
    `(Relevé par runtime-MIDI le 2026-08-24 : ma phrase précédente faisait dire à un chiffre juste\n` +
    `sur son étage quelque chose qui appartient au suivant. Puis par bp3-frontend, le même jour :\n` +
    `elle déclarait MANQUANT l'instrument qui figure deux lignes plus haut — cadrage périmé.)\n\n` +
    `Ce message part du code qui tire, pas de ma mémoire : un gel dont le verdict ne revient jamais\n` +
    `s'use.\n`;
  const fichier = `/tmp/kanopi-verdict-${depart.getTime()}.txt`;
  writeFileSync(fichier, texte, "utf8");
  // ⛔ UN VERDICT QUI NE PART PAS ÉTAIT INVISIBLE DÈS LA SESSION CLOSE. Cet échec ne vivait que dans
  // la sortie du tir, qui ne survit pas — donc « un gel dont le verdict ne revient jamais s'use » se
  // produisait sans que je puisse le savoir. Mesuré par runtime-in puis chiffré par runtime-midi sur
  // leurs archives : DEUX occurrences (21/08 13:46 et 24/08 12:15), toutes deux après la naissance du
  // mécanisme. Je ne les ai découvertes que parce qu'ils gardent une meilleure archive de mes
  // campagnes que moi.
  const perdus = [];
  for (const dest of destinataires) {
    try {
      execFileSync(TOUR, ["note", dest, "--fichier", fichier], {
        encoding: "utf8",
        env: { ...process.env, BP_AGENT: "kanopi" },
      });
    } catch (e) {
      const raison = String(e.message).split("\n")[0];
      console.log(`  verdict NON transmis a ${dest} : ${raison}`);
      perdus.push({ dest, raison });
    }
  }
  try {
    unlinkSync(fichier);
  } catch {
    /* déjà disparu — sans effet, le verdict est parti */
  }
  // ⛔ ET LE COMPTE EST OPPOSABLE : « rendu à N » ne disait pas si N était le nombre de gelés. Un
  // verdict perdu chez un seul faisait la même ligne qu'une transmission complète.
  inscrireAuRegistre({
    le: new Date().toISOString(),
    evenement: "verdict",
    campagne: identifiant,
    arme: ARME,
    destinataires: destinataires.length,
    transmis: destinataires.length - perdus.length,
    perdus,
  });
  console.log(
    `VERDICT RENDU a ${destinataires.length - perdus.length} depot(s) sur ${destinataires.length}` +
      (perdus.length ? ` — ⛔ ${perdus.length} PERDU(S) : ${perdus.map((p) => p.dest).join(", ")}` : ""),
  );
}

/** ⛔ UNE ANNULATION REND SA PROPRE PIÈCE, AU MÊME RANG QU'UN VERDICT.
 *
 *  Le 2026-08-24, une fenêtre s'est ouverte à 10:33 et s'est refermée à 10:34 sur l'écriture d'un
 *  voisin : la campagne n'est jamais partie. Onze dépôts sont restés gelés une heure, et deux d'entre
 *  eux ont compté les dépôts des campagnes précédentes — deux messages à chaque fois, un seul cette
 *  fois — pour découvrir qu'aucun verdict ne viendrait. Ma règle disait « l'heure est un plancher,
 *  mon message de fin ferme » et n'avait pas de branche pour la campagne ANNULÉE : celle-là ne rend
 *  aucun verdict, donc n'envoie jamais ce qui fermerait. Un voisin discipliné attend un signal qui
 *  n'existe pas.
 *
 *  ⇒ Une fin de gel qui arrive SEULE ne doit plus jamais être ambiguë.
 *
 *  ⛔ ET ELLE NE DOIT PAS NON PLUS ACCUSER AU HASARD. Jusqu'au 2026-08-25 cette pièce rendait la
 *  liste brute de ce qui fermait, où « X a écrit à 05:07:21 » désignait indifféremment un gel rompu
 *  et un arbre plus frais que mon seuil de calme — deux faits opposés sous une phrase unique. Un
 *  voisin qui n'avait rien enfreint s'est reconnu dans un reproche que je ne lui faisais pas.
 *  ⇒ Les raisons arrivent maintenant QUALIFIÉES par `ceQuiFerme`, et le corps du message dit la
 *    règle en clair pour que la qualification ne se relise pas de travers. */
function rendreLAnnulation(destinataires, ouverte, ferme, identifiant) {
  if (destinataires.length === 0) return;
  const texte =
    `⛔ CAMPAGNE ${identifiant} (${ARME}) ANNULÉE — RIEN N'A ÉTÉ MESURÉ, ET VOTRE GEL EST LEVÉ.\n\n` +
    `    fenêtre ouverte à ${hh(ouverte)}, annulée à ${hh(new Date())}\n` +
    `    ce qui l'a refermée :\n      ${ferme.join("\n      ")}\n\n` +
    `⛔ LISEZ LA QUALIFICATION, PAS SEULEMENT LE NOM — les deux cas ci-dessus n'ont rien à voir :\n` +
    `  • « PENDANT le gel » : l'écriture est postérieure à mon ouverture, donc la borne était posée\n` +
    `    quand elle est survenue. C'est le seul cas où un geste de votre part est en cause.\n` +
    `  • « AVANT l'ouverture » : votre écriture PRÉCÈDE ma fenêtre. Elle la ferme parce que j'exige\n` +
    `    ${CALME_MS / 1000} s de calme avant de partir — un arbre trop frais mesure mal. VOUS N'AVEZ RIEN\n` +
    `    ENFREINT, et il n'y avait rien à respecter : rien n'était encore gelé. Ce délai est à moi.\n\n` +
    `Il n'y a PAS de code de sortie à vous rendre, ni de plage de commits : le crochet n'a jamais\n` +
    `tourné. N'attendez aucun verdict pour celle-ci — il n'existe pas.\n\n` +
    `Ce message part du code qui tire : une fin de gel qui arrive seule serait ambiguë, et un gel dont\n` +
    `le verdict ne revient jamais s'use.\n`;
  const fichier = `/tmp/kanopi-annulation-${Date.now()}.txt`;
  writeFileSync(fichier, texte, "utf8");
  // ⛔ MÊME TROU QUE LE VERDICT, ET IL SE RÉPARE DANS LE MÊME GESTE. Réparer une moitié d'une paire
  // symétrique laisse l'autre muette — c'est la classe que je relève chez mes voisins depuis ce matin.
  // Une annulation perdue est PIRE qu'un verdict perdu : le gelé n'attend alors ni l'un ni l'autre, et
  // rien ne lui dira jamais que sa fenêtre est levée.
  const perdus = [];
  for (const dest of destinataires) {
    try {
      execFileSync(TOUR, ["note", dest, "--fichier", fichier], {
        encoding: "utf8",
        env: { ...process.env, BP_AGENT: "kanopi" },
      });
    } catch (e) {
      const raison = String(e.message).split("\n")[0];
      console.log(`  annulation NON transmise a ${dest} : ${raison}`);
      perdus.push({ dest, raison });
    }
  }
  try {
    unlinkSync(fichier);
  } catch {
    /* déjà disparu — sans effet, l'annulation est partie */
  }
  inscrireAuRegistre({
    le: new Date().toISOString(),
    evenement: "annulation-rendue",
    campagne: identifiant,
    arme: ARME,
    destinataires: destinataires.length,
    transmis: destinataires.length - perdus.length,
    perdus,
  });
  console.log(
    `ANNULATION RENDUE a ${destinataires.length - perdus.length} depot(s) sur ${destinataires.length}` +
      (perdus.length ? ` — ⛔ ${perdus.length} PERDUE(S) : ${perdus.map((p) => p.dest).join(", ")}` : ""),
  );
}

/** La fenêtre se referme dès le verdict rendu — elle expire seule, mais la laisser courir gèle des
 *  voisins pour rien. */
function fermerLaFenetre() {
  try {
    execFileSync(TOUR, ["fenetre", "fermer", "kanopi"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, BP_AGENT: "kanopi" },
    });
  } catch {
    /* la fenêtre a expiré d'elle-même — rien à fermer, et c'est le cas nominal après 20 minutes */
  }
}

// ⛔⛔ TIRER EST UN LANCEMENT, JAMAIS UN CHARGEMENT — et ce garde existe parce que j'ai ouvert DEUX
// fenêtres par accident le 2026-08-25, les deux en travaillant SUR cette arme.
//
//     ~22:20   `node scripts/tir-arme.mjs --aide` — le drapeau n'existe pas, il a été IGNORÉ et
//              l'arme est partie. Arrêtée avant l'ouverture.
//     23:23:57 `import('.../tir-arme.mjs')` pour vérifier ma syntaxe après l'avoir modifiée.
//              ⇒ **L'import EST le lancement** : douze dépôts gelés, deux minutes, aucune mesure.
//
// ⇒ Il n'y avait AUCUN moyen de charger ce fichier sans le faire tirer. Une vérification, une lecture
//   par un outil, un banc qui l'importerait un jour : tous ouvrent une fenêtre sur douze dépôts.
//
// ⇒ ⛔ LE REMÈDE RETIRE LE PIÈGE, IL NE DEMANDE PAS D'Y PENSER. La discipline « ne l'importe pas » a
//   déjà échoué deux fois en trois heures, chez quelqu'un qui la connaissait. Le même motif garde
//   déjà mes trois modules de `lib/`, où l'épreuve ne doit pas tourner à l'import.
//
// ⚠️ ET UN DRAPEAU INCONNU DOIT ÊTRE REFUSÉ, PAS IGNORÉ : c'est la première des deux ouvertures. Une
// arme qui accepte silencieusement ce qu'elle ne comprend pas fait tirer une commande qui demandait
// autre chose.
{
  const { pathToFileURL } = await import("node:url");
  const lanceDirectement =
    process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
  if (!lanceDirectement) {
    console.error(
      "⛔ `tir-arme.mjs` a été IMPORTÉ, pas lancé — je ne tire pas.\n" +
        "   Tirer gèle douze dépôts ; un import est une lecture, jamais une intention de tirer.\n" +
        "   Pour tirer : `node scripts/tir-arme.mjs`.",
    );
  } else if (process.argv.slice(2).join(" ") === "--releve-depots") {
    // ⛔ TOUS LES VOISINS QUE JE LIS, PAS SEULEMENT LES ACTIFS — et la différence est le sujet.
    //
    // Ma campagne ne gèle que les voisins EN CHANTIER : elle dure vingt minutes et se retarde, donc
    // geler qui se tait coûte une discipline pour rien. ⇒ `trace-du-portillon.mjs` ne se retarde
    // pas — il se prend quand le portillon a changé — et il dure plus longtemps. Un voisin muet
    // depuis une heure peut reconstruire à la minute suivante : c'est exactement ce qui a coupé
    // deux relevés le 2026-08-31.
    // ⇒ Deux gestes, deux populations, la MÊME dérivation en dessous. Le relevé la demande ici.
    try {
      for (const v of voisinsAGeler()) console.log(nomDeGel(v).toLowerCase());
    } catch (e) {
      console.error(`⛔ la dérivation a jeté : ${e.message}`);
      process.exit(1);
    }
  } else if (process.argv.slice(2).join(" ") === "--releve-racines") {
    // ⛔ LA MÊME RÉPONSE QUE `--releve`, RENDUE POUR UNE MACHINE. `trace-du-portillon.mjs` doit
    // déclarer à la tour les racines qu'il lit, sous peine de refus sur un fichier sale hors sujet ;
    // il les demande ICI plutôt que de les recopier. Une racine par ligne, rien d'autre : un format
    // qu'on parse est un format qui doit rester nu.
    // ⇒ Comme `--releve`, il n'appelle NI la tour NI aucun gel : il dérive, il imprime, il sort.
    try {
      for (const r of racinesQueJeLis()) console.log(r);
    } catch (e) {
      console.error(`⛔ la dérivation a jeté : ${e.message}`);
      process.exit(1);
    }
  } else if (process.argv.slice(2).join(" ") === "--releve") {
    // ⛔ CE QUE JE RELÈVE SE DEMANDE, ET LA RÉPONSE VIENT DE L'ARME — PAS D'UN HARNAIS QUI LA COPIE.
    //
    // Demandé par bp3-frontend le 2026-08-25 : « ce que ton arme relève RÉELLEMENT chez moi — est-ce
    // `src` seul, ou davantage ? » Sa lecture était prise à ma référence PUBLIÉE, et atlas venait de
    // démontrer que mon publié est en retard sur ce qui tourne. Aucun de mes voisins ne pouvait donc
    // répondre depuis sa surface, et moi je ne pouvais répondre qu'en réécrivant ma logique dans un
    // script à part — c'est-à-dire par un contrôle qui partagerait le défaut de son sujet.
    //
    // ⇒ Il n'appelle NI la tour NI aucun gel : il dérive la même liste par les mêmes fonctions, il
    //   l'imprime, il sort. C'est le seul drapeau que cette arme accepte, et le garde ci-dessous le
    //   nomme au lieu de l'exempter.
    let voisins;
    try {
      voisins = voisinsAGeler();
    } catch (e) {
      console.error(`⛔ la dérivation a jeté : ${e.message}`);
      process.exit(1);
    }
    console.log(`CE QUE MON ARME RELÈVE — ${voisins.length} dépôt(s), dérivé à l'instant :\n`);
    for (const v of voisins.sort((a, b) => nomDeGel(a).localeCompare(nomDeGel(b)))) {
      const racines = [...racinesDeCeVoisin(v)].sort();
      const { examines } = derniereEcriture(v.chemin, racinesDeCeVoisin(v));
      console.log(
        `  ${nomDeGel(v).padEnd(20)} ${racines.join(" · ").padEnd(46)} ${String(examines).padStart(5)} fichier(s) examinés` +
          (v.sites ? `\n  ${" ".repeat(20)} lu par chemin : ${v.sites.join(" ")}` : ""),
      );
    }
    // ⛔ LE MÊME CONTRÔLE QUE LE VERDICT, RENDU ICI — sinon il ne s'éprouve qu'en gelant douze
    // dépôts. Le relevé dure assez longtemps pour qu'on modifie ce fichier pendant qu'il tourne :
    // c'est là que la dérive de version se montre, sans campagne.
    const deriveIci = monSourceABouge();
    console.log(
      deriveIci
        ? `\n⛔ MON SOURCE A ÉTÉ ${deriveIci} — un verdict parti maintenant ne serait pas celui que mon dépôt porte.`
        : "\n✓ mon source est celui que j'ai chargé au lancement.",
    );
    console.log("\nAucune fenêtre ouverte, aucun dépôt gelé, rien n'a été mesuré.");
    process.exit(0);
  } else {
    const inconnus = process.argv.slice(2).filter((a) => a.startsWith("-"));
    if (inconnus.length) {
      console.error(
        `⛔ DRAPEAU INCONNU : ${inconnus.join(" ")} — je ne tire pas.\n` +
          "   Cette arme n'en prend aucun. Les ignorer a déjà fait partir une campagne qui\n" +
          "   demandait de l'aide (2026-08-25, ~22:20).",
      );
      process.exit(2);
    }
    await tirer();
  }
}

/**
 * CE QUE MON PORTILLON ÉCRIT DANS MON PROPRE ARBRE, rendu par racine de tête — la granularité que mes
 * voisins emploient quand ils déclarent ce que leur banc lit chez moi.
 *
 * ⛔ SON EMPLOI EST UN AVEU, PAS UN BULLETIN DE SANTÉ : un voisin qui gèle mon dépôt me demande de ne
 * rien écrire sous ses racines, et cette ligne dit si mon portillon a tenu cette demande à sa place.
 * Elle part donc DANS LE VERDICT, chez les gelés, jamais seulement dans ma console.
 *
 * ⛔ ET ELLE PORTE SA DATE, PARCE QU'ELLE N'EST PLUS PRISE PENDANT CETTE CAMPAGNE-CI. Le relevé vient
 * de `scripts/trace-du-portillon.mjs`, hors fenêtre ; `garde-releve-du-portillon` refuse le portillon
 * dès que le portillon change sans qu'un nouveau relevé soit pris. ⇒ Un lecteur doit pouvoir voir
 * QUAND la mesure a été faite, sinon la ligne se lit comme si elle venait de l'instant.
 *
 * ⚠️ UN RELEVÉ ABSENT SE DIT ABSENT. Sans lui, la campagne tourne quand même — mais la ligne annonce
 * qu'elle n'a rien mesuré, au lieu de rendre un zéro qui ressemble à une absence d'écriture.
 */
function ceQueMonPortillonAEcrit() {
  const releve = lireReleve();
  if (!releve)
    return "CE QUE MON PORTILLON ÉCRIT CHEZ MOI : NON MESURÉ — aucun relevé sur le disque.";
  if (releve.enCours)
    return `CE QUE MON PORTILLON ÉCRIT CHEZ MOI : NON MESURÉ — un relevé a démarré le ${releve.quand} et n'a jamais fini.`;
  const m = releve.mesure;
  if (!m)
    return `CE QUE MON PORTILLON ÉCRIT CHEZ MOI : NON MESURÉ le ${releve.quand} — ${releve.pourquoi ?? "sans raison notée"}.`;
  const tetes = Object.entries(m.parRacineDeTete).map(([tete, n]) => `${tete} (${n})`);
  // ⇒ CE QUI RESTE NON RÉSOLU SE QUALIFIE AU LIEU DE RESTER UNE CÉCITÉ OUVERTE. Mesure donnée par
  // runtime-MIDI le 2026-08-30 : une écriture sous `.git/` ne peut pas faire basculer un fichier
  // d'ARBRE DE TRAVAIL, et c'est l'arbre de travail que mes voisins relèvent. ⇒ Savoir où elles
  // atterrissent devient inutile SI elles sont toutes sous `.git/` — et la question reste entière
  // dès qu'une seule ne l'est pas. C'est un oui/non sur la trace, pas une résolution de chemin.
  const relatifs = m.relatifsNonResolus
    ? m.relatifsHorsGit === 0
      ? `\n    ✓ ${m.relatifsNonResolus} chemin(s) relatif(s) non résolus, TOUS sous .git/ — ils ne peuvent atteindre aucun fichier d arbre de travail.`
      : `\n    ⚠️ ${m.relatifsNonResolus} chemin(s) RELATIF(S) non résolus, dont ${m.relatifsHorsGit} HORS de .git/ : ${(m.echantillonHorsGit ?? []).slice(0, 5).join(", ")}`
    : "";
  return (
    `CE QUE MON PORTILLON ÉCRIT CHEZ MOI — relevé du ${releve.quand}, portillon @${releve.empreinte}, ` +
    `pris HORS FENÊTRE (il sortait en ${releve.sortieDuPortillon}) :\n    ` +
    `${m.appelsExamines} appel(s) examiné(s), ${m.appelsEcrivants} écrivant(s), ${m.cheminsSousMonArbre} chemin(s) sous mon arbre\n    ` +
    (tetes.length ? `sous ${tetes.join(" · ")}` : "AUCUNE écriture sous mon arbre") +
    relatifs +
    `\n    ⚠️ CE RELEVÉ N'EST PAS DE CETTE CAMPAGNE : il vaut tant que mon portillon ne change pas, et` +
    `\n    mon garde de structure refuse de pousser dès qu'il change sans qu'un nouveau relevé soit pris.`
  );
}

async function tirer() {
// ⛔ UN SEUL TIR A LA FOIS. Le 2026-08-24 à 12:07 puis 12:08, DEUX fenêtres ont été ouvertes au nom
// de kanopi à une minute d'intervalle : deux armes tournaient, la seconde ayant été lancée après
// que la première eut déjà demandé la sienne. La tour n'en tient qu'une par émetteur, donc la
// seconde a EFFACÉ la première dans son état — et la première n'aura jamais de fin.
// ⇒ Relevé par runtime-ui et runtime-codevoices : « l'annulation dépose sa pièce ; le REMPLACEMENT
//   n'en dépose pas ». On supprime le remplacement plutôt que de lui écrire une pièce : deux armes
//   simultanées n'ont aucun usage légitime.
const VERROU = join(homedir(), ".local", "state", "kanopi", "tir.pid");
{
  if (existsSync(VERROU)) {
    const pid = Number(readFileSync(VERROU, "utf8").trim());
    let vivant = false;
    try {
      process.kill(pid, 0);
      vivant = true;
    } catch {
      /* le processus est mort — son verrou est un résidu */
    }
    if (vivant) {
      console.log(
        `⛔ UNE ARME TOURNE DÉJÀ (pid ${pid}) — je ne démarre pas. Deux armes ouvrent deux fenêtres ` +
          `au même nom, la tour n'en tient qu'une, et la première n'a jamais de fin.`,
      );
      process.exit(3);
    }
  }
  mkdirSync(join(homedir(), ".local", "state", "kanopi"), { recursive: true });
  writeFileSync(VERROU, String(process.pid));
  const lacher = () => {
    try {
      if (readFileSync(VERROU, "utf8").trim() === String(process.pid))
        unlinkSync(VERROU);
    } catch {
      /* déjà retiré */
    }
  };
  process.on("exit", lacher);
  // ⛔ UNE ARME QUI MEURT LAISSAIT SA FENÊTRE OUVERTE — douze dépôts gelés jusqu'à l'expiration, sans
  // verdict et sans personne pour la fermer. Mesuré le 2026-08-30 à 22:44 : l'arme a été tuée en
  // pleine poussée, sa fenêtre courait jusqu'à 23:12, et rien dans la tour ne le disait.
  //
  // ⇒ CE FILET NE LÂCHAIT QUE LE VERROU. Le verrou protège MA prochaine arme ; la fenêtre gèle LES
  //   AUTRES. Ne relâcher que le premier soigne exactement la moitié dont je suis victime.
  //
  // ⚠️ ET LE VERDICT NE PART PAS D'ICI : un gestionnaire de signal a le temps de fermer, pas celui de
  //   composer un rapport. Fermer sans rendre laisse les gelés sans nouvelle — c'est mieux que gelés
  //   sans nouvelle ET sans fin, et la levée que la tour envoie à la fermeture les prévient.
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"])
    process.on(sig, () => {
      try {
        fermerLaFenetre();
      } catch {
        /* la tour ne répond pas — le verrou se lâche quand même */
      }
      lacher();
      process.exit(130);
    });
}

const debut = Date.now();
let tours = 0;
let demandeeA = null;
let geles = [];
let ouverteA = null;
/** Le nom de la campagne EN COURS, dérivé de son heure d'ouverture. Il part dans l'avis et
 *  revient dans le verdict : sans lui, deux fenêtres en vol sont indiscernables pour un gelé. */
let identifiant = null;

for (;;) {
  const ecritures = dernieresEcritures();
  const ferme = ceQuiFerme(ecritures, ouverteA);

  if (ferme.length > 0) {
    // ⛔ UNE ECRITURE APRES LA DEMANDE ANNULE LA GRACE. Sans ça, la demande deviendrait une
    // formalite : on l'envoie, le voisin frappe, et on tire quand meme.
    if (demandeeA !== null) {
      console.log(
        `${hh(new Date())} — demande annulee, la fenetre s est refermee : ${ferme.join(", ")}`,
      );
      // La pièce part AVANT de tout remettre à zéro : après, on ne sait plus qui était gelé.
      enregistrerLAnnulation(identifiant, ARME, ferme);
      rendreLAnnulation(geles, ouverteA ?? new Date(), ferme, identifiant);
      fermerLaFenetre();
      demandeeA = null;
      geles = [];
      ouverteA = null;
      identifiant = null;
    } else if (tours % 8 === 0) {
      console.log(`${hh(new Date())} — j attends : ${ferme.join(", ")}`);
    }
  } else if (demandeeA === null) {
    // ⛔ LA FIN DE FENÊTRE SE COMPTE DEPUIS L'OUVERTURE, PAS DEPUIS LE DÉPART. Mesuré le 2026-08-21 :
    // j'annonçais 09:07 pendant que la tour affichait 09:05 pour la même fenêtre — deux heures pour
    // une seule chose, et la mienne était fausse de la durée de la grâce. Ce n'est pas cosmétique :
    // le voisin gelé se tient tranquille jusqu'à l'heure que je lui donne, donc je lui faisais
    // perdre ce que j'ajoutais.
    // ⛔ RIEN NE SE GÈLE AVANT QUE CE QUI EST À MOI SOIT VERT.
    const echec = preVol();
    if (echec !== null && echec.attribution.qui === "voisin") {
      // Un voisin a re-sali son arbre entre ma condition d'attente et mon pré-vol. Je RETOURNE
      // attendre — m'arrêter ici demanderait un relancement manuel pour une condition qui se lève
      // toute seule, et ferait porter à mon dépôt un rouge qui n'est pas le sien.
      console.log(
        `${hh(new Date())} — j attends : ${echec.attribution.phrase}\n${echec.cause}`,
      );
      tours++;
      execFileSync("sleep", [String(PAS_MS / 1000)]);
      continue;
    }
    if (echec !== null) {
      console.log(
        `${hh(new Date())} — ⛔ PRÉ-VOL ROUGE (${echec.etape}) — AUCUNE fenêtre demandée, ` +
          `personne n'est gelé. ${echec.attribution.phrase}\n${echec.cause}`,
      );
      process.exit(1);
    }
    const arrivee = new Date(Date.now() + FENETRE_MIN * 60_000);
    // ⛔ L'OUVERTURE SE DATE AVANT LA DEMANDE, PARCE QUE L'AVIS PORTE SON PROPRE NOM. Datée
    // après, l'identifiant écrit dans le motif ne serait pas celui de la fenêtre annoncée.
    const ouverture = new Date();
    // ⛔ LE DÉPART ANNONCÉ SE COMPTE DEPUIS L'OUVERTURE, PAS DEPUIS L'ENTRÉE DANS LA BRANCHE. Il
    // était calculé AVANT le pré-vol, qui dure une à deux minutes : l'heure partait donc fausse de
    // toute cette durée, et le 2026-08-25 à 14:32 elle est passée SOUS l'heure d'ouverture — un avis
    // annonçant un départ à 14:32:58 pour une fenêtre ouverte à 14:32:59.
    // ⇒ Même défaut que celui corrigé le 2026-08-21 sur la FIN de fenêtre, à l'autre bout de la
    //   phrase : j'avais rattaché la fin à l'ouverture et laissé le départ à son ancien point de
    //   calcul. Réparer une moitié d'une paire laisse l'autre fausse.
    const depart = new Date(ouverture.getTime() + GRACE_MS);
    identifiant = identifiantDeCampagne(ouverture);
    const prevenus = demanderLaFenetre(ecritures, identifiant);
    if (prevenus === null) {
      // La tour a refusé : on ne tire pas, et on ne réessaie pas en boucle serrée. Le nom se
      // retire avec la demande — une campagne qui n'a pas ouvert n'a pas de nom à opposer.
      identifiant = null;
      tours++;
      execFileSync("sleep", [String(PAS_MS / 1000)]);
      continue;
    }
    enregistrerLOuverture(identifiant, ARME, prevenus);
    demandeeA = Date.now();
    geles = prevenus;
    ouverteA = ouverture;
    console.log(
      `${hh(new Date())} — FENETRE OUVERTE a la tour, gel de ${prevenus.join(", ") || "personne (aucun voisin en chantier)"}` +
        ` : depart ${hh(depart)}, arrivee ${hh(arrivee)}`,
    );
  } else if (Date.now() - demandeeA >= GRACE_MS) {
    const depart = new Date();
    console.log(`DEPART ${hh(depart)} — apres ${tours} tour(s) d attente`);
    // ⛔ LA CAMPAGNE NE TRACE PLUS — LE RELEVÉ EST PRIS À PART, HORS FENÊTRE.
    // Le 2026-08-30 elle traçait : la réponse était toujours fraîche et elle coûtait +26 %, soit
    // quatre minutes et demie de gel imposées à douze dépôts À CHAQUE TIR, pour une question qui ne
    // se repose qu'au changement de portillon. Décision de méthode de l'architecte le jour même :
    // `scripts/trace-du-portillon.mjs` la prend hors fenêtre, `garde-releve-du-portillon` refuse le
    // portillon tant qu'elle ne décrit pas le portillon d'aujourd'hui, et le verdict renvoie ici au
    // dernier relevé DATÉ.
    const r = execFileSync(
      "bash",
      ["-c", `cd ${RACINE} && git push 2>&1; echo "SORTIE:$?"`],
      {
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
      },
    );
    console.log(r);
    const arrivee = new Date();
    console.log(`ARRIVEE : ${hh(arrivee)}`);
    const ecrituresChezMoi = ceQueMonPortillonAEcrit();
    console.log(ecrituresChezMoi);
    // ⛔ LE SECOND RELEVÉ, ET C'EST CE QUI TRANSFORME UNE PHOTO EN INTERVALLE MESURÉ.
    //
    // Relevé par kairos le 2026-08-25 : « une photo à l'arrivée ne peut pas attester une immobilité
    // pendant un intervalle ». Mon verdict disait « rien n'a bougé sous vos racines, ce qui est plus
    // étroit que propre et donc OPPOSABLE » — et c'était faux pour la période qui compte.
    //
    //   de l'OUVERTURE au DÉPART (90 s)   la boucle relève toutes les 15 s et ANNULE la fenêtre
    //                                     si un voisin écrit — surveillance continue, réelle
    //   du DÉPART à l'ARRIVÉE (18 min)    ⛔ RIEN. La boucle s'est arrêtée pour tirer.
    //
    // ⇒ La surveillance couvrait la période où personne ne travaille encore et s'arrêtait pour celle
    //   qui compte. Un dépôt qui écrivait puis commitait avant mon arrivée me rendait le MÊME relevé
    //   qu'un dépôt immobile — sa formule : « un dépôt indiscipliné te rend le même relevé qu'un
    //   dépôt parfait ».
    // ⇒ La donnée existait déjà : `ecritures` tient le relevé de chacun au départ. Le refaire ici et
    //   comparer nomme qui a basculé PENDANT que je mesurais, ce qu'aucun de mes deux instruments ne
    //   faisait — ni ce relevé, ni la ligne de bascule extraite du crochet, qui lit à un instant.
    // ⚠️ ET CE QUI NE SE RÉPARE PAS : aucune de mes campagnes passées ne peut être requalifiée. C'est
    //   la différence entre fermer une cause et effacer un doute (sa phrase, gardée telle quelle).
    const pendant = basculesEntre(ecritures, dernieresEcritures(), hh);
    // ⛔ LE RELEVÉ RESTE CHEZ MOI AUSSI, ET PAS SEULEMENT DANS LE COURRIER. Mesuré le 2026-08-25, à la
    // première campagne qui l'a produit : il partait aux onze et je n'en gardais RIEN — le fichier de
    // verdict vit dans /tmp et se supprime à l'envoi. Un voisin qui conteste ma ligne de bascule me
    // trouverait donc sans pièce, alors que c'est moi qui la lui oppose. Une mesure qu'on ne garde pas
    // ne se rejoue pas, et « opposable » suppose qu'on puisse la reproduire.
    console.log(
      pendant.length
        ? `BASCULE(S) PENDANT MA MESURE : ${pendant.join(" · ")}`
        : "AUCUNE BASCULE pendant ma mesure — relevé d'intervalle, départ contre arrivée",
    );
    const sortie = (r.match(/SORTIE:(\d+)/) ?? [, "?"])[1];
    // ⛔ ENREGISTRER AVANT DE RENDRE LE VERDICT : la durée d'une campagne ne se mesure qu'une
    // fois, et un verdict qui échoue ne doit pas emporter la mesure avec lui.
    enregistrerLaCampagne(ouverteA ?? depart, arrivee, sortie, identifiant, ARME);
    rendreLeVerdict(
      geles,
      ouverteA ?? depart,
      arrivee,
      sortie,
      r,
      identifiant,
      pendant,
      ecrituresChezMoi,
    );
    fermerLaFenetre();
    break;
  }

  if (Date.now() - debut > PLAFOND_MS) {
    console.log(
      `PLAFOND ATTEINT — aucun tir. Ce qui fermait : ${ferme.join(", ") || "rien"}`,
    );
    break;
  }
  tours++;
  execFileSync("sleep", [String(PAS_MS / 1000)]);
}
}
