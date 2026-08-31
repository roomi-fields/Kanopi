#!/usr/bin/env node
// ⛔ SUIS-JE GELÉ PAR UN VOISIN ? — la question que mon arme ne posait pas.
//
// Mesuré le 2026-08-25 à 13:11 : runtime-in a ouvert une fenêtre sur `kanopi` pendant que mon arme
// attendait. Mes trois conditions de tir portaient toutes sur l état des VOISINS — leur calme, leurs
// arbres sales, leurs manifestes — et aucune sur le mien.
//
// ⇒ CE QUE ÇA PRODUIT : ma campagne ouvre sa fenêtre, gèle onze dépôts, mesure quinze minutes, et sa
//   poussée est refusée par le garde de la tour parce qu un voisin me gèle. Onze dépôts immobilisés
//   pour un refus CERTAIN, connu d avance et lisible en une commande.
//
// ⇒ MÊME FAMILLE QUE LE PRÉ-VOL, qui existe pour la même raison : « rien ne se gèle avant que ce qui
//   est à moi soit vert ». Il couvrait mes gardes et mon typage ; il ne couvrait pas le fait d être
//   gelé — une condition qui ne vit ni dans mon code ni chez le voisin, mais dans la tour.
//
// ⛔ LA DÉCISION EST PURE ET SÉPARÉE DE LA LECTURE DE LA TOUR, pour la raison habituelle : je ne peux
// pas demander à un voisin d ouvrir une fenêtre sur moi pour éprouver mon garde. L épreuve fabrique
// les fenêtres, comme le relevé fabrique son arbre factice.

/**
 * ⛔ L HEURE SE REND EN LOCAL, comme tout le reste de mes messages. Le champ `fin` de la tour est en
 * UTC : rendu brut, il annonçait « jusqu à 2026-08-25T13:56:19.822Z » sur une fenêtre qui courait
 * jusqu à 15:56 locales — deux heures d écart, dans une phrase dont tout le reste est local.
 *
 * ⚠️ C EST LA FAUTE CORRIGÉE LE MATIN MÊME SUR L IDENTIFIANT DE CAMPAGNE, refaite dans le garde écrit
 * juste après — et le crochet de gel de la tour l avait déjà payée le 2026-08-22, où il annonçait 12:46
 * pour une fenêtre courant jusqu à 14:46. Troisième occurrence de « le geste de réparation n hérite pas
 * des leçons de ce qu il répare » (bp3-frontend, versée par l architecte le 2026-08-25).
 *
 * Une heure illisible ne bloque rien : elle se rend telle quelle plutôt que de perdre le refus.
 */
function heureLocale(fin) {
  if (!fin) return "?";
  const d = new Date(fin);
  return Number.isNaN(d.getTime()) ? String(fin) : d.toTimeString().slice(0, 8);
}

/**
 * La raison, en clair, pour laquelle je ne dois pas tirer — ou `null` si personne ne me gèle.
 *
 * `fenetres` est ce que `tour fenetre --json` rend : la même forme que lit le crochet d écriture de la
 * tour (`gel-ecriture.sh:119-125`), donc les mêmes champs `demandeur`, `depots`, `fin`.
 *
 * ⚠️ MA PROPRE FENÊTRE NE ME GÈLE PAS. Sans cette clause, mon arme se refuserait à elle-même dès
 * qu elle aurait ouvert — c est la faute que kronos a mesurée sur le crochet de la tour le 2026-08-22,
 * où `BP_AGENT` arrivait vide et faisait qu un mesureur s interdisait d écrire pendant sa propre
 * fenêtre.
 */
export function geleParUnVoisin(fenetres, moi) {
  for (const f of Array.isArray(fenetres) ? fenetres : []) {
    const demandeur = String(f?.demandeur ?? "");
    if (demandeur.toLowerCase() === moi.toLowerCase()) continue;
    const depots = (f?.depots ?? []).map((d) => String(d).toLowerCase());
    // Une fenêtre SANS liste de dépôts gèle tout le monde — la tour le permet, et l ignorer ferait
    // passer le cas le plus large pour une absence de gel.
    if (depots.length > 0 && !depots.includes(moi.toLowerCase())) continue;
    return (
      `${demandeur} me gèle jusqu'à ${heureLocale(f?.fin)} — ma poussée serait REFUSÉE, ` +
      `et onze dépôts gelés pour rien`
    );
  }
  return null;
}

