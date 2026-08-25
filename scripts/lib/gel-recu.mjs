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
      `${demandeur} me gèle jusqu'à ${f?.fin ?? "?"} — ma poussée serait REFUSÉE, ` +
      `et onze dépôts gelés pour rien`
    );
  }
  return null;
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
    // Une fenêtre sans liste gèle tout le monde.
    juge(
      "une fenêtre sans liste de dépôts me gèle aussi",
      geleParUnVoisin([F("bpx", [])], "kanopi") !== null,
      true,
    );
    // Aucune fenêtre : le cas nominal, et il doit laisser passer.
    juge("aucune fenêtre ouverte : je peux tirer", geleParUnVoisin([], "kanopi"), null);
    // Une tour muette rend autre chose qu un tableau — on ne se bloque pas là-dessus.
    juge(
      "une réponse illisible de la tour ne bloque pas le tir",
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
    const PLANCHER = 7;
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
