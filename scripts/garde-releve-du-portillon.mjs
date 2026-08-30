#!/usr/bin/env node
// LE RELEVÉ DE MON PORTILLON DOIT DÉCRIRE LE PORTILLON D'AUJOURD'HUI — sinon le portillon échoue.
//
// ⛔ CE QU'IL EMPÊCHE. Ma campagne annonce à douze dépôts gelés ce que mon portillon leur a écrit
// dessous, en renvoyant au dernier relevé daté. Un relevé pris sur un AUTRE portillon décrirait des
// écritures qui ne sont plus les miennes — et il le ferait EN VERT, avec l'autorité d'un chiffre.
// ⇒ Décision de méthode de l'architecte, 2026-08-30 : la trace sort de la fenêtre, ET elle est
//   obligatoire après tout changement de portillon. « Le déclencheur n'est pas l'horloge, c'est la
//   frappe. » Ce garde est ce qui rend « obligatoire » autre chose qu'une intention.
//
// ⛔ ET IL ÉCHOUE, IL N'AVERTIT PAS : un garde qui peut se sauter ne protège de rien. Le geste qui le
// lève est `node scripts/trace-du-portillon.mjs`, hors fenêtre.

import {
  empreinteDuPortillon,
  lireReleve,
  releveÀJour,
  CHEMIN_DU_RELEVE,
} from "./lib/releve-du-portillon.mjs";

const { empreinte, pieces, bancs } = empreinteDuPortillon();
const releve = lireReleve();
const { bon, raison } = releveÀJour(releve, empreinte);

// ⛔ UN GARDE COMPTE CE QU'IL A EXAMINÉ ET REFUSE D'AVOIR EXAMINÉ ZÉRO : une empreinte calculée sur
// aucune pièce et aucun banc vaudrait la même chose pour tous les portillons du monde.
if (pieces === 0 || bancs === 0) {
  console.error(
    `⛔ empreinte calculée sur ${pieces} pièce(s) et ${bancs} banc(s) — elle ne distingue rien.\n` +
      "   La définition du portillon a bougé de place, ou le relevé des bancs ne trouve plus rien.",
  );
  process.exit(1);
}

if (!bon) {
  console.error(
    `⛔ LE RELEVÉ DE MON PORTILLON NE LE DÉCRIT PLUS — ${raison}\n` +
      `   Ce que ma campagne annonce aux gelés viendrait d'une mesure prise sur un autre portillon.\n` +
      `   ⇒ HORS FENÊTRE : node scripts/trace-du-portillon.mjs\n` +
      `   (relevé : ${CHEMIN_DU_RELEVE} · empreinte du jour : ${empreinte}, ${pieces} pièce(s), ${bancs} banc(s))`,
  );
  process.exit(1);
}

const m = releve.mesure;
console.log(
  `── relevé du portillon @${empreinte} — ${raison}\n` +
    (m
      ? `  ✓ ${m.cheminsSousMonArbre} chemin(s) écrits sous mon arbre : ` +
        Object.entries(m.parRacineDeTete)
          .map(([k, n]) => `${k} (${n})`)
          .join(" · ") +
        (m.relatifsHorsGit
          ? `\n  ⚠️ ${m.relatifsHorsGit} chemin(s) relatif(s) non résolus hors de .git/`
          : "")
      : `  ⚠️ NON MESURÉ — ${releve.pourquoi ?? "sans raison notée"}`),
);
