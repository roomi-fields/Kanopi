#!/usr/bin/env node
/**
 * POUSSER — mon pré-vol, ma poussée, ma publication, dans cet ordre et sous un verrou.
 *
 * ⛔ CE QUE CE FICHIER ÉTAIT, ET POURQUOI IL NE L'EST PLUS. Il portait le geste de la campagne
 * DEMANDÉE : une campagne de portillon dure quinze minutes, un voisin en chantier enregistre toutes
 * les trois à huit minutes, et le 2026-08-20 trois campagnes consécutives ont été invalidées par une
 * bascule survenue pendant qu'elles mesuraient. Il attendait donc le calme, demandait une fenêtre à
 * la tour, gelait douze dépôts, tirait, refermait et rendait un verdict aux gelés.
 *
 * ⇒ ⛔ TOUT CELA EST RETIRÉ LE 2026-09-04, sur la demande de Romain relayée par l'architecte, et la
 *   raison n'est pas un assouplissement : **le problème a disparu sous le mécanisme.** Je lis mes
 *   voisins en COPIE FIGÉE (`.last/<voisin>`, posée par `tour last`) ; leur écriture ne peut plus
 *   atteindre ma mesure, donc il n'y a plus rien à leur interdire. Mesuré le 2026-09-04 à 22:38 :
 *   campagne complète sur le construit de onze voisins, sans qu'aucune fenêtre ne soit ouverte.
 *
 * ⇒ ET LE COÛT DE LA GARDER S'EST PAYÉ LE JOUR MÊME : à 23:20 ma dernière campagne à fenêtre a gelé
 *   douze dépôts pour un tir REFUSÉ, pendant que quatre d'entre eux retenaient précisément le
 *   livrable qui retire ces fenêtres. *Le mécanisme bloquait son propre retrait.*
 *
 * CE QUI RESTE, ET CHAQUE PIÈCE A SA CAUSE :
 *
 *   1. LE VERROU — une seule arme à la fois. Deux poussées concurrentes n'ont aucun usage légitime.
 *   2. LE PRÉ-VOL — rien ne part avant que ce qui est à moi soit vert.
 *   3. LA POUSSÉE — le portillon, qui est le crochet, juge sur son code de sortie.
 *   4. LA PUBLICATION — et son absence condamnait le tir suivant : le garde de poussée refuse dès
 *      que mon état publié RETARDE sur ce que mes voisins peuvent lire. Mesuré le 2026-09-04 à 23:17.
 *
 * ⚠️ CE QUI N'EST PAS ICI ET QUI RESTE : `hub/tools/garde-fenetre.sh`, appelé en tête de mon crochet
 * de poussée. Je n'ouvre plus de fenêtre ; je reste arrêtable par celle d'un voisin tant qu'il en
 * ouvre. Ce garde se retirera au hub, en dernier, quand plus personne n'en ouvrira.
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
import {
  racinesSurveillees,
  derniereEcriture,
} from "./lib/releve-des-ecritures.mjs";
import { homedir, tmpdir } from "node:os";
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
 * ⛔ CE QUI DISTINGUE UNE TOUR ABSENTE D'UNE TOUR MUETTE — et le repli n'est pas le même.
 * Le chemin est celui que `hub/tools/garde-fenetre.sh` interroge, dans les mêmes termes : le dossier
 * existe = la tour existe. Je ne l'invente pas ici, je m'aligne sur le garde partagé.
 */


/** ⛔ LA TOUR S APPELLE EN TABLEAU, JAMAIS À TRAVERS UN SHELL — et ce n est pas parce qu un texte y
 *  transite aujourd hui, mais parce que rien n empêche d y en remettre demain. C est le raisonnement
 *  que j ai opposé à `--fichier` le 2026-08-25 : une parade qui déplace le texte hors du shell sans
 *  RETIRER le shell laisse le piège armé pour la phrase suivante. Formulation de runtime-codevoices,
 *  que je garde : « le remède appartient à celui qui possède le shell » — je possède le code qui
 *  compose, donc je retire le shell. */
const TOUR = join(homedir(), "dev", "bp", "hub", "tour");
/** L'atelier — le dossier qui porte tous les dépôts, et le seul endroit où un chemin sortant atterrit. */
const ATELIER = join(homedir(), "dev", "bp");

