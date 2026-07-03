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
      // §Garde 4 du contrat hote-runtimes-sortie.md — MODE MESURE (info, ne bloque pas encore ;
      // passe en `error` en Phase 3). L'hôte n'importe des paquets runtime QUE leur adaptateur
      // d'entrée (`runtime-audio`, `runtime-midi`, `runtime-osc/browser`, `runtime-codevoices`) —
      // JAMAIS leurs internes (`.../src|dist|lib/...`). Lit 0 aujourd'hui (l'hôte passe par les
      // entrées) : garde PRÉVENTIF contre une future colonisation par sous-chemin.
      name: "hote-n-importe-que-l-adaptateur-runtime",
      severity: "info",
      comment:
        "Frontière hôte↔runtimes (§Garde 4) : importer l'ADAPTATEUR d'un paquet runtime, " +
        "jamais ses internes (src/dist/lib). La mise en forme vit DANS la runtime.",
      from: { path: "^packages/(ui|core)/src" },
      to: { path: "runtime-(audio|midi|osc|codevoices)/(src|dist|lib)/" },
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
    exclude: { path: "node_modules" },
  },
};
