/**
 * OUTIL (pas un garde du portillon) — CONFRONTER LA SURFACE PUBLIÉE D'UN RUNTIME À CE QUE KANOPI
 * EN FAIT. Instance UNIQUE : elle remplace les quatre exemplaires que portaient runtime-OSC,
 * runtime-MIDI, runtime-audio et runtime-codevoices (arbitrage Romain 2026-08-13, architecte
 * [1374]).
 *
 * POURQUOI IL EXISTE, et ce n'est pas une précaution théorique : runtime-OSC a supprimé un membre
 * public en affirmant « zéro appelant vivant » après avoir scanné son SEUL dépôt. Kanopi portait
 * un appelant réel ET une copie structurelle de sa surface qui le déclarait encore : le contrôle
 * de types passait au vert pendant que l'exécution cassait. Une copie de surface est un
 * consommateur INVISIBLE au typecheck.
 *
 * POURQUOI L'OUTIL DÉMÉNAGE ICI : Kanopi est le seul consommateur des six runtimes, par lien
 * direct. Quatre exemplaires du détecteur de copies étaient le défaut qu'il combat, appliqué à
 * lui-même — ils ont dérivé deux mois durant, et une erreur de chemin s'est propagée AVEC les
 * copies. Une seule instance, chez le consommateur.
 *
 * CE QUE LE DÉMÉNAGEMENT PERMET, ET QUI N'EXISTAIT PAS AVANT : l'outil CHERCHE les copies au lieu
 * de vérifier un registre. Chez l'amont il ne pouvait que relire ce qu'on lui avait déclaré, et sa
 * propre déclaration admettait que toute copie non déclarée est CLANDESTINE — sans que rien ne la
 * trouve. Mesuré le 2026-08-13 : les quatre runtimes attestent TOUS zéro copie, donc le registre
 * était vide partout et l'outil ne mesurait plus rien. La recherche est désormais la mesure.
 *
 * ⛔ CE N'EST PAS UN GARDE DE PORTILLON, DÉLIBÉRÉMENT, et l'héberger rend la tentation naturelle.
 * Il mesure la déclaration d'un dépôt que Kanopi ne possède pas : un envoi qui devient rouge à
 * cause du retard d'un autre finit désactivé, et un garde qu'on ne peut pas verdir soi-même
 * empoisonne le portillon au lieu de le renforcer. Outil à SEUIL, lancé avant un geste.
 *
 * INVOCATION, depuis le dépôt du runtime — le répertoire courant EST le sujet :
 *     node "$KANOPI/outils/surface-aval.mjs"        (défaut de KANOPI : ~/dev/bp/kanopi)
 * Aucun paquet à installer : un runtime qui dépendrait de Kanopi inverserait le sens de la flèche
 * — Kanopi les consomme, pas l'inverse — et créerait un cycle. Une invocation par chemin ne crée
 * aucune arête de dépendance.
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { membresPublics, corpsDuSymbole } from './lib/surface.mjs';

/** Le dépôt MESURÉ : celui d'où l'outil est lancé. Jamais un chemin tenu à jour des deux côtés. */
const AMONT = process.cwd();
/** Le CONSOMMATEUR : le dépôt qui héberge cet outil. Déduit du fichier, jamais écrit en dur. */
const KANOPI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * SITE DE DÉCLARATION : `surface-aval.json`, à la RACINE du dépôt amont. Fichier de DONNÉES et non
 * constante de code — Atlas indexe les copies déclarées de toute la flotte, et un JSON à chemin
 * fixe se lit sans exécuter le script de personne.
 */
const DÉCLARATION = path.join(AMONT, 'surface-aval.json');

/** Là où Kanopi pourrait recopier une surface : sa source applicative. */
const SOURCE_CONSOMMATEUR = path.join(KANOPI, 'packages/ui/src');

const erreur = (...l) => l.forEach((x) => console.error(x));

// ── LA DÉCLARATION DE L'AMONT ───────────────────────────────────────────────────────────────
let décl;
try {
  décl = JSON.parse(await readFile(DÉCLARATION, 'utf8'));
} catch {
  erreur(
    `[surface-aval] ✗ DÉCLARATION ABSENTE : ${DÉCLARATION}`,
    '              Sans elle je ne sais pas quelle surface est la tienne, et je REFUSE DE DEVINER.',
    '              Un repli en dur désignerait la surface de celui qui a écrit cet outil, pas la',
    '              tienne : c\'est exactement ce qui a fait dériver les quatre exemplaires.',
    '',
    '              À écrire à la racine de ton dépôt, dans `surface-aval.json` :',
    '                  { "surface": { "fichier": "src/<ton-fichier>", "symbole": "<TaClasse>" },',
    '                    "aucune_copie_de_surface_connue": true, "copies": [] }'
  );
  process.exit(1);
}