/**
 * LE REGISTRE DES CAMPAGNES VIT HORS DU DÉPÔT, ET C'EST VOULU : une durée de campagne est une
 * propriété de la MACHINE qui l'exécute, pas du code. La versionner salirait en plus l'arbre à
 * chaque tir — donc fermerait la construction de production que le tir suivant exige.
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

const hh = (d) => d.toTimeString().slice(0, 8);

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
const NAISSANCE_DE_L_ARME = new Date();
const ARME = `arme-${NAISSANCE_DE_L_ARME.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;

/**
 * L'HEURE DE NAISSANCE DE L'ARME, EN LOCAL — parce que mon critère de recouvrement la compare à une
 * LEVÉE, et que la levée de la tour est annoncée sans fuseau, donc en local.
 *
 * ⛔ SANS CETTE CONVERSION, LE CRITÈRE CRIE À CHAQUE CAMPAGNE. Le nom d'arme porte un `Z` : il est en
 * UTC. Comparés bruts, `09:11:30` précède `11:07:16`, et l'écart est CONSTANT — la naissance d'une
 * arme précéderait donc TOUJOURS la levée précédente, quelle que soit la séquence réelle. Mesuré par
 * atlas le 2026-09-01 sur deux points, jamais déduit : deux de mes avis, +2 h les deux fois.
 * ⇒ SA FORMULE, ET JE LA REPRENDS : « c'est l'instrument qui manque, pas la règle ». Le critère reste
 *   muet sur la séquence de 10:06 une fois les fuseaux harmonisés.
 * ⇒ ET LE FUSEAU DE LA LEVÉE APPARTIENT À LA TOUR : je ne le touche pas. Ce qui est à moi est de
 *   MARQUER ce que j'émets — un lecteur ne peut pas convertir ce que rien ne marque.
 */
const NAISSANCE_LOCALE = NAISSANCE_DE_L_ARME.toLocaleTimeString("fr-FR", {
  hour12: false,
});







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
      // ⛔ LA SORTIE ENTIÈRE SE GARDE SUR LE DISQUE, ET LE REFUS EN DONNE LE CHEMIN. Mon relevé applique
      // déjà cette règle à sa propre trace ; mon pré-vol, lui, JETAIT tout et n'en gardait que six
      // lignes filtrées. Mesuré le 2026-09-01 : deux rouges de suite dont le motif n'a rien reconnu, et
      // aucun moyen de savoir ce qu'ils reprochaient — l'étape était verte à chaque rejeu, donc la
      // preuve n'existait plus nulle part. ⇒ Un refus TRANSITOIRE dont on jette la sortie est un refus
      // qu'on ne peut pas diagnostiquer, jamais.
      const journal = join(tmpdir(), `kanopi-prevol-${nom.replace(/\W+/g, "-")}-${process.pid}.log`);
      try {
        writeFileSync(journal, sortie);
      } catch {
        /* un journal qu'on ne peut pas écrire ne doit pas masquer le refus lui-même */
      }
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
        // ⛔⛔ ET LE REPLI SE DÉCLARE COMME UN REPLI. Il rendait les HUIT DERNIÈRES LIGNES de la sortie,
        // nues, comme si elles étaient la cause. Mesuré le 2026-09-01 à 00:00 : une étape a rougi sans
        // qu'aucune ligne ne corresponde au motif, le repli a donc rendu la queue du journal — SIX
        // LIGNES VERTES et un « vert — morsure et bornes prouvées ». ⇒ Un rouge présenté par des verts.
        // J'ai relancé la mesure à la main pour trouver ce que mon propre outil avait sous les yeux.
        // ⇒ Une sonde tronquée rend une conclusion fausse ; une sonde tronquée QUI NE LE DIT PAS la rend
        //   confiante. Le repli dit maintenant qu'il n'a rien reconnu, et ce qu'il montre à la place.
        cause: lignes.length
          ? lignes.join("\n")
          : "    ⚠️ AUCUNE LIGNE D'ÉCHEC RECONNUE dans la sortie de cette étape — ce qui suit est la " +
            `QUEUE du journal,\n       pas la cause. LA SORTIE ENTIÈRE EST GARDÉE : ${journal}\n` +
            sortie.split("\n").slice(-8).join("\n"),
        journal,
      };
    }
  }
  return null;
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
        "   Tirer pousse et publie ; un import est une lecture, jamais une intention de tirer.\n" +
        "   Pour tirer : `node scripts/tir-arme.mjs`.",
    );
    // ⛔ LES TROIS DRAPEAUX DE RELEVÉ SONT MORTS AVEC LA FENÊTRE — 2026-09-04. `--releve-depots`,
    // `--releve-racines` et `--releve` rendaient le périmètre d'un gel : les dépôts à geler, les
    // racines que je lis chez eux, et l'inventaire lisible des deux. Mon relevé les demandait pour
    // remplir sa fenêtre ; il ne la remplit plus, et personne d'autre ne les appelait.
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
  // verdict et sans personne pour la fermer (mesuré le 2026-08-30 à 22:44). Le filet qui vivait ici
  // rendait aux gelés un verdict de nullité avant de refermer.
  // ⇒ ⛔ IL PART AVEC LA FENÊTRE — 2026-09-04 : sans gel, il n'a plus ni fenêtre à fermer ni
  //   destinataire à prévenir. Le garde qui l'éprouvait part dans le même mouvement, sinon il
  //   resterait un juge sans accusé — et un garde dont la condition disparaît devient toujours vrai.
  // ⇒ CE QUI RESTE EST LE LÂCHER DU VERROU, qui protège ma prochaine arme : sans lui, une arme tuée
  //   interdit la suivante.
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      console.error(`\n⛔ ${signal} — je m'arrête. Rien n'est poussé, rien n'est publié.`);
      lacher();
      process.exit(130);
    });
  }
}

