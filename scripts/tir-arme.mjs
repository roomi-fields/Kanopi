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
  readdirSync,
  statSync,
  writeFileSync,
  unlinkSync,
  readFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  voisinsLies,
  racinesExposees,
  raisonDuRefus,
} from "./lib/voisins-lies.mjs";

const RACINE = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

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

/** Ajoute une campagne au registre — c'est ce qui rend la fenêtre suivante juste. */
function enregistrerLaCampagne(depart, arrivee, sortie) {
  const minutes = (arrivee.getTime() - depart.getTime()) / 60_000;
  const brut = existsSync(REGISTRE)
    ? JSON.parse(readFileSync(REGISTRE, "utf8") || "[]")
    : [];
  brut.push({
    le: arrivee.toISOString(),
    minutes: Number(minutes.toFixed(2)),
    sortie,
  });
  mkdirSync(join(homedir(), ".local", "state", "kanopi"), { recursive: true });
  writeFileSync(REGISTRE, JSON.stringify(brut, null, 1));
  console.log(
    `campagne enregistree : ${minutes.toFixed(2)} min (sortie ${sortie})`,
  );
}

const FENETRE_MIN = fenetreDeriveeMin();

const PAS_MS = 15_000;
const PLAFOND_MS = 60 * 60_000;

const hh = (d) => d.toTimeString().slice(0, 8);

/** Chaque fichier sous un dossier. Un lien symbolique ne se suit pas : il désignerait un arbre qui
 *  n'appartient pas au voisin. Même règle que le relevé d'empreinte. */
function sousArbre(base, out = []) {
  for (const e of readdirSync(base, { withFileTypes: true })) {
    const p = join(base, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) sousArbre(p, out);
    else out.push(p);
  }
  return out;
}

/** La dernière écriture de chaque voisin sous ce qu'il EXPOSE, et le fichier concerné. */
function dernieresEcritures() {
  const par = new Map();
  for (const v of voisinsLies(RACINE)) {
    let quand = 0;
    let quoi = null;
    for (const r of racinesExposees(v.depot) ?? []) {
      const base = join(v.chemin, r);
      let fichiers;
      try {
        fichiers = statSync(base).isDirectory() ? sousArbre(base) : [base];
      } catch {
        continue;
      }
      for (const f of fichiers) {
        const st = statSync(f);
        if (st.mtimeMs > quand) {
          quand = st.mtimeMs;
          quoi = f.replace(v.chemin + "/", "");
        }
      }
    }
    par.set(v.depot.split("/").pop(), { quand, quoi });
  }
  return par;
}

/** Ce qui empêche la fenêtre de s'ouvrir, en clair. Vide = elle est ouverte. */
function ceQuiFerme(ecritures) {
  const seuil = Date.now() - CALME_MS;
  const raisons = [];
  // ⛔ L'ARBRE SALE RESTE ICI, ET CE N'EST PAS UN DOUBLON DE LA TOUR. Elle refuse d'OUVRIR sur un
  // état non publié ; moi je refuse de CONSTRUIRE — mon greffon de production s'arrête sur du non
  // enregistré qui entre dans mon paquet. Les deux se recouvrent aujourd'hui et ne disent pas la
  // même chose : la sienne protège la mesure, la mienne protège l'artefact.
  if (raisonDuRefus(voisinsLies(RACINE))) {
    raisons.push("un arbre SALE ferme ma construction de production");
  }
  for (const [nom, { quand, quoi }] of ecritures) {
    if (quand > seuil)
      raisons.push(`${nom} a écrit à ${hh(new Date(quand))} (${quoi})`);
  }
  return raisons;
}

