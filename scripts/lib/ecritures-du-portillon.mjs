// CE QUE MON PORTILLON ÉCRIT DANS MON PROPRE ARBRE — lu sur la TRACE DES OUVERTURES, jamais sur une
// liste de chemins.
//
// ⛔ POURQUOI PAR LA TRACE, ET PAS EN LISANT MES SCRIPTS. Un voisin qui gèle mon dépôt me demande de
// ne rien écrire sous les racines que son banc lit. Mon portillon, lui, écrit — et personne ne le lui
// a jamais demandé. La question « le mien écrit-il ? » se pose donc chez chacun, et elle a déjà été
// répondue faux par lecture : le 2026-08-30, un voisin a conclu « mon portillon écrit sous mes racines »
// en lisant une LISTE de chemins injectés, alors que la phrase juste au-dessus de la liste disait que
// l'injection se fait dans une copie HORS du dépôt. Sa trace a dit zéro. La lecture disait le contraire.
//
// ⇒ LES CHEMINS RELATIFS SE RÉSOLVENT, ET C'EST LE DRAPEAU `-y` QUI LE PERMET. Sans lui, `strace`
// journalise l'argument tel que l'appelant l'a passé : `openat(AT_FDCWD, "dist/index.js", …)` était
// une écriture dont j'ignorais le point de chute, et mon premier relevé en a déclaré 133 comme une
// cécité ouverte. Avec `-y`, les DEUX bouts sont annotés — `AT_FDCWD<répertoire courant>` pour
// l'appelant, et le descripteur rendu porte le chemin absolu que le noyau a résolu. Instrument donné
// par kronos le 2026-08-30, mesuré chez lui : zéro non résolu sur 112 869 lignes.
//
// ⚠️ IL RESTE UN CAS, ET IL SE DIT AU LIEU DE SE TAIRE : un appel relatif sans annotation de
// répertoire courant. Ces lignes sont COMPTÉES et RENDUES à part — un instrument qui les jetterait
// silencieusement rendrait un zéro qui ressemble à une absence.

import { readFileSync } from "node:fs";

// Les appels qui ÉCRIVENT toujours, quel que soit leur drapeau. `openat` n'en est pas : il lit dans
// l'immense majorité des cas, et c'est son drapeau qui tranche.
const TOUJOURS_ECRIVANTS =
  /^(creat|rename|renameat|renameat2|unlink|unlinkat|mkdir|mkdirat|link|linkat|symlink|symlinkat|truncate)$/;

// ⛔ LE DRAPEAU QUI DIT « J'ÉCRIS », ET `O_RDONLY` N'EN EST PAS UN : il vaut zéro et ne s'écrit pas.
// Une ouverture est écrivante si elle porte l'un de ces mots, jamais par défaut.
const DRAPEAUX_ECRIVANTS = /O_(WRONLY|RDWR|CREAT|TRUNC|APPEND)/;

/**
 * Lit une trace `strace -f` et rend les écritures qui atterrissent sous une racine donnée.
 *
 * @param {string} fichierDeTrace  la sortie de `strace -o`
 * @param {string} racine          le dépôt dont on veut les écritures (chemin absolu, sans / final)
 * @returns {{examinees:number, ecrivantes:number, chemins:string[], relatifs:string[]}}
 */
