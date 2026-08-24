#!/usr/bin/env node
// ⛔ LA PIÈCE CONSOMMATEUR — JE DÉCLARE L'ÉTAT QUE JE PRENDS, ET CE GARDE REFUSE DE SE TAIRE.
//
// Arbitrage de l'architecte du 2026-08-24 : « UN CONSOMMATEUR DÉCLARE L'ÉTAT QU'IL A PRIS.
// Épingler est une façon de le déclarer — la bonne quand on veut la STABILITÉ. Nommer ce qu'on a
// LU en est une autre — la bonne quand on veut suivre le DERNIER. ⇒ Ce qui est interdit dans les
// deux cas, c'est de NE RIEN DIRE. »
//
// ⛔ LE TROU QU'IL FERME, MESURÉ TROIS FOIS LE 2026-08-24 : « le CONTENU d'un paquet est immuable ;
// le LIEN qui le désigne ne l'est pas. » runtime-osc a publié ONZE fois dans la journée, cinq en
// vingt-huit minutes, et `.paquets/runtime-osc` a suivi chacune — pendant une campagne de quinze
// minutes qui a fini par mourir dessus. Tant qu'un consommateur suit une référence mouvante sans
// déclarer l'état pris, il change de paquet sans le savoir, même quand chaque paquet est immuable.
//
// ⛔ CE QU'IL FAIT ÉCHOUER, ET CE QU'IL SE CONTENTE DE DIRE — la distinction est le tout :
//
//   ÉCHOUE   un voisin LIÉ absent de la déclaration                — le silence est l'interdit
//   ÉCHOUE   une entrée DÉCLARÉE dont le voisin n'est plus lié     — le verrou tient des deux côtés
//   ÉCHOUE   un état NON NOMMABLE                                  — il m'arrête AVANT que je lise
//   ÉCHOUE   « épinglé » dont le lien vise une référence MOUVANTE  — l'épinglage est un ornement
//   ÉCHOUE   « épinglé » qui résout une AUTRE empreinte            — j'ai basculé sans le vouloir
//   DIT      « épinglé » en retard sur le dernier publié           — le prix de la stabilité, choisi
//
// ⛔ ET IL DONNE LA COMMANDE, PAS UNE SOMME. Pièce de runtime-MIDI, versée au patron le même jour :
// son empreinte DÉTECTE une dérive et ne permet à personne de RETROUVER l'état — « d'une somme de
// contrôle on ne tire aucune commande ». Chaque échec nomme donc `npm run repointer`.
//
// ⛔ SON MORDANT SE PROUVE ICI MÊME, PAR INJECTION, SUR LES CINQ BRANCHES. Un garde qu'on n'a pas
// vu mordre est une hypothèse — et les cas sont ÉCRITS À LA MAIN, jamais dérivés du relevé réel :
// un juge dérivé de l'accusé confirme ce qu'il devait trouver. Le contrôle POSITIF compte autant :
// un garde qui refuserait tout serait vert sur chaque injection et n'aurait rien prouvé.

import {
  etatPrisReel,
  declarationDeLEtatPris,
  confronter,
} from "./lib/etat-pris.mjs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const declaration = declarationDeLEtatPris(RACINE);
const reel = etatPrisReel(RACINE);

// ⛔ UN GARDE COMPTE CE QU'IL A EXAMINÉ ET REFUSE D'AVOIR EXAMINÉ ZÉRO. Un atelier où la
// résolution des liens échoue rendrait « zéro voisin, zéro écart » — un vert qui dit le contraire
// de ce qu'il mesure. Onze liens le 2026-08-24 ; le plancher borne la panne, pas le chantier.
if (reel.length < 8) {
  console.error(
    `[état-pris] RELEVÉ TROP MAIGRE POUR PROUVER QUOI QUE CE SOIT — ${reel.length} voisin(s) ` +
      `lié(s) relevé(s). La mesure a raté ; elle n'a pas trouvé zéro voisin.`,
  );
  process.exit(1);
}
if (Object.keys(declaration).length === 0) {
  console.error(
    "[état-pris] AUCUNE DÉCLARATION — « etat-pris » est vide dans " +
      "scripts/lib/regimes-des-voisins.json. Un consommateur qui ne déclare rien n'est pas " +
      "conforme par défaut, il est MUET.",
  );
  process.exit(1);
}