if (!décl.surface?.fichier || !décl.surface?.symbole) {
  erreur(
    '[surface-aval] ✗ CIBLE NON DÉCLARÉE : `surface.fichier` ET `surface.symbole` sont requis.',
    '              Je REFUSE DE DEVINER — pas de repli, pas de « symbole le plus probable ».'
  );
  process.exit(1);
}

const nomAmont = path.basename(AMONT);
const fichierSurface = path.resolve(AMONT, décl.surface.fichier);
const symbole = décl.surface.symbole;

let mienne;
try {
  mienne = membresPublics(await readFile(fichierSurface, 'utf8'), symbole);
} catch {
  erreur(`[surface-aval] ✗ SURFACE ILLISIBLE : ${fichierSurface} — je ne mesure rien.`);
  process.exit(1);
}
if (mienne.size === 0) {
  erreur(
    `[surface-aval] ✗ TÉMOIN MUET : aucun membre lu dans « ${symbole} » de ${décl.surface.fichier}.`,
    '              « Rien à signaler » parce qu\'on n\'a rien lu est le mensonge que cet outil doit empêcher.'
  );
  process.exit(1);
}

console.log(`[surface-aval] ${nomAmont} :: ${symbole} — ${mienne.size} membre(s) public(s) lu(s) :`);
console.log(`               ${[...mienne].sort().join(', ')}`);

// ── LES FICHIERS DU CONSOMMATEUR ────────────────────────────────────────────────────────────
/** Toute la source de Kanopi, à plat. Ce que l'outil OUVRE réellement — il en rend le compte. */
async function fichiersSource(racine) {
  const out = [];
  const descendre = async (d) => {
    let entrées;
    try {
      entrées = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entrées) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') await descendre(p);
      } else if (/\.(ts|d\.ts|svelte|js)$/.test(e.name)) out.push(p);
    }
  };
  await descendre(racine);
  return out;
}

const fichiers = await fichiersSource(SOURCE_CONSOMMATEUR);
if (fichiers.length === 0) {
  erreur(
    `[surface-aval] ✗ AUCUN FICHIER LU chez le consommateur (${SOURCE_CONSOMMATEUR}).`,
    '              Un parcours cassé ne trouve jamais rien et rendrait le même vert qu\'une conformité.'
  );
  process.exit(1);
}

let divergences = 0;

// ── 1) LES COPIES : DÉCLARÉES *ET* CLANDESTINES ─────────────────────────────────────────────
// La déclaration reste un filet — mais elle n'est plus la mesure. On cherche le symbole de
// l'amont RE-DÉCLARÉ dans la source du consommateur, quel que soit le fichier qui le porte, et
// qu'il ait été déclaré ou non. Une copie clandestine est celle que personne n'a inscrite : elle
// était strictement invisible tant que l'outil vivait chez l'amont.
const déclarées = new Set(
  (Array.isArray(décl.copies) ? décl.copies : []).map((c) => path.resolve(KANOPI, c.fichier))
);

const trouvées = [];
for (const f of fichiers) {
  const texte = await readFile(f, 'utf8');
  // Une RE-DÉCLARATION, pas un simple import : `class X` ou `interface X` dans mon propre code.
  if (!new RegExp(`\\b(class|interface)\\s+${symbole}\\b`).test(texte)) continue;
  const bloc = corpsDuSymbole(texte, symbole);
  if (bloc === null) continue;
  trouvées.push({ fichier: f, bloc, clandestine: !déclarées.has(f) });
}

// Une copie DÉCLARÉE que la recherche ne retrouve pas est une trace périmée — on le dit.
for (const d of déclarées) {
  if (!trouvées.some((t) => t.fichier === d)) {
    erreur(
      `[surface-aval] ✗ COPIE DÉCLARÉE INTROUVABLE : ${path.relative(KANOPI, d)}`,
      '              Trace périmée, ou fichier réorganisé. Je ne peux RIEN affirmer sur elle.'
    );
    divergences++;
  }
}