/**
 * LA FENÊTRE SE DEMANDE À LA TOUR, ELLE NE SE BRICOLE PLUS ICI.
 *
 * ⛔ CE BLOC ENVOYAIT UN COURRIER ÉCRIT À LA MAIN. La tour porte depuis le 2026-08-20 un mécanisme
 * qui fait davantage et qui est PARTAGÉ : `tour fenetre ouvrir` prévient chaque dépôt gelé, REFUSE
 * l'écriture de leur backlog pendant la fenêtre, et expire tout seul. Garder ma version en aurait
 * fait une voie parallèle — deux mécanismes pour un besoin, qui divergent au premier changement.
 *
 * ⛔ ET L'OUTIL PORTE DÉJÀ MA SECONDE CONDITION, ce qui la retire d'ici : il REFUSE d'ouvrir quand un
 * dépôt gelé porte un état que personne n'a publié, parce que je lis le DISQUE. Mesuré à l'ouverture :
 * « FENÊTRE REFUSÉE — bpscript, 2 modifié(s) ». Ce que je garde, c'est la condition qu'il n'a pas :
 * le CALME, c'est-à-dire aucune écriture depuis un délai — un arbre propre ne dit rien de ce qui
 * s'écrira dans les quinze minutes suivantes.
 *
 * Rend la liste des dépôts gelés, ou `null` si la tour a refusé — auquel cas on retourne attendre.
 */