// ─── L'ÉPREUVE DU MORDANT, avant le verdict : un garde se prouve, puis il juge. ───────────────
const TEMOIN = {
  nom: "voisin-temoin",
  voie: "paquet",
  etat: "aaaaaaa",
  nommable: true,
  viseUneReferenceMouvante: false,
  cibleEcrite: "/tmp/paquets/voisin-temoin-aaaaaaa",
  dernierPublie: "aaaaaaa",
  chemin: "/tmp/paquets/voisin-temoin-aaaaaaa",
};
const DECLARE = { "voisin-temoin": { etage: "épinglé", empreinte: "aaaaaaa", le: "2026-08-24" } };

const INJECTIONS = [
  ["le cas CONFORME — un épinglage tenu", DECLARE, [TEMOIN], false],
  ["un voisin lié et DÉCLARÉ NULLE PART", {}, [TEMOIN], true],
  [
    "une entrée déclarée dont le voisin N'EST PLUS LIÉ",
    DECLARE,
    [{ ...TEMOIN, nom: "un-autre" }],
    true,
  ],
  [
    "un état NON NOMMABLE",
    { "voisin-temoin": { etage: "nommé", le: "2026-08-24" } },
    [{ ...TEMOIN, voie: "source", etat: null, nommable: false }],
    true,
  ],
  [
    "un épinglage qui vise une RÉFÉRENCE MOUVANTE",
    DECLARE,
    [{ ...TEMOIN, viseUneReferenceMouvante: true, cibleEcrite: "/tmp/paquets/voisin-temoin" }],
    true,
  ],
  [
    "un épinglage qui résout une AUTRE empreinte",
    DECLARE,
    [{ ...TEMOIN, etat: "bbbbbbb" }],
    true,
  ],
  [
    "un étage qui n'existe pas",
    { "voisin-temoin": { etage: "à-peu-près", le: "2026-08-24" } },
    [TEMOIN],
    true,
  ],
  [
    "« rien-pris » : un zéro DÉCLARÉ ne se compte pas comme un muet",
    { "voisin-temoin": { etage: "rien-pris", le: "2026-08-24" } },
    [{ ...TEMOIN, nommable: false, etat: null }],
    false,
  ],
];

const morsuresManquantes = [];
for (const [quoi, decl, etat, doitMordre] of INJECTIONS) {
  const { echecs } = confronter(decl, etat);
  if (echecs.length > 0 !== doitMordre)
    morsuresManquantes.push(
      `${quoi} : la confrontation ${doitMordre ? "NE MORD PAS" : "MORD À TORT"}.`,
    );
}
if (morsuresManquantes.length) {
  console.error("[état-pris] LE GARDE NE MORD PLUS COMME IL LE DIT :");
  for (const m of morsuresManquantes) console.error(`  • ${m}`);
  process.exit(1);
}

// ─── LE VERDICT, sur le réel. ─────────────────────────────────────────────────────────────────
const { echecs, rapport, examines } = confronter(declaration, reel);
if (examines === 0)
  echecs.push(
    "aucun voisin déclaré n'a été examiné — la mesure a raté, elle n'a pas trouvé zéro écart.",
  );

console.log("• l'état que je prends chez chaque voisin, DÉCLARÉ :");
for (const l of rapport) console.log(`    ${l}`);

if (echecs.length) {
  console.error("✗ garde état-pris — je prends un état que je n'ai pas déclaré :");
  for (const e of echecs) console.error(`  • ${e}`);
  console.error(
    "\nRappel (architecte, 2026-08-24) : épingler ou nommer sont deux façons de déclarer. " +
      "Ce qui est interdit, c'est de ne rien dire.",
  );
  process.exit(1);
}

console.log(
  `✓ état-pris — ${examines} voisin(s) déclaré(s) et confronté(s) sur ${reel.length} lié(s) ; ` +
    `${INJECTIONS.length} injections, mordant prouvé dans les deux sens.`,
);
