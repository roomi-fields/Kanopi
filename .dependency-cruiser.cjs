/** Garde d'architecture Kanopi — vérifié par MACHINE, branché au gate (`npm run arch`).
 *
 *  Principe : Kanopi est l'HÔTE. Il ne résout / compose / rend RIEN (cf.
 *  hub/contrats/kanopi-architecture.md, loi n°2). Le flux métier est
 *  BPx → Kairos → Kronos → runtimes. Ici on encode les règles STRUCTURELLES
 *  (qui dépend de qui) que la machine peut trancher sans jugement humain — une
 *  règle par invariant d'architecture. La conformité SÉMANTIQUE (« la valeur est
 *  juste », « l'hôte n'invente rien ») reste la relecture de Romain sur la carte.
 *
 *  Crawl : SOURCE Kanopi uniquement (ui + core + library). Les paquets amont
 *  (@kronos/core, @kairos/core, bpx, bp3-frontend, runtime-*) sont OPAQUES :
 *  `doNotFollow` les laisse en feuilles → on voit « Kanopi → X » sans entrer
 *  dans X. C'est la frontière du dépôt.
 */
const { readFileSync, realpathSync } = require("node:fs");
const { relative, join } = require("node:path");

/** Les points d'entrée PUBLIÉS d'un paquet runtime, DÉRIVÉS de son `exports`/`main`
 *  — jamais recopiés ici. Rendus tels que dependency-cruiser les résout : chemin
 *  relatif à CE dépôt, en passant par le lien npm (dont la casse du dossier frère
 *  diffère du nom de paquet : `runtime-osc` → `../runtime-OSC`). */
function entreesPubliees(nomPaquet) {
  const racine = realpathSync(join(__dirname, "node_modules", nomPaquet));
  const pkg = JSON.parse(readFileSync(join(racine, "package.json"), "utf8"));
  const cibles = new Set();
  const visiter = (v) => {
    if (typeof v === "string") cibles.add(v.replace(/^\.\//, ""));
    else if (v && typeof v === "object") Object.values(v).forEach(visiter);
  };
  visiter(pkg.exports);
  if (typeof pkg.main === "string") cibles.add(pkg.main.replace(/^\.\//, ""));
  const prefixe = relative(__dirname, racine);
  return [...cibles].map((c) => join(prefixe, c));
}

const RUNTIMES = ["runtime-audio", "runtime-midi", "runtime-osc", "runtime-codevoices"];
const ENTREES_RUNTIMES = RUNTIMES.flatMap(entreesPubliees);

/** Les INTERNES des mêmes paquets, sous LES DEUX formes que dependency-cruiser peut
 *  rendre — parce qu'un import d'interne, justement, ne résout PAS : l'`exports` du
 *  voisin ne publie pas ses entrailles, donc le module reste le spécificateur NU
 *  (`runtime-midi/src/…`). Un motif qui n'attendrait que le chemin résolu laisserait
 *  passer le seul cas contre lequel cette règle existe. Et le chemin résolu, lui, porte
 *  la casse du dossier frère (`runtime-midi` → `../runtime-MIDI`), que le nom de paquet
 *  ne dit pas. Les deux formes sont dérivées du lien npm, aucune n'est listée à la main. */
const INTERNES_RUNTIMES =
  "(" +
  [
    ...RUNTIMES,
    ...RUNTIMES.map((n) => relative(__dirname, realpathSync(join(__dirname, "node_modules", n)))),
  ]
    .map((p) => p.replace(/\./g, "\\."))
    .join("|") +
  ")/(src|dist|lib)/";

module.exports = {
  forbidden: [
    {
      // WARN (non bloquant) pendant l'assainissement : 8 cycles internes préexistants
      // (bpx-adapter↔registry, core-real↔clock, blocks↔playback…) = écart C6 du
      // contrat-DRAFT, à résorber. Visible à chaque `npm run arch`, ne casse pas le
      // gate. À repasser en `error` une fois les cycles cassés.
      name: "no-circular",
      severity: "warn",
      comment: "Pas de cycle de dépendance (couplage / couches mal séparées).",
      from: {},
      to: { circular: true },
    },
    {
      name: "pas-de-resolveur-hauteur-dans-hote",
      severity: "error",
      comment:
        "Kanopi ne résout PAS la hauteur (KAI-10 : résolution chez Kairos). " +
        "Aucun module Kanopi ne doit importer un résolveur de hauteur amont " +
        "(@kronos/core/pitch, bpx/.../pitch, .../resolver). La hauteur arrive " +
        "déjà gravée sur l’arbre (content.pitch.hz) — on la LIT, on ne la calcule pas.",
      from: { path: "^packages/(ui|core|library)/src" },
      to: { path: "(/pitch(/|$)|pitch-resolver|/resolver(\\.|/))" },
    },
    {
      // §Garde 4 du contrat hote-runtimes-sortie.md. L'hôte n'importe des paquets runtime
      // QUE leur adaptateur d'entrée — JAMAIS leurs internes (`.../src|dist|lib/...`).
      // Le point d'entrée d'un paquet VIT dans son `src/` : il faut donc l'exempter, sinon
      // chaque import légitime est compté. L'exemption est DÉRIVÉE de l'`exports` du voisin
      // (ENTREES_RUNTIMES), jamais listée à la main — un voisin qui déplace son entrée la
      // déplace ici du même geste.
      name: "hote-n-importe-que-l-adaptateur-runtime",
      severity: "error",
      comment:
        "Frontière hôte↔runtimes (§Garde 4) : importer l'ADAPTATEUR d'un paquet runtime, " +
        "jamais ses internes (src/dist/lib). La mise en forme vit DANS la runtime.",
      from: { path: "^packages/(ui|core)/src" },
      to: {
        path: INTERNES_RUNTIMES,
        pathNot: ENTREES_RUNTIMES.map((e) => `^${e.replace(/\./g, "\\.")}$`).join("|"),
      },
    },
  ],
  options: {
    tsConfig: { fileName: "tsconfig.arch.json" },
    // Frontière du dépôt : on ne suit PAS dans les paquets amont (résolus en
    // dépôts frères via les deps `file:`). Ils apparaissent en BOÎTES OPAQUES
    // (le point d'entrée que Kanopi touche), jamais dépliés.
    doNotFollow: {
      path: [
        "node_modules",
        "\\.\\./(kronos|kairos|BPx|BPscript|bp3-frontend|runtime-)",
      ],
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["browser", "import", "require", "node", "default"],
    },
    exclude: { path: "node_modules" },
  },
};
