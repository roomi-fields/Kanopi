#!/usr/bin/env node
// ⛔ CE QUE JE SURVEILLE CHEZ UN VOISIN, ET L ÉPREUVE QUI LE PROUVE — sur une COPIE, jamais chez lui.
//
// LA RÈGLE : les racines que son manifeste expose, PLUS ce manifeste. Relevé par kronos le
// 2026-08-25 : mon relevé LIT le manifeste pour en DÉRIVER les racines, et ne le surveillait pas —
// un voisin qui bascule `exports` ou `files` pendant ma fenêtre fait changer la liste SOUS ma mesure,
// et mon témoin reste vert en attestant l immobilité d un périmètre qui a bougé.
//
// ⛔ POURQUOI CE MODULE EXISTE À PART, ET C EST LA MOITIÉ DU SUJET. J avais écrit, en frappant cette
// règle : « je n ai pas pu la faire mordre par injection — injecter voudrait dire toucher un fichier
// chez l un d eux, ce que ma propre règle interdit ». C EST FAUX, et kronos l a nommé : ma règle
// interdit d injecter DANS leurs arbres, elle n interdit pas d injecter. J avais pris une
// interdiction pour une impossibilité, et publié un vert muet en me contentant de le NOMMER.
//
// ⇒ UNE INJECTION S ÉPROUVE SUR UNE COPIE. L arbre balayé est donc un PARAMÈTRE — même forme que
//   `gardeCeQueLaPorteEmbarque(racinePaquet, …)` chez kronos, où la racine était déjà un paramètre
//   qu il ne s était pas servi (dix injections écrites cette nuit dans son `dist/` vivant, dont deux
//   qui ont réduit `index.js` à `export const rien = 1` pendant que je le lisais en direct).
//
// ⇒ ET LA COPIE EST LE SEUL ENDROIT OÙ LE CAS DISCRIMINANT PEUT EXISTER. Mesuré le 2026-08-25 : chez
//   les onze voisins, une racine est TOUJOURS plus récente que le manifeste. Je rendais ce constat
//   comme rassurant ; il dit l inverse — aucune mesure sur le réel ne peut distinguer un relevé qui
//   voit le manifeste d un relevé qui l ignore. Sur une copie, je fabrique le cas : manifeste le plus
//   récent, racines figées.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Les racines à surveiller chez un voisin.
 *
 * `lireRacines` est injecté pour que l épreuve puisse décrire un manifeste sans en poser un sur le
 * disque — et pour que le cas « le manifeste n est PAS dans ses `files` » soit exerçable, qui est
 * précisément celui que la règle vise.
 */
export function racinesSurveillees(depot, lireRacines) {
  return new Set([...(lireRacines(depot) ?? []), "package.json"]);
}

/** Chaque fichier sous un dossier, ET CHAQUE DOSSIER. Un lien symbolique ne se suit pas : il
 *  désignerait un arbre qui n appartient pas au voisin. Même règle que le relevé d empreinte.
 *
 * ⛔ LES DOSSIERS SONT ENTRÉS LE 2026-08-30, ET LEUR ABSENCE RENDAIT MON VERDICT PLUS ÉTROIT QUE SA
 * PHRASE. Un fichier CRÉÉ PUIS RETIRÉ pendant ma fenêtre ne laisse aucun `mtime` derrière lui : il
 * disparaît avec le fichier. Seul le `mtime` du DOSSIER qui le portait bouge — et je ne le regardais
 * pas. Mon « AUCUNE BASCULE pendant ma mesure » attestait donc l immobilité des fichiers QUI
 * SURVIVENT, jamais celle du répertoire, et il partait tel quel à douze dépôts à chaque campagne.
 *
 * ⇒ TROUVÉ EN QUALIFIANT LA MESURE D UN VOISIN, PAS EN RELISANT MON CODE. runtime-UI a rendu le
 *   relevé tracé de ses passes sous mes fenêtres, en bornant honnêtement celle qu il n avait pas
 *   instrumentée. J allais répondre « mon relevé d intervalle la couvre » — c est en le vérifiant
 *   avant de l écrire que le trou est sorti. Son lanceur de bancs crée un fichier d horodatage à sa
 *   racine et le retire : la forme la plus courante d écriture temporaire, et précisément celle à
 *   laquelle j étais aveugle.
 *
 * ⚠️ Le dossier entre donc dans `examines` au même titre qu un fichier — il EST une chose datée dont
 *   le changement est un fait, pas un contenant qu on traverse. */
