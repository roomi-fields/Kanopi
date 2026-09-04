#!/usr/bin/env node
// ⛔ UN VOISIN QUE MA CHAÎNE LIT PAR UN CHEMIN DE DISQUE — la population que `voisinsLies` ne voit pas.
//
// MESURÉ EN SERVICE le 2026-08-25, pendant ma propre campagne `kanopi-20260825T205824Z` :
//
//     22:58:24   ma fenêtre s'ouvre — ONZE destinataires, atlas n'en est pas
//     23:00:22   atlas écrit 23 fichiers sous `doc-utilisateur/`, et pousse au vert
//     23:03:08   MA construction réécrit 132 de mes 138 fichiers de `packages/ui/public/`
//
// ⇒ Ma chaîne était allée lire son arbre vif et avait régénéré `public/docs/` depuis lui. Sa frappe,
//   ma chaîne, mon arbre — et mon relevé n'a rien vu, parce qu'il regarde les racines exposées de mes
//   ONZE, où atlas n'était pas.
//
// ⛔ POURQUOI `voisinsLies` NE POUVAIT PAS L'ATTRAPER : il énumère les dépôts que je résous par LIEN
// SYMBOLIQUE — une dépendance déclarée dans un manifeste. Atlas n'est pas une dépendance : deux de mes
// scripts nomment son dossier en dur. Le lien vit dans un SCRIPT, pas dans une déclaration, et aucune
// des deux surfaces — ni la mienne, ni la sienne — ne pouvait voir la paire.
//
// ⇒ DÉCISION DE MÉTHODE DE L'ARCHITECTE, 2026-08-25 : « qui ouvre une fenêtre sur une racine qu'il
//   construit depuis un voisin gèle aussi ce voisin ». Ce module est le test qu'elle demande, dérivé
//   au lieu d'être répondu à la main.
//
// ⚠️ ET LA LISTE SE DÉRIVE, ELLE NE S'ÉCRIT PAS. Trois fois en deux jours une liste écrite à la main a
// survécu à ce qu'elle décrivait, alors que la bonne existait déjà — les dépôts à geler le 2026-08-24,
// les racines lues le 2026-08-21. Un chemin ajouté à un script entre ici du même geste.

/**
 * Les voisins que mes fichiers de chaîne lisent par un chemin de disque, et la racine lue chez chacun.
 *
 * `lireFichiers` et `lireTexte` sont injectés pour que l'épreuve fabrique ses fichiers sans en poser
 * un seul sur le disque — même forme que le relevé d'écritures, pour la même raison : une injection
 * s'éprouve sur une COPIE, et le cas discriminant n'existe pas toujours dans le réel.
 *
 * `depotsDeLAtelier` tranche ce qui est un dépôt : `../node_modules/x` et `../dist/y` ressemblent à un
 * chemin sortant et ne désignent aucun voisin. Sans ce filtre, l'arme gèlerait des noms que la tour
 * refuse, et la fenêtre ne s'ouvrirait pas du tout.
 *
 * ⚠️ LA RACINE VIENT DU CHEMIN, JAMAIS DU MANIFESTE DU VOISIN. `../atlas/doc-utilisateur` dit ce que je
 * lis chez lui ; son manifeste dirait ce qu'il PUBLIE — deux choses différentes, et c'est justement la
 * première qui a bougé sous ma mesure. Atlas n'a d'ailleurs pas de manifeste : dériver du sien aurait
 * rendu un ensemble vide, donc un gel qui ne surveille rien.
 *
 * @returns {{nom: string, chemin: string, racines: Set<string>, sites: string[]}[]}
 */