/**
 * ⛔⛔ QUE FAIRE QUAND JE N AI PAS PU LIRE LES FENÊTRES — et le repli n est pas le même des deux côtés.
 *
 * Mesuré le 2026-08-31 : la tour a refusé `fenetre --json` pendant une heure, un garde de drapeau
 * inconnu écrit pour le geste qui GÈLE et appliqué au geste qui LIT. Mon arme rendait `null` sur tout
 * échec — donc « PERSONNE NE ME GÈLE » d une tour vivante et pleine de fenêtres. Elle aurait mesuré
 * dans celle d un voisin sans la voir.
 *
 *   tour ABSENTE   ⇒ `null` — ne rien opposer, sinon un dépôt isolé devient impoussable, ce qui est
 *                    pire que le trou couvert.
 *   tour VIVANTE   ⇒ REFUSER — ses fenêtres sont sur le disque et ne sont plus lues. Un vert voudrait
 *                    dire « personne ne mesure » alors qu il veut dire « je ne sais pas ».
 *
 * ⇒ La discrimination ne s invente pas ici : c est celle de `hub/tools/garde-fenetre.sh`, dans ses
 *   termes — « LE DOSSIER DES FENÊTRES EXISTE = LA TOUR EXISTE ». L appelant mesure le disque et
 *   passe le fait ; cette fonction ne décide que du repli.
 *
 * @param tourExiste le dossier des fenêtres est-il là — un FAIT, pas une supposition
 * @param quoi       ce qui a échoué, en clair
 * @param dit        ce que la tour a répondu, pour que le refus porte sa cause
 */
export function repliDeLectureImpossible(tourExiste, quoi, dit) {
  if (!tourExiste) return null;
  const premiere = String(dit ?? "").trim().split("\n")[0];
  return (
    `la tour EXISTE et ${quoi} — ses fenêtres sont sur le disque et ne sont plus lues. ` +
    `Je ne peux pas savoir qui me gèle : un vert ici voudrait dire « je ne sais pas »` +
    (premiere ? `\n   ${premiere}` : "")
  );
}