const BÉNINS = new Set(['constructor', 'map', 'send']);
for (const { fichier, bloc, clandestine } of trouvées) {
  const relatif = path.relative(KANOPI, fichier);
  const membres = new Set([
    ...[...bloc.matchAll(/^\s{2}(?:readonly\s+)?([a-zA-Z][\w]*)\??\s*\(/gm)].map((m) => m[1]),
    ...[...bloc.matchAll(/^\s{2}(?:readonly\s+)?([a-zA-Z][\w]*)\??\s*:/gm)].map((m) => m[1])
  ]);
  const fantômes = [...membres].filter((d) => !mienne.has(d) && !BÉNINS.has(d));
  const manquants = [...mienne].filter((m) => !membres.has(m) && !m.startsWith('#'));

  divergences++;
  erreur(
    '',
    `[surface-aval] ✗ COPIE ${clandestine ? 'CLANDESTINE' : 'DÉCLARÉE'} de « ${symbole} » chez kanopi :`,
    `  fichier : ${relatif}`
  );
  if (clandestine) {
    erreur(
      '  Personne ne l\'a déclarée. Elle était invisible tant que cet outil vivait chez l\'amont.'
    );
  }
  if (fantômes.length) {
    erreur(`  · DÉCLARE ce que tu n'as plus : ${fantômes.join(', ')} → typecheck vert, exécution cassée.`);
  }
  if (manquants.length) {
    erreur(`  · IGNORE ce que tu offres : ${manquants.join(', ')} → inutilisable depuis cette copie.`);
  }
  if (!fantômes.length && !manquants.length) {
    erreur('  · alignée sur ta surface AUJOURD\'HUI — mais une copie alignée dérive dès ton prochain geste.');
  }
}

// ── 2) LE BON CAS, ATTESTÉ ET COMPTÉ ────────────────────────────────────────────────────────
// « Aucune copie » et « je n'ai pas regardé » se ressemblent : seule une attestation CHIFFRÉE
// les distingue. On compte les imports single-source — le consommateur qui importe la vérité.
// ⛔ LE NOM DU PAQUET SE LIT DANS SON MANIFESTE, JAMAIS DANS LE NOM DE DOSSIER. Mesuré à la
// première exécution : le dossier est `runtime-OSC`, le paquet est `runtime-osc`. En déduisant
// l'un de l'autre, l'outil comptait ZÉRO import et attestait « kanopi ne te consomme pas » — faux,
// il y en a trois. C'est la casse exacte qui avait déjà fait compter un dépôt ABSENT lors de la
// propagation des copies : une attestation qui sous-compte est pire qu'un silence, elle affirme.
let nomPaquet = null;
try {
  nomPaquet = JSON.parse(await readFile(path.join(AMONT, 'package.json'), 'utf8')).name ?? null;
} catch {
  /* pas de manifeste : on le dit plus bas plutôt que de deviner */
}
if (!nomPaquet) {
  erreur(
    `[surface-aval] ✗ MANIFESTE ILLISIBLE : ${path.join(AMONT, 'package.json')} — sans le nom du`,
    '              paquet je ne peux pas compter les imports, et je REFUSE d\'attester sur un nom deviné.'
  );
  process.exit(1);
}
const spécificateurs = new Set([nomPaquet]);
let importsVivants = 0;
const porteurs = new Set();
for (const f of fichiers) {
  const texte = await readFile(f, 'utf8');
  for (const spéc of spécificateurs) {
    const re = new RegExp(`from\\s+['"]${spéc}(/[^'"]*)?['"]`, 'g');
    const n = [...texte.matchAll(re)].length;
    if (n) {
      importsVivants += n;
      porteurs.add(path.relative(KANOPI, f));
    }
  }
}

console.log(
  `[surface-aval] kanopi : ${fichiers.length} fichier(s) source lu(s), ` +
    `${trouvées.length} copie(s) de « ${symbole} », ${importsVivants} import(s) single-source ` +
    `dans ${porteurs.size} fichier(s).`
);

if (trouvées.length === 0) {
  if (importsVivants > 0) {
    console.log(
      `[surface-aval] ✓ AUCUNE COPIE, ATTESTÉ SUR ${fichiers.length} FICHIERS LUS — kanopi importe ta ` +
        'surface publiée, il ne la recopie pas. C\'est le bon cas, et il est mesuré, pas supposé.'
    );
  } else {
    console.log(
      `[surface-aval] ✓ aucune copie sur ${fichiers.length} fichier(s) lu(s) — et AUCUN import non plus : ` +
        'kanopi ne te consomme pas depuis sa source applicative. Rien à casser ici, rien à en conclure ailleurs.'
    );
  }
}

// ── 3) LA SECTION `outillage` A PERDU SON SUJET ─────────────────────────────────────────────
// Elle traquait les copies de CET outil. Avec une instance unique elle n'a plus d'objet : elle
// sort avec les quatre exemplaires, dans le même mouvement, jamais après.
if (décl.outillage) {
  console.log(
    '[surface-aval] ⚠ ta déclaration porte encore une section `outillage` : elle traquait les copies ' +
      'de cet outil. Il n\'y en a plus qu\'une, chez kanopi — cette section est à retirer avec ton exemplaire.'
  );
}

if (divergences > 0) {
  erreur('', `[surface-aval] ✗ ${divergences} divergence(s) — ne déclare pas « zéro appelant ».`);
  process.exit(1);
}
process.exit(0);
