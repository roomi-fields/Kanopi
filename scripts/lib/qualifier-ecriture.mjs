#!/usr/bin/env node
// ⛔ CE QUI SÉPARE UN GEL ROMPU D'UN ARBRE TROP FRAIS — et pourquoi cette fonction vit à part.
//
// Une écriture voisine récente ferme ma fenêtre de campagne pour DEUX raisons opposées :
//   • elle est postérieure à mon ouverture — la borne était posée, le gel est rompu ;
//   • elle est antérieure à mon ouverture — le voisin n'avait rien à respecter, et ce qui ferme
//     est MON exigence de calme, pas son geste.
//
// Le 2026-08-25, deux annulations à une demi-heure d'écart ont porté la MÊME phrase pour ces deux
// cas. kronos s'est défendu d'une faute que personne ne lui reprochait et s'est attribué le coût
// d'une campagne perdue ; bp3-frontend l'a vu avant nous deux. La donnée qui tranche — l'heure
// d'ouverture — était dans mon processus et n'entrait pas dans la phrase.
//
// ⛔ ELLE EST PURE ET SÉPARÉE POUR ÊTRE ÉPROUVÉE PAR INJECTION. Dans `tir-arme.mjs` elle serait
// prisonnière d'une boucle qui démarre à l'import, donc invérifiable autrement qu'en tirant — et
// un mécanisme qu'on n'a pas vu mordre est une hypothèse. `--eprouver` rejoue les quatre cas.

/**
 * La raison, qualifiée, d'une écriture qui ferme la fenêtre.
 *
 * @param nom      le voisin, tel que la tour le connaît
 * @param quand    l'instant de sa dernière écriture (ms)
 * @param quoi     le fichier concerné, relatif à sa racine
 * @param ouverteA l'instant d'ouverture de MA fenêtre (ms), ou `null` si aucune n'est ouverte
 * @param calmeMs  le calme que j'exige avant de partir
 * @param hh       le formateur d'heure, injecté pour que l'épreuve ne dépende d'aucun fuseau
 */
export function qualifierEcriture(nom, quand, quoi, ouverteA, calmeMs, hh) {
  const base = `${nom} a écrit à ${hh(new Date(quand))} (${quoi})`;
  // Aucune fenêtre : personne n'est gelé, il n'y a rien à qualifier — et prétendre le contraire
  // serait l'erreur symétrique de celle qu'on répare.
  if (ouverteA === null) return base;
  if (quand >= ouverteA)
    return `${base} — PENDANT le gel, ouvert à ${hh(new Date(ouverteA))} : la borne était posée`;
  return (
    `${base} — AVANT l'ouverture de ${hh(new Date(ouverteA))} : arbre trop frais pour ` +
    `mes ${calmeMs / 1000} s de calme, aucun geste de sa part n'est en cause`
  );
}

// ── L'ÉPREUVE ────────────────────────────────────────────────────────────────────────────────
// Quatre cas, écrits à la main : les deux qui séparent, le cas sans fenêtre, et le cas LIMITE
// (écriture exactement à l'ouverture) — qui doit tomber du côté du gel, sinon la seconde qui suit
// l'ouverture passerait pour innocente.
// ⛔ LE MODULE NE S'ÉPROUVE QUE LANCÉ DIRECTEMENT — comparé sur son URL, jamais sur son nom de
// fichier : deux fichiers homonymes dans deux dossiers rendraient la même fin de chemin.
{
  const { pathToFileURL } = await import("node:url");
  const lanceDirectement =
    process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
  if (lanceDirectement && process.argv.includes("--eprouver")) {
    const hh = (d) => d.toISOString().slice(11, 19);
    const OUVERT = 1_000_000;
    const cas = [
      {
        dit: "écriture 45 s APRÈS l'ouverture → gel rompu",
        r: qualifierEcriture("kronos", OUVERT + 45_000, "dist/x.js", OUVERT, 150_000, hh),
        attendu: /PENDANT le gel/,
        refuse: /AVANT l'ouverture/,
      },
      {
        dit: "écriture 67 s AVANT l'ouverture → arbre frais, personne en cause",
        r: qualifierEcriture("kronos", OUVERT - 67_000, "dist/x.js", OUVERT, 150_000, hh),
        attendu: /AVANT l'ouverture .* aucun geste de sa part n'est en cause/,
        refuse: /PENDANT le gel/,
      },
      {
        dit: "aucune fenêtre ouverte → aucune qualification",
        r: qualifierEcriture("kairos", OUVERT, "dist/x.js", null, 150_000, hh),
        attendu: /^kairos a écrit à \d\d:\d\d:\d\d \(dist\/x\.js\)$/,
        refuse: /PENDANT|AVANT/,
      },
      {
        dit: "écriture À LA SECONDE de l'ouverture → comptée PENDANT",
        r: qualifierEcriture("bpx", OUVERT, "dist/x.js", OUVERT, 150_000, hh),
        attendu: /PENDANT le gel/,
        refuse: /AVANT l'ouverture/,
      },
    ];
    let echecs = 0;
    for (const c of cas) {
      const ok = c.attendu.test(c.r) && !c.refuse.test(c.r);
      if (!ok) echecs++;
      console.log(`${ok ? "✓" : "✗"} ${c.dit}\n    ${c.r}`);
    }
    // Un garde compte ce qu'il a examiné et refuse d'avoir examiné zéro.
    if (cas.length < 4) {
      console.error("⛔ moins de quatre cas éprouvés — l'épreuve ne distingue plus rien.");
      process.exit(1);
    }
    console.log(
      `${echecs === 0 ? "PASS" : "FAIL"} qualifier-ecriture — ${cas.length} cas éprouvés, ${echecs} échec(s).`,
    );
    process.exit(echecs ? 1 : 0);
  }
}
