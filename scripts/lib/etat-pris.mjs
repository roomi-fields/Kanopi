// ⛔ CE QUE JE PRENDS CHEZ CHAQUE VOISIN, MESURÉ — la lecture que la déclaration confronte.
//
// La déclaration vit dans `regimes-des-voisins.json`, clé `etat-pris`. Ce fichier-ci ne déclare
// rien : il MESURE, et il rend un état NOMMABLE ou l'absence de nom. La différence porte tout le
// poids — un état non nommable arrête le garde AVANT qu'il lise, au lieu de lui faire rendre un
// verdict nu (pièce de runtime-in, versée au patron le 2026-08-24 : « sans elle, la déclaration
// est un ornement qui disparaît le jour où elle sert »).
//
// ⛔ LE LIEN BRUT ET LA CIBLE RÉSOLUE SONT DEUX FAITS DISTINCTS, et c'est le cœur de la pièce.
// `realpath` d'un lien qui vise une référence mouvante rend aujourd'hui un état fixe : il montre
// où je suis, jamais si j'y reste. Mesuré le 2026-08-24 sur runtime-osc — onze publications dans
// la journée, cinq en vingt-huit minutes, et `.paquets/runtime-osc` a suivi chacune. Un relevé
// qui ne lit que la cible résolue déclare « épinglé sur 1ab82e3 » un lien qui bascule à la
// publication suivante. C'est pour cela que `viseUneReferenceMouvante` se lit sur `readlink`.