export function voisinsLusParChemin(atelier, lireFichiers, lireTexte, depotsDeLAtelier, existe) {
  const fichiers = lireFichiers();
  const parNom = new Map();
  let examines = 0;
  // `../x/`, `../../x/`, … — la forme qu'un script écrit pour sortir de mon arbre. Le premier segment
  // non-`..` est le dépôt ; le segment suivant est la racine que je lis chez lui.
  // ⛔ ET UN ESPACE PARTAGÉ SE TRAVERSE, IL NE SE NOMME PAS — 2026-09-04. Depuis la migration, mes
  // chemins passent par `../.publie/<dépôt>/…` : le premier segment non-`..` était donc `.publie`, et
  // ma liste de gel a nommé cet espace comme s'il était un dépôt. La tour a refusé ma fenêtre —
  // « dépôt inconnu: .publie ». ⇒ `.publie` et `.paquets` sont des ESPACES qui contiennent des dépôts,
  // pas des dépôts : le motif les franchit et nomme ce qui suit.
  // ⚠️ Un paquet épinglé y apparaît sous sa forme figée (`runtime-in-<sha>`) et n'est donc pas un nom
  // de la tour : le filtre par les dossiers de l'atelier l'écarte, et c'est juste — un instantané
  // scellé ne peut pas changer sous ma campagne.
  const MOTIF =
    /(?:\.\.\/)+(?:\.(?:publie|paquets)\/)?([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)/g;
  for (const f of fichiers) {
    examines++;
    const texte = lireTexte(f);
    if (texte === null) continue;
    for (const [n, ligne] of texte.split("\n").entries()) {
      // ⛔ UNE LIGNE DE COMMENTAIRE NE CONSTRUIT RIEN. Mes propres en-têtes citent les chemins qu'ils
      // expliquent : `tir-arme.mjs` nomme le `dist` de BPx dans sa prose, ce fichier-ci nomme celui
      // d'atlas. Chacun ajoutait un SITE à ma liste de gel, et l'un d'eux y ajoutait un DÉPÔT.
      // ⇒ Troisième forme de la même faute en une soirée — une racine coupée en fin de ligne, une
      //   racine décrite dans un cas de test, un chemin cité dans une explication. Les deux premières
      //   ont été fermées une par une ; celle-ci ferme la classe : ce qui n'est pas exécuté ne lit rien.
      if (/^\s*(\/\/|\*|#)/.test(ligne)) continue;
      MOTIF.lastIndex = 0;
      let m;
      while ((m = MOTIF.exec(ligne)) !== null) {
        const [, dossier, racine] = m;
        // ⛔ LA CASSE NE DÉCIDE PAS : un script écrit le nom du dépôt tel qu'il est sur le disque,
        // capitales comprises, quand la tour le connaît en minuscules (`bpscript`), et le
        // dossier réel porte encore une autre graphie. Le dossier de l'atelier fait foi.
        const reel = depotsDeLAtelier.find((d) => d.toLowerCase() === dossier.toLowerCase());
        if (!reel) continue;
        // ⛔ LA RACINE DOIT EXISTER CHEZ LUI, ET C'EST MON PROPRE COMMENTAIRE QUI L'A MONTRÉ. Ce module
        // balaie MES fichiers de chaîne, et `tir-arme.mjs` en est un : la prose de son en-tête coupait
        // `doc-utilisateur` en fin de ligne, et ma liste de gel a déclaré une racine `doc-` que
        // personne n'a jamais eue. ⇒ Un garde se prouve sur la graphie que le code écrit — ici, sur
        // celle que j'écris moi-même à côté du code. Le disque tranche, la graphie ne suffit pas.
        if (!existe(`${atelier}/${reel}/${racine}`)) continue;
        const nom = reel.toLowerCase();
        if (!parNom.has(nom))
          parNom.set(nom, { nom, chemin: `${atelier}/${reel}`, racines: new Set(), sites: [] });
        const v = parNom.get(nom);
        v.racines.add(racine);
        v.sites.push(`${f}:${n + 1}`);
      }
    }
  }
  // ⛔ ANTI-VACUITÉ : un balayage qui n'a examiné AUCUN fichier n'a rien mesuré, et son ensemble vide
  // se lit exactement comme « aucun voisin lu par chemin ». C'est « examiné zéro », pas « écarté zéro » :
  // l'assiette ne doit pas se vider, et une chaîne sans chemin sortant reste un état légitime.
  if (examines === 0)
    throw new Error(
      "voisins-lus-par-chemin : ZÉRO fichier de chaîne examiné — l'énumération est cassée, " +
        "pas la chaîne. Un ensemble vide se lirait « aucun voisin » et gèlerait une liste trop courte.",
    );
  return [...parNom.values()].sort((a, b) => a.nom.localeCompare(b.nom));
}

// ── L'ÉPREUVE, SUR UNE COPIE ────────────────────────────────────────────────────────────────────
// Aucun fichier n'est posé sur le disque et aucun voisin n'est touché : les fichiers de chaîne sont
// décrits, et le cas réel du 2026-08-25 est rejoué à l'identique.
{
  const { pathToFileURL } = await import("node:url");
  const lanceDirectement =
    process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
  if (lanceDirectement && process.argv.includes("--eprouver")) {
    const ATELIER = "/atelier";
    const DEPOTS = ["atlas", "kairos", "BPscript", "kanopi", "hub"];
    const cas = [];
    const juge = (dit, obtenu, attendu) =>
      cas.push({ dit, obtenu, attendu, ok: JSON.stringify(obtenu) === JSON.stringify(attendu) });
    /** Les racines qui EXISTENT chez les voisins de l'épreuve — le disque, décrit. */
    const SUR_DISQUE = new Set([
      "/atelier/atlas/doc-utilisateur",
      "/atelier/atlas/carte-autorites",
      "/atelier/kairos/decisions",
      "/atelier/BPscript/docs",
    ]);
    /** Balaye une chaîne décrite : `{ "chemin/du/fichier": "son texte" }`. */
    const sur = (arbre, existe = (p) => SUR_DISQUE.has(p)) =>
      voisinsLusParChemin(
        ATELIER,
        () => Object.keys(arbre),
        (f) => arbre[f] ?? null,
        DEPOTS,
        existe,
      );
    const noms = (r) => r.map((v) => v.nom);
    // ⛔ LES CHEMINS DES CAS S'ASSEMBLENT — un cas DÉCRIT une chaîne, il n'en FABRIQUE pas. Ce fichier
    // est balayé par la fonction qu'il éprouve : chaque chemin écrit d'un seul tenant entrait dans ma
    // vraie liste de gel. Mesuré deux fois — atlas m'a rendu `carte-autorites`, et ma propre relance a
    // rendu `bpscript/docs` juste après.
    const A = "../" + "atlas/";
    const K = "../" + "kairos/";

    // ⛔ LE CAS RÉEL DU 2026-08-25 — les deux sites qui ont produit la campagne non couverte.
    {
      const r = sur({
        "packages/ui/scripts/docs-refresh.sh": `DOC_SRC="$UI_DIR/../../${A}doc-utilisateur"`,
        "scripts/publish/build-and-deploy.sh": `DOC_SRC="$REPO_ROOT/${A}doc-utilisateur"`,
      });
      juge("les deux sites réels rendent atlas, une fois", noms(r), ["atlas"]);
      juge("et la racine lue est celle du CHEMIN", [...r[0].racines], ["doc-utilisateur"]);
      juge("les deux sites sont nommés", r[0].sites.length, 2);
    }

    // ⛔ TÉMOIN INVERSE — sans lui, une fonction qui rendrait TOUJOURS un voisin passerait le cas
    // précédent, et mon arme gèlerait un dépôt à chaque campagne sans raison.
    juge(
      "une chaîne sans chemin sortant ne rend AUCUN voisin",
      noms(sur({ "scripts/rien.mjs": "import { join } from 'node:path';\nconst x = './lib/y.js';" })),
      [],
    );

    // Un chemin qui sort vers un dossier qui n'est PAS un dépôt ne gèle rien — la tour refuserait le nom.
    juge(
      "un chemin sortant vers un non-dépôt est écarté",
      noms(sur({ "scripts/a.mjs": "require('../node_modules/vite/index.js')" })),
      [],
    );

    // ⚠️ LA CASSE — un script écrit `BPscript`, la tour connaît `bpscript`. Le dossier fait foi.
    juge(
      "la casse du script ne change pas le nom rendu",
      noms(sur({ "scripts/b.sh": `SRC="../${"bpscript/"}docs/spec"` })),
      ["bpscript"],
    );

    // Plusieurs voisins, plusieurs racines chez le même — tout entre, rien n'écrase.
    //
    // ⛔ LES CHEMINS DE CE CAS SONT ASSEMBLÉS, JAMAIS ÉCRITS D'UN SEUL TENANT — et c'est la troisième
    // fois que ma propre prose entre dans ma mesure. Ce fichier est balayé par la fonction qu'il
    // éprouve : écrit en clair, la carte d'autorités d'atlas entrait dans ma VRAIE liste de gel, et
    // atlas s'est imposé une discipline sur un dossier que rien chez moi ne lit. Il l'a mesuré et me
    // l'a rendu.
    // ⇒ Les deux parades précédentes ne pouvaient pas l'attraper : la racine EXISTE chez lui, donc le
    //   filtre du disque la laisse passer, et elle n'est pas coupée en fin de ligne.
    // ⇒ Un cas de test décrit une chaîne ; il ne doit pas en fabriquer une.
    {
      const r = sur({
        "scripts/c.mjs": `'${A}doc-utilisateur' + '${A}carte-autorites' + '${K}decisions'`,
      });
      juge("deux voisins distincts sont rendus, triés", noms(r), ["atlas", "kairos"]);
      juge("deux racines chez le même voisin s'accumulent", [...r[0].racines].sort(), [
        "carte-autorites",
        "doc-utilisateur",
      ]);
    }

    // Le chemin profond (`../../../`) est la forme réelle de `docs-refresh.sh` — il ne doit pas
    // décaler le segment lu comme dépôt.
    juge(
      "un chemin à plusieurs remontées nomme le bon dépôt",
      noms(sur({ "scripts/d.sh": `"$UI_DIR/../../${A}doc-utilisateur"` })),
      ["atlas"],
    );

    // ⛔ LE CAS QUE LA MESURE RÉELLE A RÉVÉLÉ, ET QUE CETTE ÉPREUVE NE PORTAIT PAS : ma propre prose
    // fabrique une racine. `tir-arme.mjs` est un fichier de chaîne, son en-tête coupait
    // `doc-utilisateur` en fin de ligne, et ma liste de gel déclarait `atlas/doc-` — une racine que
    // personne n'a jamais eue. Le disque tranche.
    juge(
      "une racine qui n'existe PAS chez le voisin est écartée",
      sur({ "scripts/tir-arme.mjs": "// … lit `../atlas/doc-\n// * utilisateur` chez lui" }).length,
      0,
    );
    // TÉMOIN INVERSE — sans lui, un filtre qui écarterait TOUT passerait le cas précédent, et l'arme
    // ne gèlerait plus jamais personne.
    juge(
      "et la racine qui existe, elle, passe",
      noms(sur({ "scripts/e.sh": `"${A}doc-utilisateur"` })),
      ["atlas"],
    );

    // ⛔ ANTI-VACUITÉ : zéro fichier examiné doit JETER, pas rendre un ensemble vide.
    {
      let jete = false;
      try {
        voisinsLusParChemin(ATELIER, () => [], () => null, DEPOTS, () => true);
      } catch {
        jete = true;
      }
      juge("zéro fichier examiné JETTE au lieu de rendre le vide", jete, true);
    }
    // TÉMOIN INVERSE de l'anti-vacuité : un fichier examiné sans chemin ne jette PAS — « écarté zéro »
    // est un état légitime, seul « examiné zéro » est un instrument cassé.
    {
      let jete = false;
      try {
        sur({ "scripts/vide.mjs": "" });
      } catch {
        jete = true;
      }
      juge("un fichier examiné sans chemin ne jette pas", jete, false);
    }

    let echecs = 0;
    for (const c of cas) {
      if (!c.ok) echecs++;
      console.log(
        `${c.ok ? "✓" : "✗"} ${c.dit}` +
          (c.ok ? "" : `\n    obtenu ${JSON.stringify(c.obtenu)}, attendu ${JSON.stringify(c.attendu)}`),
      );
    }
    const PLANCHER = 13;
    if (cas.length < PLANCHER) {
      console.error(
        `⛔ ${cas.length} cas éprouvés, ${PLANCHER} attendus — l épreuve ne distingue plus rien.`,
      );
      process.exit(1);
    }
    console.log(
      `${echecs === 0 ? "PASS" : "FAIL"} voisins-lus-par-chemin — ${cas.length} cas éprouvés sur une COPIE, ${echecs} échec(s).`,
    );
    process.exit(echecs ? 1 : 0);
  }
}
