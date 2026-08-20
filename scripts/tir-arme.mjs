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
import { readdirSync, statSync, writeFileSync, unlinkSync } from "node:fs";
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
/** La fenêtre annoncée, arbitrage de l'architecte du 2026-08-20. */
const FENETRE_MIN = 20;
/** Un voisin qui n'a pas écrit depuis ça ne dort pas : il n'est simplement pas en chantier. */
const EN_CHANTIER_MS = 2 * 60 * 60_000;

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
  if (raisonDuRefus(voisinsLies(RACINE))) {
    raisons.push("un arbre SALE ferme ma construction de production");
  }
  for (const [nom, { quand, quoi }] of ecritures) {
    if (quand > seuil)
      raisons.push(`${nom} a écrit à ${hh(new Date(quand))} (${quoi})`);
  }
  return raisons;
}

/** La DEMANDE de fenêtre, adressée aux seuls voisins en chantier. */
function demanderLaFenetre(ecritures, depart, arrivee) {
  const actifs = [...ecritures]
    .filter(([, { quand }]) => Date.now() - quand < EN_CHANTIER_MS)
    .map(([nom]) => nom.toLowerCase());
  if (actifs.length === 0) return [];

  const fichier = `/tmp/kanopi-demande-fenetre-${depart.getTime()}.txt`;
  writeFileSync(
    fichier,
    `DEMANDE DE FENETRE DE MESURE — ${FENETRE_MIN} MINUTES, de ${hh(depart)} a ${hh(arrivee)}.\n\n` +
      `Je tire une campagne de portillon. Elle dure 15 a 16 minutes, dont 13 d ecran.\n\n` +
      `CE QUE JE DEMANDE : aucune ecriture sous tes racines exposees pendant cette fenetre.\n` +
      `Une seule suffit a invalider le verdict — mon garde compare l empreinte de tes portes au\n` +
      `depart et a l arrivee, et un resultat qui porte sur deux etats ne porte sur aucun. Ce n est\n` +
      `pas une accusation : c est quinze minutes de machine qui ne prouvent plus rien.\n\n` +
      `⛔ CE QUI COMPTE EST L ENREGISTREMENT D UN FICHIER, JAMAIS LA NATURE DU GESTE. Regenerer,\n` +
      `coder, ou eprouver un garde par injection — trois gestes, un seul effet chez moi. Une\n` +
      `injection ecrit DEUX fois et rend un arbre propre au premier octet.\n\n` +
      `Ce message part du code qui tire, pas de ma vigilance. Je te rendrai l heure d arrivee et le\n` +
      `code de sortie, vert ou rouge.\n`,
    "utf8",
  );
  for (const dest of actifs) {
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
        `  demande NON transmise a ${dest} : ${String(e.message).split("\n")[0]}`,
      );
    }
  }
  try {
    unlinkSync(fichier);
  } catch {
    /* le fichier temporaire a déjà disparu — sans effet sur la demande, qui est partie */
  }
  return actifs;
}

const debut = Date.now();
let tours = 0;
let demandeeA = null;

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
    const arrivee = new Date(depart.getTime() + FENETRE_MIN * 60_000);
    const prevenus = demanderLaFenetre(ecritures, depart, arrivee);
    demandeeA = Date.now();
    console.log(
      `${hh(new Date())} — FENETRE DEMANDEE a ${prevenus.join(", ") || "personne (aucun voisin en chantier)"}` +
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
    console.log(`ARRIVEE : ${hh(new Date())}`);
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