// ── L ÉPREUVE ────────────────────────────────────────────────────────────────────────────────────
{
  const { pathToFileURL } = await import("node:url");
  const lanceDirectement =
    process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
  if (lanceDirectement && process.argv.includes("--eprouver")) {
    const F = (demandeur, depots, fin = "13:21") => ({ demandeur, depots, fin });
    const cas = [];
    const juge = (dit, obtenu, attendu) =>
      cas.push({ dit, obtenu, attendu, ok: obtenu === attendu });

    // Le cas réel du 2026-08-25 à 13:11.
    juge(
      "un voisin qui me nomme dans ses dépôts me gèle",
      geleParUnVoisin([F("runtime-in", ["bpscript", "kanopi", "hub"])], "kanopi") !== null,
      true,
    );
    // ⛔ TÉMOIN INVERSE — sans lui, une fonction qui rendrait TOUJOURS une raison passerait le cas
    // précédent, et mon arme ne tirerait plus jamais.
    juge(
      "un voisin qui ne me nomme PAS ne me gèle pas",
      geleParUnVoisin([F("runtime-in", ["bpscript", "hub"])], "kanopi"),
      null,
    );
    // ⚠️ MA PROPRE FENÊTRE : je me nomme forcément dans mes gelés ? Non — mais si un jour c était le
    // cas, m interdire de tirer pendant ma propre campagne serait la régression exacte.
    juge(
      "ma propre fenêtre ne me gèle pas, même si je m y nomme",
      geleParUnVoisin([F("kanopi", ["kanopi", "kronos"])], "kanopi"),
      null,
    );
    // La casse ne doit pas décider : la tour n impose aucune convention sur le nom des dépôts.
    juge(
      "la casse ne fait pas échapper au gel",
      geleParUnVoisin([F("Runtime-IN", ["KANOPI"])], "kanopi") !== null,
      true,
    );
    // ⛔ LE REPLI QUAND JE N AI PAS PU LIRE — les deux sens, parce que le bon repli diffère.
    juge(
      "une tour VIVANTE que je n ai pas su lire me REFUSE le tir",
      repliDeLectureImpossible(true, "son outil a ÉCHOUÉ", "drapeau non implémenté : --json") !== null,
      true,
    );
    juge(
      "une tour ABSENTE ne m interdit RIEN (témoin inverse — sinon un dépôt isolé est impoussable)",
      repliDeLectureImpossible(false, "son outil a ÉCHOUÉ", "drapeau non implémenté : --json"),
      null,
    );
    juge(
      "le refus PORTE la cause rendue par la tour, il ne la perd pas",
      /--json/.test(repliDeLectureImpossible(true, "son outil a ÉCHOUÉ", "drapeau non implémenté : --json") ?? ""),
      true,
    );
    // Une fenêtre sans liste gèle tout le monde.
    juge(
      "une fenêtre sans liste de dépôts me gèle aussi",
      geleParUnVoisin([F("bpx", [])], "kanopi") !== null,
      true,
    );
    // ⛔ L HEURE EST RENDUE EN LOCAL, PAS EN UTC BRUT. Le champ de la tour est en UTC ; rendu tel
    // quel il annonçait deux heures d écart avec le reste de la phrase.
    juge(
      "l heure de fin est rendue en LOCAL, pas en UTC brut",
      /jusqu'à \d\d:\d\d:\d\d /.test(
        geleParUnVoisin([F("runtime-in", ["kanopi"], "2026-08-25T13:56:19.822Z")], "kanopi") ?? "",
      ),
      true,
    );
    // TÉMOIN INVERSE — une heure illisible ne doit pas faire perdre le refus.
    juge(
      "une heure illisible ne bloque pas le refus",
      geleParUnVoisin([F("runtime-in", ["kanopi"], "pas-une-date")], "kanopi") !== null,
      true,
    );

    // Aucune fenêtre : le cas nominal, et il doit laisser passer.
    juge("aucune fenêtre ouverte : je peux tirer", geleParUnVoisin([], "kanopi"), null);
    // ⛔ CE CAS PORTAIT UN TITRE QUI ÉNONÇAIT UNE POLITIQUE, ET LA POLITIQUE A CHANGÉ. Il disait
    // « une réponse illisible de la tour ne bloque pas le tir » — c est FAUX depuis le 2026-08-31 :
    // une tour VIVANTE dont je ne sais pas lire la réponse me refuse le tir (voir
    // `repliDeLectureImpossible`). Ce que ce cas mesure réellement, et qui reste vrai, est plus
    // étroit : CETTE fonction-ci ne juge que des fenêtres, elle ne décide pas du repli. C est
    // l APPELANT qui écarte une réponse non tabulaire avant de l atteindre.
    juge(
      "cette fonction ne PLANTE pas sur une entrée non tabulaire — elle ne décide pas du repli",
      geleParUnVoisin(null, "kanopi"),
      null,
    );

    let echecs = 0;
    for (const c of cas) {
      if (!c.ok) echecs++;
      console.log(
        `${c.ok ? "✓" : "✗"} ${c.dit}` +
          (c.ok ? "" : `\n    obtenu ${JSON.stringify(c.obtenu)}, attendu ${JSON.stringify(c.attendu)}`),
      );
    }
    const PLANCHER = 9;
    if (cas.length < PLANCHER) {
      console.error(`⛔ ${cas.length} cas éprouvés, ${PLANCHER} attendus — l épreuve ne distingue plus rien.`);
      process.exit(1);
    }
    console.log(
      `${echecs === 0 ? "PASS" : "FAIL"} gel-recu — ${cas.length} cas éprouvés, ${echecs} échec(s).`,
    );
    process.exit(echecs ? 1 : 0);
  }
}