import {
  readlinkSync,
  lstatSync,
  realpathSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join, basename, dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { voisinsLies } from "./voisins-lies.mjs";

/** Les bases où npm pose les liens de voisins, du plus général au plus proche. */
const BASES = ["node_modules", "packages/ui/node_modules"];

/** Le lien symbolique qui porte ce spécificateur, non résolu. `null` si aucun. */
function lienBrut(racine, specificateur) {
  for (const base of BASES) {
    const p = join(racine, base, specificateur);
    try {
      if (lstatSync(p).isSymbolicLink())
        return { chemin: p, cible: readlinkSync(p) };
    } catch {
      /* absent à ce niveau : on essaie le suivant */
    }
  }
  return null;
}

/**
 * Un paquet publié se nomme `<nom>-<empreinte>` et vit à côté d'une référence `<nom>` qui le
 * désigne. L'empreinte est ce qui se rejoue ; le nom nu est ce qui bouge.
 */
function empreinteDuDossier(chemin) {
  const m = /^(.+)-([0-9a-f]{7,40})$/.exec(basename(chemin));
  return m ? { paquet: m[1], empreinte: m[2] } : null;
}

/**
 * L'état PRIS chez un voisin, tel qu'il est aujourd'hui.
 *
 * Rend, pour chaque lien : la voie empruntée (`paquet` ou `source`), l'état nommable (une
 * empreinte de paquet, ou une tête de dépôt), et — pour un paquet — si le lien vise une
 * référence MOUVANTE. `nommable: false` dit qu'aucun tiers ne peut rejouer cet état, et c'est ce
 * qui doit arrêter un garde.
 */
export function etatPrisReel(racine) {
  racine = realpathSync(racine.replace(/\/+$/, ""));
  const out = [];
  for (const v of voisinsLies(racine)) {
    const nom = v.specificateurs[0];
    const brut = lienBrut(racine, nom);
    const paquet = empreinteDuDossier(v.chemin);

    if (paquet) {
      // La cible du lien, telle qu'écrite : si elle ne porte pas d'empreinte, elle vise la
      // référence mouvante et le paquet résolu changera sans qu'un fichier bouge ici.
      const viseMouvant = brut ? empreinteDuDossier(brut.cible) === null : true;
      // La référence mouvante voisine dit ce qui est publié EN DERNIER — la seule façon de
      // savoir qu'un épinglage a pris du retard, et de le dire au lieu de le taire.
      const reference = join(dirname(v.chemin), paquet.paquet);
      const dernier = existsSync(reference)
        ? empreinteDuDossier(realpathSync(reference))
        : null;
      out.push({
        nom,
        voie: "paquet",
        etat: paquet.empreinte,
        nommable: true,
        viseUneReferenceMouvante: viseMouvant,
        cibleEcrite: brut?.cible ?? null,
        dernierPublie: dernier?.empreinte ?? null,
        chemin: v.chemin,
      });
      continue;
    }

    // Une source vive : l'état nommable est sa tête. Un dépôt hors git n'en a pas, et c'est
    // exactement le cas où « déclarer » n'a plus de contenu — il se dit, il ne se contourne pas.
    //
    // ⛔ MAIS « DANS SON DÉPÔT » N'EST PAS « SA SOURCE ». Mesuré le 2026-08-25 : trois de mes onze
    // voisins résolvent vers leur `dist/` — une racine CONSTRUITE, dans leur arbre de travail. Ma
    // déclaration les disait « source », et c'était faux dans la pièce même qui existe pour que
    // personne ne subisse son état sans le déclarer.
    // ⇒ LA CASE A ÉTÉ NOMMÉE PAR KRONOS LA MÊME NUIT — `porte + racine construite, dans l'arbre` :
    //   la frappe du voisin sous `src/` ne m'atteint pas, sa RECONSTRUCTION m'atteint immédiatement,
    //   et sa poussée n'a rien à voir avec le moment. Un moment de plus, invisible aux deux autres.
    // ⇒ LA VOIE SE DÉRIVE DE CE QUI EST RÉSOLU, jamais du dépôt où le lien atterrit.
    out.push({
      nom,
      voie: voieResolue(racine, nom),
      etat: v.tete,
      nommable: v.tete !== null,
      viseUneReferenceMouvante: false,
      cibleEcrite: brut?.cible ?? null,
      dernierPublie: null,
      chemin: v.chemin,
      modifiesDansLePaquet: v.modifications.filter((m) => m.atteintLeBuild).length,
    });
  }
  return out.sort((a, b) => a.nom.localeCompare(b.nom));
}

/**
 * ⛔ LA VOIE, DÉRIVÉE DE LA RÉSOLUTION RÉELLE — jamais de la forme du chemin ni du dépôt d'arrivée.
 *
 * Trois natures, et la deuxième manquait : `source` (son `src/`), `construit` (son `dist/`, dans son
 * arbre), `paquet` (un dossier immuable hors arbre). ⇒ Les deux premières vivent dans le MÊME dépôt
 * et n'ont pas le même moment : ce qui bascule une source est une sauvegarde, ce qui bascule un
 * `dist` est une CONSTRUCTION.
 *
 * La résolution se prend dans les conditions de la PRODUCTION : c'est ce qui part à l'utilisateur.
 */
function voieResolue(racine, specificateur) {
  try {
    const chemin = execFileSync(
      process.execPath,
      [
        "--conditions", "browser", "--conditions", "production",
        "--input-type=module",
        "-e", `process.stdout.write(import.meta.resolve(${JSON.stringify(specificateur)}))`,
      ],
      { cwd: join(racine, "packages", "ui"), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).replace("file://", "");
    if (/\/\.paquets\//.test(chemin)) return "paquet";
    if (/\/dist(-types)?\//.test(chemin)) return "construit";
    return "source";
  } catch {
    // ⛔ UNE RÉSOLUTION QUI ÉCHOUE NE SE REPLIE PAS SUR « SOURCE » : ce serait rendre la valeur la
    // plus fréquente sous couvert de mesure, et le garde ne verrait jamais la panne.
    return null;
  }
}

/** La déclaration, lue depuis le registre unique des régimes. */
export function declarationDeLEtatPris(racine) {
  const chemin = resolve(racine, "scripts", "lib", "regimes-des-voisins.json");
  const registre = JSON.parse(readFileSync(chemin, "utf8"));
  return registre["etat-pris"] ?? {};
}

/** Les trois étages déclarables. Un quatrième mot n'est pas une nuance, c'est une faute de saisie. */
export const ETAGES = new Set(["épinglé", "nommé", "rien-pris"]);

/**
 * LA CONFRONTATION, PURE — la déclaration contre ce qui est pris.
 *
 * ⛔ ELLE EST SÉPARÉE DE LA LECTURE DU DISQUE POUR UNE SEULE RAISON : un garde qu'on n'a pas vu
 * mordre par injection est une hypothèse, et injecter dans le disque d'un voisin serait faire la
 * chose que ce garde existe pour voir. Séparée, elle s'éprouve sur des cas écrits à la main —
 * donc indépendants de ce qu'elle mesure, là où des cas dérivés du réel feraient d'elle son
 * propre juge.
 *
 * Rend `{ echecs, rapport, examines }`. Un échec est une phrase entière : elle nomme le voisin,
 * ce qu'il prend, et LA COMMANDE qui lève le rouge — d'une somme de contrôle on ne tire rien.
 */
export function confronter(declaration, reel) {
  const echecs = [];
  const rapport = [];
  let examines = 0;
  const parNom = new Map(reel.map((e) => [e.nom, e]));

  // ⛔ LE VERROU DANS L'AUTRE SENS : une entrée qui ne décrit plus rien couvrirait la réapparition
  // suivante — même raison que la dette de consommation en source, dans le même registre.
  for (const nom of Object.keys(declaration)) {
    if (!parNom.has(nom))
      echecs.push(
        `« ${nom} » est déclaré et n'est plus lié — la déclaration ne décrit plus rien. ` +
          `Retire son entrée de scripts/lib/regimes-des-voisins.json.`,
      );
  }

  for (const e of reel) {
    const d = declaration[e.nom];

    // ⛔ LE SILENCE EST LA SEULE CHOSE INTERDITE. Un voisin lié non déclaré n'est pas « conforme
    // faute de règle » : il est exactement le cas que cette pièce existe pour fermer.
    if (!d) {
      echecs.push(
        `« ${e.nom} » est lié et n'est DÉCLARÉ nulle part — il prend aujourd'hui ${e.voie} ` +
          `${e.etat ?? "(état non nommable)"}. Inscris-le sous « etat-pris » : « épinglé » ` +
          `(stabilité), « nommé » (suivre le dernier), ou « rien-pris » (je ne prends rien par ` +
          `cette porte, et je le dis).`,
      );
      continue;
    }
    if (!ETAGES.has(d.etage)) {
      echecs.push(
        `« ${e.nom} » déclare l'étage « ${d.etage} », qui n'existe pas. Les trois : ` +
          `${[...ETAGES].join(" · ")}.`,
      );
      continue;
    }
    examines++;

    // ⛔ LA VOIE DÉCLARÉE SE CONFRONTE À LA VOIE MESURÉE — sans ça, ma déclaration ment sans rougir,
    // et c'est le défaut exact que cette pièce existe pour fermer. Mesuré le 2026-08-25 : trois de
    // mes voisins étaient déclarés « source » alors que je résous leur `dist`. Une déclaration qu'on
    // écrit une fois et que rien ne confronte devient un ornement, comme l'état qu'on subit.
    if (d.etage !== "rien-pris" && e.voie === null) {
      echecs.push(
        `« ${e.nom} » : la RÉSOLUTION a échoué — je ne peux pas dire par quelle voie je l'atteins. ` +
          `Rien ne se déclare là-dessus : une voie qu'on ne mesure pas se replierait sur la plus ` +
          `fréquente et le garde ne verrait jamais la panne.`,
      );
      continue;
    }
    if (d.etage !== "rien-pris" && d.voie !== undefined && d.voie !== e.voie) {
      echecs.push(
        `« ${e.nom} » est déclaré sur la voie « ${d.voie} » et je résous « ${e.voie} ». ` +
          (e.voie === "construit"
            ? `⇒ Une racine CONSTRUITE dans son arbre n'est ni sa source ni un paquet : sa frappe ` +
              `sous \`src/\` ne m'atteint pas, sa RECONSTRUCTION m'atteint immédiatement, et sa ` +
              `poussée n'a rien à voir avec le moment. `
            : "") +
          `Corrige la déclaration, ou le lien.`,
      );
      continue;
    }

    // ⛔ UN ÉTAT NON NOMMABLE ARRÊTE LE GARDE AVANT QU'IL LISE — pièce de runtime-in, versée au
    // patron le 2026-08-24. Rendre un verdict sur un état qu'aucun tiers ne peut rejouer, c'est
    // publier un vert qui ne se vérifie pas : « sans elle, la déclaration est un ornement qui
    // disparaît le jour où elle sert. »
    if (d.etage !== "rien-pris" && !e.nommable) {
      echecs.push(
        `« ${e.nom} » prend un état NON NOMMABLE — ${e.chemin} n'a ni empreinte de paquet ni tête ` +
          `de dépôt. Personne, moi compris, ne peut rejouer ce que j'exécute. Rien ne se déclare ` +
          `là-dessus tant que la cible n'a pas d'état lisible.`,
      );
      continue;
    }

    if (d.etage === "rien-pris") {
      rapport.push(`${e.nom} : RIEN PRIS par cette porte, déclaré le ${d.le}`);
      continue;
    }

    if (d.etage === "nommé") {
      // Nommer, c'est imprimer ce qu'on a lu : la ligne EST la conformité, pas un ornement.
      const sale = e.modifiesDansLePaquet
        ? ` ⚠ ${e.modifiesDansLePaquet} fichier(s) non enregistré(s) DANS le paquet`
        : "";
      rapport.push(`${e.nom} : NOMMÉ — ${e.voie} ${e.etat}${sale}`);
      continue;
    }

    // `épinglé` — deux façons de ne pas l'être, et la première ne se voit pas sur la cible résolue.
    if (e.viseUneReferenceMouvante) {
      echecs.push(
        `« ${e.nom} » se déclare ÉPINGLÉ et son lien vise une référence MOUVANTE ` +
          `(${e.cibleEcrite ?? "cible illisible"}). Il résout ${e.etat} aujourd'hui et un autre ` +
          `état à la publication suivante, sans qu'un fichier bouge ici. ⇒ « npm run repointer » ` +
          `repose le lien sur l'état déclaré.`,
      );
      continue;
    }
    if (e.etat !== d.empreinte) {
      echecs.push(
        `« ${e.nom} » est déclaré épinglé sur ${d.empreinte} et résout ${e.etat} — j'exécute un ` +
          `état que je n'ai pas choisi. ⇒ « npm run repointer » repose le lien sur ${d.empreinte} ; ` +
          `« npm run repointer -- --dernier ${e.nom} » prend le dernier publié et réécrit la ` +
          `déclaration.`,
      );
      continue;
    }

    // Épinglé et tenu. ⛔ LE RETARD EST LÉGITIME ET IL EST DIT, JAMAIS TU : c'est le prix de la
    // stabilité, choisi. Le faire échouer rendrait l'épinglage inutilisable et ramènerait au lien
    // mouvant — soit exactement la régression. Ce qui doit échouer, c'est de NE PAS SAVOIR.
    const retard =
      e.dernierPublie && e.dernierPublie !== e.etat
        ? ` ⚠ EN RETARD : le dernier publié est ${e.dernierPublie}. C'est le prix de la ` +
          `stabilité ; il se lève par « npm run repointer -- --dernier ${e.nom} ».`
        : "";
    rapport.push(`${e.nom} : ÉPINGLÉ sur ${d.empreinte}, tenu${retard}`);
  }

  return { echecs, rapport, examines };
}