function demanderLaFenetre(ecritures) {
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
  const racinesLues = [
    ...new Set(
      voisinsLies(RACINE).flatMap((v) => [...(racinesExposees(v.depot) ?? [])]),
    ),
  ].sort();

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
  const motif =
    "campagne de portillon — NE FAITES BASCULER AUCUN FICHIER SOUS LES RACINES QUE JE LIS, nommées " +
    "dans cet avis. Le geste ne compte pas, le chemin compte : chez certains d'entre vous pousser " +
    "PUBLIE et une vérification lancée à la main CONSTRUIT, chez d'autres le commit ne touche rien. " +
    "Vous seul savez lequel de vos gestes bascule ces chemins ; le reste de votre arbre est libre. " +
    "⚠️ CETTE LISTE EST L'UNION DES RACINES DES DESTINATAIRES, la tour n'en portant qu'une par " +
    "fenêtre : chez vous je ne relève QUE celles que VOTRE manifeste expose. Une racine de cette " +
    "liste qui n'existe pas chez vous ne vous concerne pas, et je ne l'y lis pas. " +
    "⛔ CE QUI FERME CETTE FENÊTRE EST MON MESSAGE DE FIN, JAMAIS L'HEURE : l'heure annoncée est un " +
    "PLANCHER calculé sur une constante, et mes campagnes la dépassent déjà de plusieurs minutes. " +
    "Attendez le verdict que je vous enverrai à l'arrivée ; une attente calée sur l'horloge écrite " +
    "vous fera écrire pendant que je mesure encore";
  try {
    execFileSync(
      "bash",
      [
        "-c",
        `BP_AGENT=kanopi ~/dev/bp/hub/tour fenetre ouvrir kanopi --minutes ${FENETRE_MIN} ` +
          `--lit disque --depots ${actifs.join(",")} --racines ${racinesLues.join(",")} ` +
          `--motif ${JSON.stringify(motif)}`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
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
  const ouvertes = execFileSync(
    "bash",
    ["-c", "BP_AGENT=kanopi ~/dev/bp/hub/tour fenetre"],
    { encoding: "utf8" },
  );
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
function rendreLeVerdict(destinataires, depart, arrivee, sortie, sortiePush) {
  if (destinataires.length === 0) return;
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
  const texte =
    `VERDICT DE MA CAMPAGNE — départ ${hh(depart)}, arrivée ${hh(arrivee)}.\n\n` +
    `    CODE DE SORTIE DU CROCHET : ${sortie}\n` +
    `    ${pousse}${bascule}\n\n` +
    `Votre gel a tenu ou non, et c'est ce code qui le dit. Ce message part du code qui tire, pas de ma\n` +
    `mémoire : un gel dont le verdict ne revient jamais s'use.\n`;
  const fichier = `/tmp/kanopi-verdict-${depart.getTime()}.txt`;
  writeFileSync(fichier, texte, "utf8");
  for (const dest of destinataires) {
    try {
      execFileSync(
        "bash",
        [
          "-c",
          `BP_AGENT=kanopi ~/dev/bp/hub/tour note ${dest} --fichier ${fichier}`,
        ],
        { encoding: "utf8" },
      );
    } catch (e) {
      console.log(
        `  verdict NON transmis a ${dest} : ${String(e.message).split("\n")[0]}`,
      );
    }
  }
  try {
    unlinkSync(fichier);
  } catch {
    /* déjà disparu — sans effet, le verdict est parti */
  }
  console.log(`VERDICT RENDU a ${destinataires.length} depot(s)`);
}

/** La fenêtre se referme dès le verdict rendu — elle expire seule, mais la laisser courir gèle des
 *  voisins pour rien. */
function fermerLaFenetre() {
  try {
    execFileSync(
      "bash",
      ["-c", "BP_AGENT=kanopi ~/dev/bp/hub/tour fenetre fermer kanopi"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch {
    /* la fenêtre a expiré d'elle-même — rien à fermer, et c'est le cas nominal après 20 minutes */
  }
}

const debut = Date.now();
let tours = 0;
let demandeeA = null;
let geles = [];
let ouverteA = null;

for (;;) {
  const ecritures = dernieresEcritures();
  const ferme = ceQuiFerme(ecritures);

  if (ferme.length > 0) {
    // ⛔ UNE ECRITURE APRES LA DEMANDE ANNULE LA GRACE. Sans ça, la demande deviendrait une
    // formalite : on l'envoie, le voisin frappe, et on tire quand meme.
    if (demandeeA !== null) {
      console.log(
        `${hh(new Date())} — demande annulee, la fenetre s est refermee : ${ferme.join(", ")}`,
      );
      demandeeA = null;
    } else if (tours % 8 === 0) {
      console.log(`${hh(new Date())} — j attends : ${ferme.join(", ")}`);
    }
  } else if (demandeeA === null) {
    const depart = new Date(Date.now() + GRACE_MS);
    // ⛔ LA FIN DE FENÊTRE SE COMPTE DEPUIS L'OUVERTURE, PAS DEPUIS LE DÉPART. Mesuré le 2026-08-21 :
    // j'annonçais 09:07 pendant que la tour affichait 09:05 pour la même fenêtre — deux heures pour
    // une seule chose, et la mienne était fausse de la durée de la grâce. Ce n'est pas cosmétique :
    // le voisin gelé se tient tranquille jusqu'à l'heure que je lui donne, donc je lui faisais
    // perdre ce que j'ajoutais.
    const arrivee = new Date(Date.now() + FENETRE_MIN * 60_000);
    const prevenus = demanderLaFenetre(ecritures);
    if (prevenus === null) {
      // La tour a refusé : on ne tire pas, et on ne réessaie pas en boucle serrée.
      tours++;
      execFileSync("sleep", [String(PAS_MS / 1000)]);
      continue;
    }
    demandeeA = Date.now();
    geles = prevenus;
    ouverteA = new Date();
    console.log(
      `${hh(new Date())} — FENETRE OUVERTE a la tour, gel de ${prevenus.join(", ") || "personne (aucun voisin en chantier)"}` +
        ` : depart ${hh(depart)}, arrivee ${hh(arrivee)}`,
    );
  } else if (Date.now() - demandeeA >= GRACE_MS) {
    const depart = new Date();
    console.log(`DEPART ${hh(depart)} — apres ${tours} tour(s) d attente`);
    const r = execFileSync(
      "bash",
      ["-c", `cd ${RACINE} && git push 2>&1; echo "SORTIE:$?"`],
      {
        encoding: "utf8",
      },
    );
    console.log(r);
    const arrivee = new Date();
    console.log(`ARRIVEE : ${hh(arrivee)}`);
    const sortie = (r.match(/SORTIE:(\d+)/) ?? [, "?"])[1];
    // ⛔ ENREGISTRER AVANT DE RENDRE LE VERDICT : la durée d'une campagne ne se mesure qu'une
    // fois, et un verdict qui échoue ne doit pas emporter la mesure avec lui.
    enregistrerLaCampagne(ouverteA ?? depart, arrivee, sortie);
    rendreLeVerdict(geles, ouverteA ?? depart, arrivee, sortie, r);
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