// ⛔ PLUS DE BOUCLE D'ATTENTE, PLUS DE FENÊTRE — 2026-09-04, demande de Romain relayée par
// l'architecte : *« go qu'on en finisse ça devrait déjà être fait »*.
//
// Ce qui vivait ici : une boucle qui relevait toutes les 15 s les écritures de douze voisins,
// demandait une fenêtre à la tour, gelait tout le monde 90 s avant de partir, tirait, fermait, puis
// rendait un verdict aux gelés. Elle protégeait ma mesure contre une écriture voisine survenant
// pendant qu'elle tournait.
//
// ⇒ ELLE N'A PLUS D'OBJET : je lis mes voisins en COPIE FIGÉE (`.last/<voisin>`), posée par
//   `tour last`. Leur écriture ne peut plus atteindre ma mesure, donc il n'y a plus rien à leur
//   interdire. Mesuré le 2026-09-04 à 22:38 : campagne complète sur le construit de onze voisins,
//   sans qu'aucune fenêtre ne soit ouverte.
//
// ⇒ ⛔ ET LE COÛT DE LA GARDER SE SERAIT PAYÉ EN SILENCE : le 2026-09-04 à 23:20, ma dernière
//   campagne à fenêtre a gelé douze dépôts pour un tir REFUSÉ, pendant que quatre d'entre eux
//   retenaient précisément le livrable qui retire ces fenêtres. *Le mécanisme bloquait son propre
//   retrait.*
const debut = new Date();

// ⛔ RIEN NE PART AVANT QUE CE QUI EST À MOI SOIT VERT.
const echec = preVol();
if (echec !== null) {
  // ⛔ UN REFUS QUI PROMET SA CAUSE ET NE LA DONNE PAS ENVOIE CHERCHER AILLEURS. Mesuré le
  // 2026-08-31 : un pré-vol rouge sur le typage a écrit « la cause est écrite ci-dessus » avec RIEN
  // au-dessus. Quand l'étape n'a rien rendu, on le DIT et on nomme la commande qui la rejoue.
  const cause = String(echec.cause ?? "").trim();
  console.log(
    `${hh(new Date())} — ⛔ PRÉ-VOL ROUGE (${echec.etape}). ${echec.attribution.phrase}\n` +
      (cause ||
        `   ⚠️ ET L'ÉTAPE « ${echec.etape} » N'A RIEN RENDU : je n'ai pas sa sortie, donc je ne ` +
          `peux pas te dire ce qu'elle reproche.\n   Rejoue-la à la main pour la voir : ` +
          `\`cd packages/ui && npm run verify\`.`),
  );
  process.exit(1);
}

console.log(`DEPART ${hh(debut)}`);
const r = execFileSync(
  "bash",
  ["-c", `cd ${RACINE} && git push 2>&1; echo "SORTIE:$?"`],
  { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
);
console.log(r);
const arrivee = new Date();
console.log(`ARRIVEE : ${hh(arrivee)}`);
console.log(ceQueMonPortillonAEcrit());

const sortie = (r.match(/SORTIE:(\d+)/) ?? [, "?"])[1];
enregistrerLaCampagne(debut, arrivee, sortie, ARME);

if (sortie !== "0") process.exit(1);

// ⛔ PUBLIER FAIT PARTIE DU TIR, ET SON ABSENCE CONDAMNAIT LE TIR SUIVANT — mesuré le 2026-09-04 à
// 23:17. Le garde de poussée refuse dès que mon état publié RETARDE sur ce que mes voisins peuvent
// lire. Une poussée sans publication laisse exactement cet écart : elle réussit, et elle rend le
// prochain tir impossible. J'ai payé ce défaut d'une fenêtre ouverte sur douze dépôts pour rien.
// ⇒ Elle vient APRÈS la poussée parce qu'elle publie le commit poussé, et seulement s'il est parti.
console.log("PUBLICATION — l'état que mes voisins liront :");
const pub = execFileSync(
  "bash",
  ["-c", `node ${join(homedir(), "dev", "bp", "hub", "tour.cjs")} publie kanopi 2>&1; echo "SORTIE:$?"`],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
console.log(pub);
if (!/SORTIE:0/.test(pub)) {
  console.error(
    "⛔ POUSSÉE FAITE, PUBLICATION ÉCHOUÉE — mes voisins lisent encore l'état d'avant, et mon\n" +
      "   prochain tir sera refusé pour cette raison. Republier : `node ~/dev/bp/hub/tour.cjs publie kanopi`.",
  );
  process.exit(1);
}
}