function sousArbre(base, out = []) {
  for (const e of readdirSync(base, { withFileTypes: true })) {
    const p = join(base, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      // ⛔ LE DOSSIER PASSE APRÈS SON CONTENU, ET CE N EST PAS UN DÉTAIL D ORDRE. Créer un fichier
      // date le fichier ET son dossier au MÊME instant ; la comparaison retient le premier vu à
      // égalité. Placé avant, le dossier gagnait, et mon relevé nommait « src » là où il nommait
      // « src/index.js » — je perdais QUEL fichier a bougé, qui est tout ce que le message sert à
      // dire. Mes propres bancs l ont attrapé : trois cas, sur la graphie exacte du nom rendu.
      // ⇒ Le dossier ne doit l emporter que s il est STRICTEMENT plus récent que tout ce qu il
      //   contient — c est-à-dire dans le seul cas où il apporte quelque chose : le créé-puis-retiré.
      sousArbre(p, out);
      out.push(p);
    } else out.push(p);
  }
  return out;
}

/**
 * La dernière écriture sous les racines surveillées, et le fichier concerné.
 *
 * Rend aussi `examines` : un relevé qui a regardé ZÉRO fichier n a rien relevé, et le dire vaut mieux
 * que rendre un `quand: 0` qu on lira comme « rien n a bougé ».
 */
export function derniereEcriture(chemin, racines) {
  let quand = 0;
  let quoi = null;
  let examines = 0;
  for (const r of racines) {
    const base = join(chemin, r);
    let fichiers;
    try {
      // ⛔ LA RACINE ELLE-MÊME EN FAIT PARTIE : un fichier créé puis retiré DIRECTEMENT sous `src/`
      // ne change que le `mtime` de `src`, que `sousArbre` ne rend pas — il ne rend que ce qu il
      // trouve DEDANS. Sans cette ligne, la correction ci-dessus laisserait ouvert le cas le plus
      // simple, celui du premier niveau.
      fichiers = statSync(base).isDirectory() ? [...sousArbre(base), base] : [base];
    } catch {
      continue; // la racine n existe pas chez lui — ce n est pas une erreur, c est un fait
    }
    for (const f of fichiers) {
      examines++;
      const st = statSync(f);
      if (st.mtimeMs > quand) {
        quand = st.mtimeMs;
        quoi = f.replace(chemin + "/", "");
      }
    }
  }
  return { quand, quoi, examines };
}

/**
 * ⛔ CE QUI A BASCULÉ ENTRE DEUX RELEVÉS — la comparaison qui transforme une photo en intervalle.
 *
 * Relevé par kairos le 2026-08-25 : « une photo à l arrivée ne peut pas attester une immobilité
 * pendant un intervalle ». Mes 90 s de grâce étaient surveillées en continu ; mes 18 minutes de mesure
 * ne l étaient pas. Un dépôt qui écrivait puis commitait avant mon arrivée rendait le MÊME relevé
 * qu un dépôt immobile.
 *
 * ⇒ Elle vit ici, et pas dans la boucle de tir, pour la même raison que le relevé : dans `tir-arme.mjs`
 *   elle ne se vérifierait qu en tirant, donc en gelant onze dépôts pour éprouver une comparaison.
 *
 * `avant` et `apres` sont deux Map nom → { quand, quoi }. Un voisin absent de `avant` ne compte pas :
 * il n était pas surveillé au départ, et l inventer ici nommerait une bascule qu on n a pas mesurée.
 */