export function ecrituresSous(fichierDeTrace, racine) {
  const texte = readFileSync(fichierDeTrace, "utf-8");
  let examinees = 0;
  let ecrivantes = 0;
  const chemins = new Set();
  const relatifs = new Set();
  const retenir = (chemin) => {
    if (chemin === racine || chemin.startsWith(`${racine}/`)) chemins.add(chemin);
  };

  for (const ligne of texte.split("\n")) {
    // `<pid> <appel>(<arguments>) = <retour>` — le pid est absent quand `strace` suit un seul
    // processus, d'où le groupe optionnel.
    const m = ligne.match(/^(?:\d+\s+)?([a-z0-9_]+)\((.*)$/);
    if (!m) continue;
    const [, appel, arguments_] = m;
    examinees++;

    const ecrivant =
      TOUJOURS_ECRIVANTS.test(appel) ||
      (appel === "open" || appel === "openat"
        ? DRAPEAUX_ECRIVANTS.test(arguments_)
        : false);
    if (!ecrivant) continue;

    // ⛔ UNE OUVERTURE QUI A ÉCHOUÉ N'A RIEN ÉCRIT. `openat(…) = -1 ENOENT` est une TENTATIVE, et la
    // compter ferait accuser un portillon qui cherche un fichier absent en mode création.
    if (/=\s*-1\s/.test(ligne)) continue;
    ecrivantes++;

    // ⇒ LE RÉPERTOIRE COURANT DE L'APPELANT, quand le traceur l'annote (`-y`). C'est lui qui lève la
    // cécité aux chemins relatifs, y compris sur `unlinkat` et `renameat`, qui ne rendent aucun
    // descripteur. Instrument donné par kronos le 2026-08-30, mesuré chez lui : zéro non résolu sur
    // 112 869 lignes.
    // ⛔ ET CE N'EST PAS TOUJOURS `AT_FDCWD` : le premier argument d'un appel « …at » est un
    // DESCRIPTEUR DE DOSSIER dès que l'appelant en tient un ouvert, et `-y` l'annote de la même
    // façon — `unlinkat(4</chemin/du/dossier>, "a.txt", 0)`. Ma première version ne lisait que la
    // graphie `AT_FDCWD` : la campagne du 2026-08-30 à 13:28 a rendu 132 chemins « non résolus »
    // dont AUCUN sous `.git/`, alors que le traceur les annotait tous. L'instrument déclarait une
    // cécité qui était la sienne, et il la déclarait à douze dépôts.
    const courant = arguments_.match(/^(?:AT_FDCWD|\d+)<([^>]*)>/)?.[1] ?? null;

    // ⇒ ET LE DESCRIPTEUR RENDU PORTE LE CHEMIN QUE LE NOYAU A RÉSOLU — pour toute ouverture ABOUTIE
    // il n'y a donc rien à résoudre. Une ouverture qui échoue n'en rend pas, et elle n'écrit rien.
    const resolu = ligne.match(/=\s*\d+<([^>]*)>/)?.[1];
    if (resolu) retenir(resolu);

    // Tous les chemins cités par l'appel — `rename` en porte DEUX, et c'est la destination qui
    // compte autant que la source.
    for (const [, chemin] of arguments_.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
      if (chemin.startsWith("/")) retenir(chemin);
      else if (courant) retenir(`${courant.replace(/\/$/, "")}/${chemin}`);
      else relatifs.add(`${appel} ${chemin}`);
    }
  }
  return {
    examinees,
    ecrivantes,
    chemins: [...chemins].sort(),
    relatifs: [...relatifs].sort(),
  };
}

/**
 * Range des chemins absolus sous leur PREMIER segment relatif à la racine — c'est cette granularité
 * que les voisins emploient quand ils déclarent ce que leur banc lit chez moi (`packages`,
 * `docs/spec`, `contrats`, `tools`…). Un dossier de tête rend la réponse comparable à leur demande.
 */
export function parRacineDeTete(chemins, racine) {
  const par = new Map();
  for (const c of chemins) {
    const relatif = c.slice(racine.length + 1);
    const tete = relatif.split("/")[0] || relatif;
    if (!par.has(tete)) par.set(tete, []);
    par.get(tete).push(relatif);
  }
  return par;
}

// ⛔ L'ÉPREUVE TOURNE DANS `npm run arch`, DONC DANS LE PORTILLON — un garde qu'on n'a pas vu mordre
// par injection est une hypothèse. Chaque cas porte son témoin NON NUL : un instrument qui rend zéro
// partout passerait tous les cas d'absence et aucun cas de présence.
if (process.argv[2] === "--eprouver") {
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const bac = mkdtempSync(join(tmpdir(), "epreuve-trace-"));
  const R = "/home/x/depot";
  let vus = 0;
  const echecs = [];
  const cas = (nom, trace, attendu) => {
    vus++;
    const f = join(bac, `${nom.replace(/\W+/g, "_")}.txt`);
    writeFileSync(f, trace);
    const r = ecrituresSous(f, R);
    const obtenu = attendu(r);
    if (obtenu !== true) echecs.push(`✗ ${nom} — ${obtenu}`);
    else console.log(`✓ ${nom}`);
  };

  cas(
    "une ouverture EN ÉCRITURE sous la racine est nommée (témoin NON NUL)",
    `123 openat(AT_FDCWD, "${R}/packages/ui/dist/a.js", O_WRONLY|O_CREAT|O_TRUNC, 0666) = 4\n`,
    (r) =>
      r.chemins.length === 1 && r.chemins[0] === `${R}/packages/ui/dist/a.js`
        ? true
        : `attendu 1 chemin, obtenu ${JSON.stringify(r.chemins)}`,
  );
  cas(
    "une ouverture EN LECTURE sous la racine ne compte pas (témoin inverse)",
    `123 openat(AT_FDCWD, "${R}/packages/ui/src/a.ts", O_RDONLY|O_CLOEXEC) = 4\n`,
    (r) => (r.chemins.length === 0 ? true : `elle a été comptée : ${r.chemins}`),
  );
  cas(
    "une ouverture écrivante HORS de la racine ne compte pas",
    `123 openat(AT_FDCWD, "/tmp/ailleurs.js", O_WRONLY|O_CREAT, 0666) = 4\n`,
    (r) => (r.chemins.length === 0 ? true : `elle a été comptée : ${r.chemins}`),
  );
  cas(
    "un renommage porte DEUX chemins, et la destination compte",
    `9 rename("${R}/dist.chantier", "${R}/dist") = 0\n`,
    (r) =>
      r.chemins.length === 2 && r.chemins.includes(`${R}/dist`)
        ? true
        : `attendu les deux, obtenu ${JSON.stringify(r.chemins)}`,
  );
  cas(
    "une suppression compte comme une écriture",
    `9 unlink("${R}/tools/jetable.txt") = 0\n`,
    (r) => (r.chemins.length === 1 ? true : `obtenu ${JSON.stringify(r.chemins)}`),
  );
  cas(
    "une ouverture écrivante qui ÉCHOUE n'a rien écrit",
    `9 openat(AT_FDCWD, "${R}/packages/absent.js", O_WRONLY|O_CREAT, 0666) = -1 ENOENT (No such file)\n`,
    (r) => (r.chemins.length === 0 ? true : `elle a été comptée : ${r.chemins}`),
  );
  cas(
    "un chemin RELATIF SANS répertoire annoté est rendu à part, jamais jeté en silence",
    `9 openat(AT_FDCWD, "dist/index.js", O_WRONLY|O_CREAT, 0666) = 4\n`,
    (r) =>
      r.chemins.length === 0 && r.relatifs.length === 1
        ? true
        : `chemins=${JSON.stringify(r.chemins)} relatifs=${JSON.stringify(r.relatifs)}`,
  );
  cas(
    "un chemin RELATIF AVEC le répertoire courant annoté se résout sous la racine",
    `9 openat(AT_FDCWD<${R}/packages/ui>, "dist/index.js", O_WRONLY|O_CREAT, 0666) = 4\n`,
    (r) =>
      r.relatifs.length === 0 && r.chemins.includes(`${R}/packages/ui/dist/index.js`)
        ? true
        : `chemins=${JSON.stringify(r.chemins)} relatifs=${JSON.stringify(r.relatifs)}`,
  );
  cas(
    "un retrait relatif se résout aussi — il ne rend aucun descripteur (témoin inverse du cas précédent)",
    `9 unlinkat(AT_FDCWD<${R}/packages/ui/public/docs>, "actors.html", 0) = 0\n`,
    (r) =>
      r.relatifs.length === 0 &&
      r.chemins.includes(`${R}/packages/ui/public/docs/actors.html`)
        ? true
        : `chemins=${JSON.stringify(r.chemins)} relatifs=${JSON.stringify(r.relatifs)}`,
  );
  cas(
    "le chemin résolu par le NOYAU est retenu même si l argument cité est relatif et hors racine",
    `9 openat(AT_FDCWD<${R}>, "x.txt", O_WRONLY|O_CREAT, 0666) = 4<${R}/x.txt>\n`,
    (r) => (r.chemins.includes(`${R}/x.txt`) ? true : `obtenu ${JSON.stringify(r.chemins)}`),
  );
  cas(
    "un DESCRIPTEUR DE DOSSIER annoté résout aussi — ce n est pas toujours AT_FDCWD",
    `9 unlinkat(4<${R}/packages/ui/public/docs>, "actors.html", 0) = 0\n`,
    (r) =>
      r.relatifs.length === 0 &&
      r.chemins.includes(`${R}/packages/ui/public/docs/actors.html`)
        ? true
        : `chemins=${JSON.stringify(r.chemins)} relatifs=${JSON.stringify(r.relatifs)}`,
  );
  cas(
    "un répertoire courant HORS de ma racine ne fait entrer personne (témoin inverse)",
    `9 openat(AT_FDCWD</tmp/ailleurs>, "dist/index.js", O_WRONLY|O_CREAT, 0666) = 4\n`,
    (r) =>
      r.chemins.length === 0 && r.relatifs.length === 0
        ? true
        : `chemins=${JSON.stringify(r.chemins)} relatifs=${JSON.stringify(r.relatifs)}`,
  );
  cas(
    "une trace sans aucun appel se compte comme ZÉRO EXAMINÉ",
    "--- SIGCHLD ---\n+++ exited with 0 +++\n",
    (r) => (r.examinees === 0 ? true : `examinees=${r.examinees}`),
  );
  cas(
    "le rangement par racine de tête suit la granularité que les voisins déclarent",
    `9 openat(AT_FDCWD, "${R}/packages/ui/dist/a.js", O_WRONLY|O_CREAT, 0666) = 4\n` +
      `9 openat(AT_FDCWD, "${R}/tools/b.txt", O_WRONLY|O_CREAT, 0666) = 5\n`,
    (r) => {
      const par = parRacineDeTete(r.chemins, R);
      return par.size === 2 && par.has("packages") && par.has("tools")
        ? true
        : `obtenu ${JSON.stringify([...par.keys()])}`;
    },
  );

  if (vus === 0) {
    console.error("⛔ ZÉRO cas éprouvé — cette épreuve ne prouve rien.");
    process.exit(2);
  }
  if (echecs.length) {
    console.error(echecs.join("\n"));
    process.exit(1);
  }
  console.log(`✓ ${vus} cas — la trace des ouvertures discrimine.`);
}