export function basculesEntre(avant, apres, hh) {
  const out = [];
  for (const [nom, { quand, quoi }] of apres) {
    const av = avant.get(nom);
    if (av && quand > av.quand) out.push(`${nom} → ${quoi} à ${hh(new Date(quand))}`);
  }
  return out;
}

// ── L ÉPREUVE, SUR UNE COPIE ────────────────────────────────────────────────────────────────────
// Un arbre factice sous le dossier temporaire du système : aucun voisin n est touché, et le cas que
// le réel ne porte jamais — un manifeste plus récent que toutes les racines — y est FABRIQUÉ.
{
  const { pathToFileURL } = await import("node:url");
  const lanceDirectement =
    process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
  if (lanceDirectement && process.argv.includes("--eprouver")) {
    const { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");

    const racine = mkdtempSync(join(tmpdir(), "kanopi-epreuve-releve-"));
    const faux = join(racine, "voisin-factice");
    mkdirSync(join(faux, "src"), { recursive: true });
    writeFileSync(join(faux, "src", "index.js"), "export const rien = 1;\n");
    writeFileSync(join(faux, "package.json"), '{"files":["src"]}\n');

    // Le manifeste du voisin n expose QUE `src` — c est exactement le cas que la règle vise :
    // `package.json` n est pas dans ses `files`, et doit être surveillé quand même.
    const sesRacines = () => new Set(["src"]);
    const surveillees = racinesSurveillees(faux, sesRacines);

    const dater = (f, secondes) => {
      const t = new Date("2026-01-01T00:00:00Z").getTime() / 1000 + secondes;
      utimesSync(join(faux, f), t, t);
    };

    const cas = [];
    const juge = (dit, r, attendu) => cas.push({ dit, obtenu: r, ok: r === attendu, attendu });

    // ⛔ LE DOSSIER SE DATE COMME UN FICHIER, SINON CE DÉCOR NE DÉCRIT AUCUN ÉTAT RÉEL. Depuis que
    // les dossiers entrent dans le relevé, laisser `src` à son heure de CRÉATION — l instant présent
    // — le rend plus récent que tout ce que ce décor antidate, et il gagne partout. Mes trois cas
    // sont tombés là-dessus, et c est le décor qui était incohérent : sur un vrai disque, le `mtime`
    // d un dossier ne peut pas être postérieur à la dernière écriture qu il a reçue.
    // ⚠️ Les attentes ne bougent pas d un caractère : c est le décor qui devient descriptible.
    dater("src/index.js", 100);
    dater("src", 100);
    dater("package.json", 200);
    juge(
      "manifeste PLUS RÉCENT que la racine → c est lui que le relevé nomme",
      derniereEcriture(faux, surveillees).quoi,
      "package.json",
    );

    // TÉMOIN EN SENS INVERSE — sans lui, un relevé qui rendrait TOUJOURS le manifeste passerait le
    // cas précédent pour la mauvaise raison.
    dater("package.json", 100);
    dater("src/index.js", 200);
    dater("src", 200);
    juge(
      "racine PLUS RÉCENTE que le manifeste → c est la racine que le relevé nomme",
      derniereEcriture(faux, surveillees).quoi,
      "src/index.js",
    );

    // La règle elle-même : le manifeste entre, alors que le voisin ne l expose pas.
    juge(
      "le manifeste est surveillé même hors des `files` du voisin",
      surveillees.has("package.json"),
      true,
    );

    // Une racine annoncée qui n existe pas chez lui ne casse rien et ne compte rien.
    juge(
      "une racine absente est sautée, le relevé tient",
      derniereEcriture(faux, new Set(["dist", "src", "package.json"])).quoi,
      "src/index.js",
    );

    // ⛔ LE CAS QUE LES DOSSIERS EXISTENT POUR ATTRAPER : un fichier CRÉÉ PUIS RETIRÉ. Il ne laisse
    // aucun `mtime` derrière lui — seul celui du dossier bouge. Sans ce cas, la correction du
    // 2026-08-30 serait entrée sans qu un banc la tienne, et un parcours revenu aux seuls fichiers
    // repasserait au vert.
    const avantTemporaire = derniereEcriture(faux, surveillees).quand;
    writeFileSync(join(faux, "src", "horodatage-du-lanceur.mjs"), "1\n");
    rmSync(join(faux, "src", "horodatage-du-lanceur.mjs"));
    const apresTemporaire = derniereEcriture(faux, surveillees);
    juge(
      "un fichier CRÉÉ PUIS RETIRÉ fait bouger le relevé — c est le dossier qui le porte",
      apresTemporaire.quand > avantTemporaire,
      true,
    );
    juge("et le relevé nomme le DOSSIER, seul témoin qui reste", apresTemporaire.quoi, "src");

    // On remet le décor dans l état que les cas suivants décrivent.
    dater("src/index.js", 200);
    dater("src", 200);

    // ⛔ ANTI-VACUITÉ : un relevé qui a examiné zéro fichier n a rien relevé. Sans ce cas, un balayage
    // cassé rendrait `quand: 0`, qui se lit exactement comme « rien n a bougé ».
    juge(
      "un arbre sans aucune racine lisible rend ZÉRO fichier examiné",
      derniereEcriture(faux, new Set(["nexiste-pas"])).examines,
      0,
    );
    juge(
      "et le relevé réel, lui, examine plus que zéro",
      derniereEcriture(faux, surveillees).examines > 0,
      true,
    );

    // ⛔ LE RELEVÉ D INTERVALLE — le cas de kairos, fabriqué : un voisin écrit APRÈS le départ.
    const M = (nom, quand, quoi) => new Map([[nom, { quand, quoi }]]);
    const hh2 = (d) => d.toISOString().slice(11, 19);
    juge(
      "un voisin qui écrit APRÈS le départ est NOMMÉ",
      basculesEntre(M("kairos", 1000, "dist/a.js"), M("kairos", 2000, "dist/b.js"), hh2).length,
      1,
    );
    // TÉMOIN INVERSE — sans lui, une comparaison qui nommerait TOUJOURS passerait le cas précédent.
    juge(
      "un voisin immobile n est PAS nommé",
      basculesEntre(M("kairos", 1000, "dist/a.js"), M("kairos", 1000, "dist/a.js"), hh2).length,
      0,
    );
    // ⛔ LE CAS QUE LE RÉEL PRODUIT ET QU UNE PHOTO NE VOIT PAS : il écrit, puis commite, et son arbre
    // est propre aux deux bouts. Seule la DATE le trahit — c est tout le sujet.
    juge(
      "il a écrit puis commité : la photo est identique, l intervalle le nomme",
      basculesEntre(M("kairos", 1000, "dist/a.js"), M("kairos", 1500, "dist/a.js"), hh2)[0]?.startsWith("kairos"),
      true,
    );
    // Un voisin absent du relevé de DÉPART ne s invente pas à l arrivée.
    juge(
      "un voisin absent au départ n est pas nommé à l arrivée",
      basculesEntre(new Map(), M("kairos", 2000, "dist/b.js"), hh2).length,
      0,
    );

    rmSync(racine, { recursive: true, force: true });

    let echecs = 0;
    for (const c of cas) {
      if (!c.ok) echecs++;
      console.log(
        `${c.ok ? "✓" : "✗"} ${c.dit}` +
          (c.ok ? "" : `\n    obtenu ${JSON.stringify(c.obtenu)}, attendu ${JSON.stringify(c.attendu)}`),
      );
    }
    const PLANCHER = 10;
    if (cas.length < PLANCHER) {
      console.error(`⛔ ${cas.length} cas éprouvés, ${PLANCHER} attendus — l épreuve ne distingue plus rien.`);
      process.exit(1);
    }
    console.log(
      `${echecs === 0 ? "PASS" : "FAIL"} releve-des-ecritures — ${cas.length} cas éprouvés sur une COPIE, ${echecs} échec(s).`,
    );
    process.exit(echecs ? 1 : 0);
  }
}
