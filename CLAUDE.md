# Kanopi — Claude project instructions

## ⛔ Chercher — l'ordre, sans exception

1. **RTFM** (`rtfm_search` puis `rtfm_expand`) pour toute recherche de doc.
2. **codegraph** (`codegraph explore "<question|symbole>"`) avant tout grep, find ou lecture de code.
3. **La carte d'autorités d'Atlas** (`atlas/carte-autorites/`) pour « où vit l'autorité sur X ? ».
4. Le **fichier de référence** qu'elle désigne.
5. **Demander à Atlas** quand l'information reste introuvable.

Ne jamais conclure qu'une information n'existe pas : ne pas trouver renseigne sur la recherche, pas
sur le monde.

## ⛔⛔ Trancher un comportement : « comment ça fonctionne en BP3 natif ? »

Toute question de **comportement, de fonction ou de primitive** se tranche d'abord sur le **moteur
natif BP3**. On couvre **a minima ce que fait le natif**, sauf dérogation explicite de Romain.

## ⛔⛔⛔ Le langage ne se définit pas sans Romain

`BPscript/docs/spec/LANGUAGE.md` est la bible du langage.

- **IMPORTANT : interdiction formelle d'y écrire** sans autorisation explicite de Romain, pour le
  geste précis. Un arbitrage de sa part sur le langage n'autorise pas à écrire dans le fichier.
- **IMPORTANT : interdiction formelle de définir un élément de langage** sans son autorisation.
- Un écart entre le code et la bible **se signale avec sa pièce** — `fichier:ligne` des deux côtés —
  et attend son mot.

## ⛔ Carte d'autorités — toute modification se signale

Toute modification d'un document de la carte d'autorités est **systématiquement signalée et reportée
à Romain**. Leur **mise en conformité est un objectif permanent**.

## ⛔ Migrer casse, et on répare

Remplacer X par Y = **supprimer X dans le même mouvement**. On migre, **on regarde où ça casse, on
répare**. Aucune solution intermédiaire, aucune voie parallèle, aucune migration « sans casse ».

## ⛔ Coder

- **Le code mort s'élague** dans le mouvement qui le rend mort. Une branche sans appelant vivant sort.
- **La librairie d'abord** : ce qui peut se déclarer ou se retrouver en librairie y vit. Une valeur
  écrite en dur dans le code est invisible — personne ne peut la lire ni la surcharger.
- **Les commentaires sont utiles et proportionnés** : ils disent ce que le code ne montre pas.

## ⛔ Écrire un document

- **Descriptif et factuel** : le document décrit **ce qui est**, dans son état d'aujourd'hui.
- **Affirmatif** : on décrit l'objet. La forme négative — « ce n'est pas », « au lieu de », « sans » —
  se réécrit en énoncé positif.
- **Sans justification narrative** : ni « untel a dit », ni « parce que », ni date, ni renvoi à une
  décision, ni contraste avec une forme antérieure. Le pourquoi vit dans sa décision datée.

**Test avant d'écrire une phrase** : un lecteur qui découvre le sujet aujourd'hui y apprend-il
quelque chose ?

## ⛔ `LANGUAGE.md` est ma référence unique sur le langage

`BPscript/docs/spec/LANGUAGE.md` **est ce que le code doit dire** : un écart est un **défaut**,
jamais une préséance à arbitrer. `AST.md` et `EBNF.md` en sont des **dérivés**, jamais des autorités.


## What this is

Kanopi is the IDE product. BPscript is the optional native sequencer language (separate repo). BPx is the JS engine for BPscript (lives in bpscript repo). osc-bridge is the hardware sidecar (separate repo).

## ⚠️ CONFRONTER À RÉCEPTION via un ORACLE — norme dure (Romain, décision 2026-07-19)

**Tout ce que je REÇOIS — d'un agent OU de l'architecte — « X est vrai », « fais X parce que
Y », un routage, un cadrage — est une CLAME à MESURER, pas une instruction à appliquer.** Avant
d'agir OU de re-relayer, je confronte la clame à l'oracle du domaine, sur pièces
(`fichier:ligne` / commande+sortie). En une journée, 8 relais-sans-confronter ; la seule défense
qui a marché = le receveur a **mesuré** au lieu d'appliquer.

| La clame porte sur… | Oracle à interroger |
|---|---|
| une doc, un « où/quoi » documentaire | **RTFM** (`rtfm_search`/`rtfm_expand`) |
| la structure du code (X appelle Y ? existe ? route ?) | **codegraph** (`codegraph explore`) |
| le langage BPScript (syntaxe/forme canonique/sémantique) | **skill `bpscript-oracle`** (compilateur réel) |
| l'architecture / l'autorité (qui possède ? composant canonique ?) | **Atlas** (cartes d'autorité) |
| un arbitrage tranché (routage, forme, contrat) | **`hub/decisions/`** (décision datée fait foi) |

Ce n'est pas un garde-fou de plus en prose : c'est un **réflexe par défaut**. Un cadrage faux ne
doit jamais se propager de plus d'un saut. Vaut aussi pour CE mandat : le confronter à sa décision
avant de l'appliquer. Source : `hub/decisions/2026-07-19-confronter-via-oracle-et-restaurer-tous-les-guards.md`.

## ⚠️ INTERDICTION RÉTROCOMPAT — remplacer = supprimer dans le MÊME mouvement (Romain, ordre 2026-07-19)

**JAMAIS de migration douce, de voie de rétrocompat, de code « legacy au cas où / le temps de
migrer », de fallback, de voie parallèle.** Remplacer X par Y = **SUPPRIMER X dans le même
mouvement**. Cause de cauchemar récurrent : du code « voué au retrait » gardé en parallèle est
RÉUTILISÉ, fait ÉVOLUER, et des mesures tournent dessus = bifurcation silencieuse.

- Un code marqué legacy/deprecated/voué-au-retrait qui a **le moindre appelant vivant** n'est PAS
  en train d'être retiré = il est **réutilisé** = **INTERDIT**.
- **Suppression directe, pas d'inventaire-qui-attend** : migrer les appelants vers la VRAIE voie,
  supprimer le legacy, prouver la non-régression (gate vert), dans un seul chantier. Je possède ma
  boucle ; j'escalade UNIQUEMENT si une suppression exige une coordination cross-repo ou une vraie
  décision bloquante.
- **Copie de surface `.d.ts` à la main = voie parallèle INTERDITE** : défaut = single-source (importer
  le vrai type de l'amont), jamais recopier. Décisions :
  `hub/decisions/2026-07-19-confronter-via-oracle-et-restaurer-tous-les-guards.md` (amendée) +
  `hub/decisions/2026-07-19-copies-de-surface-cross-repo-single-source-ou-declaree-outillee.md`.
- **Enforcement** : un garde anti-rétrocompat au gate échoue si du code marqué legacy/deprecated a un
  appelant vivant (mordant prouvé par injection, comme le méta-garde anti-bypass).

## ⚠️ ON SE PRÉVIENT À LA MODIFICATION D'UNE SURFACE PARTAGÉE, PAS AU PUSH (Romain, 2026-07-29)

Une modification d'une **surface partagée** — nom de type d'un nœud d'arbre, champ de contrat,
signature exportée, graphie du langage — est **en production dès qu'elle atteint ce que le voisin
lit** ; le push ne fait que la rendre **irréversible**. Prévenir « avant de pousser » est souvent la
bonne précaution **au mauvais moment** : les voisins sont déjà rouges.

**LA FRONTIÈRE EST PAR USAGE, PAS PAR VOISIN.** ⛔ Ce paragraphe portait jusqu'au 2026-07-30 une
phrase FAUSSE — « les dépôts consomment la source l'un de l'autre, pas un paquet publié » — une
généralisation d'UN régime à tous. Elle n'a pas été corrigée pour la beauté du texte : une
**instruction** périmée ne se contente pas de laisser croire, elle **fait faire**, et celle-ci a
déjà fait publier sans préavis (constat BPx, qui l'avait aussi : « je n'ai pas oublié une règle,
j'avais chez moi une phrase qui me disait que ce cas n'existait pas »).

**MON CAS, MESURÉ le 2026-07-30 (`import.meta.resolve` hors condition `development`), pas déduit** :
- **Source en toute condition ⇒ leur FRAPPE m'atteint** — `bpscript` (`src/transpiler/` + les JSON
  de `lib/`), `bp3-frontend`, `runtime-audio`, `runtime-codevoices`, `runtime-in`, `runtime-midi`,
  `runtime-osc`, `runtime-ui`. Huit voisins : rien à publier, l'écriture suffit.
- **Les DEUX régimes à la fois ⇒ leur frappe ET leur publication** — `@kairos/core`, `@kronos/core`,
  `bpx`. Leur `exports` porte `development → ./src/index.ts` ET `import → ./dist/index.js` : mon
  serveur de dev **et mon portillon** (son `webServer` est un serveur de DEV) lisent leur **source**,
  mais ma construction de **production** résout leur **`dist`**.

**CE QUE CE DERNIER POINT IMPLIQUE, ET QU'IL NE FAUT PAS PERDRE** : mon portillon peut être VERT sur
la source de ces trois-là pendant que ce qui part à l'utilisateur est bâti sur leur `dist`. Un vert
de portillon ne dit donc rien de la fraîcheur de leur paquet construit.

**Et le préavis de PUBLICATION ne dépend pas de ce que je change** : le voisin ne l'attend pas pour
savoir *quoi* a bougé, mais pour **reposer son point de comparaison** avant que mon paquet change
sous ses bancs. Sans ce mot, il ne distingue plus « rien n'a bougé » de « je n'ai pas regardé » —
donc **un changement inoffensif est précisément celui qui produit ce faux négatif**. Prévenir même,
et surtout, quand je suis sûr que rien ne bouge, avec une **prédiction falsifiable**.

**Ne pas deviner de quel côté je suis, et ne pas inventorier d'une seule façon** : la mesure
ci-dessus vient de la résolution réelle, pas de la liste des `file:` du `package.json` — les deux ne
donnent pas la même réponse. Texte de référence, qui a bougé six fois le 2026-07-30 :
`hub/AGENT_WELCOME.md` (§ Discipline).

**Le geste** : dès que je touche une surface partagée, je préviens ses consommateurs — **avec les
sites à changer chez eux** — et je vérifie qu'ils ont basculé **AVANT** de pousser. Et l'ancien nom
**sort dans le même mouvement** : le garder en parallèle est la bifurcation interdite du 19/07
(§ ci-dessus).

**Ce qui a déclenché la règle, et ce n'est pas théorique** : un renommage poussé, `Unsupported RHS
element type` chez le voisin, trois bancs rouges et TOUTE LA CHAÎNE qui cesse de charger. La
précaution avait bien été annoncée — elle portait sur le push.

**Le corollaire qui me concerne en RÉCEPTION** : un rouge chez moi peut venir de l'arbre de travail
**non commité** d'un voisin. Avant de conclure « ma régression », discriminer contre son HEAD
(`git -C <repo> archive HEAD | tar -x -C <scratch>`) — déjà vu, 14 rouges qui n'étaient pas à moi.

Source : `hub/AGENT_WELCOME.md:36-46` (commit `6f8e0ca`) — vérifiée à l'oracle avant inscription.

## Architecture — LOI NON NÉGOCIABLE (lire AVANT de coder)

Contrats contraignants, à respecter sans dérogation (les contourner = bug, pas « choix sain ») :
- **`hub/contrats/kanopi-architecture.md`** — Kanopi ne détient **AUCUN état d'autorité** ;
  chaque store est une **projection** d'une source amont. Tout ce que l'hôte *invente* est un bug.
- **`hub/contrats/kronos-transport.md`** — le **temps, la position et l'état de transport
  appartiennent à Kronos**. Kanopi **émet des commandes** (`play/pause/stop/step/seek/tempo/loop`)
  et **lit** la position/état ; il ne tient ni compteur de position ni machine d'état.
- Étude : `hub/projets/archive/2026-06-22-design-frontiere-hote-moteur/README.md` (SOTA + openDAW). Cause des bugs
  passés : `hub/projets/archive/2026-06-22-audit-etat-kanopi/README.md`.

**Modèle (magnétophone)** : BPx = les bandes (contenu) · Kronos = la tête de lecture + le
mécanisme (temps/transport/position) · **Kanopi = les boutons + l'afficheur** (intention +
rendu) · runtimes = les sorties. Le magnétophone **ne fabrique rien**.

**Carte d'autorité** : position/transport → Kronos ; structure (acteurs/blocs/scène) → BPx
(scène compilée, jamais re-parsée du texte) ; fichiers → workspace réel (jamais auto-créés) ;
charge → opaque. Seul état mutable propre = la saisie utilisateur locale avant compilation.

**Anti-patterns INTERDITS** (à supprimer, pas à polir) : compteur de position maison ;
2ᵉ machine d'état de transport ; `$effect`/subscribe qui recopie un store dans un autre
(dériver ≠ synchroniser) ; blocs re-parsés du texte alimentant la lecture ; `active` fabriqué
côté hôte ; auto-création de fichiers/entités sans support réel.

**Discipline** : cause racine AVANT patch ; vérifier sur la VRAIE scène avant « fait » (le
« corrigé en 2 s, toujours cassé » est interdit) ; toute dérogation se remonte à l'architecte
AVANT de dévier.

## Un bug observé chez moi n'est PAS à moi par défaut (règle PERMANENTE, Romain 2026-07-03)

Dérive identifiée : les bugs arrivent à Kanopi (il a l'écran) et l'agent tend à les TRAITER
plutôt que comprendre À QUI ils appartiennent — le schéma verrue historique (hôte qui absorbe
les fixes) purgé au chantier transport. Règle, sur CHAQUE bug :
1. **REPRODUIRE + DISCRIMINER** (bancs, bisection, variables isolées) ;
2. **REPORTER la discrimination à l'architecte AVEC les pièces** — c'est LUI qui route par la
   **DÉFINITION des rôles** (jamais par le symptôme) ;
3. ne **CORRIGER que ce qui est démontré dans le périmètre d'hôte** (affichage, câblage du
   handle, UI, stores). **JAMAIS de fix hors-périmètre, même évident, même petit.**

## DÉFINITION DE « FAIT » — honnêteté (violation = faute grave, pas une approximation)

Des rapports « migration complète, gate vert » ont été rendus alors que des scènes réelles
(`.gr`, alphabet `arabic`) étaient **MUETTES**, et un auto-audit « 14 stores conformes » a
**raté** une 2ᵉ autorité de transport (`MockClock`) bien présente. C'est ce qui est interdit.

Règles **non négociables** :
1. **« FAIT » = prouvé sur les VRAIES scènes que l'utilisateur utilise**, À L'ÉCRAN (Playwright/
   navigateur) : au minimum un `.gr`, une scène à alphabet non-anglais (ex. `arabic`), une scène
   audio `.bps`. **Un gate e2e vert est NÉCESSAIRE mais JAMAIS SUFFISANT** — les e2e étaient verts
   pendant que `.gr`/`arabic` ne sonnaient pas. Si tu ne peux pas vérifier à l'écran, dis-le
   explicitement ; ne déclare pas « fait ».
2. **Une affirmation « c'est propre / conforme » se prouve de façon ADVERSARIALE** : tu CHERCHES
   activement la violation (grep, lecture), tu ne déclares pas conforme « de mémoire ». Un audit
   qui rate une violation présente est un échec, pas un détail.
3. **Déclarer « fait/complet/vert » sur preuve insuffisante = MALHONNÊTETÉ**, traitée comme telle.
   Mieux vaut « pas encore vérifié sur X » que « fait » faux.
4. **Aucun contournement pour faire passer un test/gate** (skip, valeur en dur, assertion ajustée) :
   c'est tricher. Le test reflète le réel ; si le réel est cassé, on corrige le réel.
5. **Rapport = sur pièces** : commit + sortie réelle des commandes + ce qui a été vu à l'écran
   (RMS, capture, log console). Pas de résumé vague.
6. **JAMAIS de repli hôte / 2e autorité / chemin parallèle — même « en attendant », même comme
   « défaut si pas de réponse ».** C'est l'anti-pattern que tout ce projet élimine. Si tu te
   retrouves à PROPOSER un bricolage (clock hôte, fallback, état dupliqué, contournement) comme
   solution OU comme défaut, c'est DÉJÀ une dérive : ton réflexe doit être l'inverse. Bloqué sur
   une vraie décision → tu **ESCALADES à l'architecte et tu ATTENDS** ; tu ne bricoles pas un
   repli. Le « défaut si pas de réponse » d'une question bloquante est **toujours** « j'attends »,
   jamais « je prends le hack ». Faire le contraire = faute, pas un compromis raisonnable.

## Boundaries

- **In Kanopi scope**: UI (Svelte/CodeMirror), saisie, session parser (@actor/@scene/@map),
  **branchement** (instancier Kronos + BPx + runtimes), routage des commandes, rendu, library
  management, osc-bridge integration, packaging (Tauri).
- **Out of scope — Kanopi ne possède PAS** (cf. contrats ci-dessus) :
  - **Temps / transport / position / ordonnancement → `kronos`** (autorité du temps)
  - Language parser/encoder → `bpscript` repo
  - BP3 WASM engine → `bp3-engine` repo
  - **BPx derivation engine + structure/scène compilée → `bpscript` (BPx)**
  - Synthèse / sorties / format natif → runtimes (`runtime-midi`, `runtime-osc`, …)
  - Hardware JSON profiles + Rust bridge → `osc-bridge` repo

## Structure

- `packages/core/` — frontière de paquet vide (dispatcher/map-engine/bridge supprimés ; gardée au cas où un futur besoin de glue côté hôte y trouve un domicile)
- `packages/ui/` — Svelte 5 + CodeMirror 6 app
- `packages/library/` — bundled content
- `docs/plan/` — strategic plans (local only, gitignored)
- `docs/design/` — architecture
- `docs/mockups/` — UI mockups

## Related repos

- `/home/romi/dev/bp/BPscript/` — the language (parser, encoder, BPx engine spec)
- `/home/romi/dev/music/osc-bridge/` — hardware bridge
- `/home/romi/dev/bp/bp3-engine/` — BP3 WASM engine (sibling repo ; n'est plus un sous-module de BPscript depuis le 2026-06-14, cf. décision du même jour)

## Stack

- UI: Svelte 5 + TypeScript + CodeMirror 6 + Vite
- Desktop packaging: Tauri (later)
- Runtime: TypeScript, Web Audio, Web MIDI, WebSocket (for osc-bridge)

## Environment

This project runs on **PC2 (native Ubuntu Linux)** since 2026-06-14 (VSCode SSH; previously WSL2). Native inotify works, so Vite's file watcher needs no polling — `packages/ui/vite.config.ts` ships with polling **OFF by default**.

Dev server: `cd packages/ui && npm run dev`.
Legacy WSL2 fallback (only if editing across a Windows/Linux boundary): `VITE_FORCE_POLLING=1 CHOKIDAR_USEPOLLING=1 npm run dev` re-enables polling; if HMR still misbehaves there, the `vite-hmr-reset` skill applies.

## Visual verification is mandatory, not optional

Claude cannot see the UI on its own. Any change under `packages/ui/src/` that affects rendered pixels, editor behavior, or Strudel/Hydra wiring MUST be verified before declaring "done". The **`live-coding-verify` skill** describes the full protocol.

The baseline tool is **Playwright MCP**. If it is not installed in this session:

```
claude mcp add playwright npx @playwright/mcp@latest
```

With Playwright MCP available, Claude navigates to `localhost:5173`, takes screenshots, clicks, presses keys, and reads `browser_console_messages` itself — no human-in-the-loop ping-pong. Without it, Claude must say "I cannot verify visually" explicitly instead of guessing.

Forbidden answers: "c'est fait, recharge", "ça devrait marcher maintenant", "tu peux tester ?" without having verified or having explicitly flagged the inability to verify.

## Hygiène de banc — guard anti-orphelins Playwright (RÈGLE DURE, Romain 2026-07-14)

Les runs e2e/gate (`npm run verify`, Playwright) et le banc écran (Playwright MCP) laissent, quand ils
sont **interrompus** (push tué, SIGTERM, MCP déconnecté), des **processus orphelins** — navigateurs
Chromium du cache `ms-playwright`/`headless_shell` et webServers `vite --port 4321` — qui **s'accumulent
et pourrissent les perfs de la machine** (constaté par Romain, 2026-07-14).

**Obligation :** lancer le guard **`bash scripts/kill-orphan-benches.sh` AVANT et APRÈS chaque run e2e /
gate / banc Playwright.** Il ne tue QUE les orphelins réels (`ppid == 1`, parent mort) : jamais un run
vivant, jamais le serveur dev 5173, jamais un projet tiers (l'aperçu astro `viasophia` squatte aussi
4321 — ne PAS le tuer). En fin de session, un dernier passage du guard.

Rappels liés : ne pas tuer un `vite --port 4321` **pendant** un push (c'est le hook e2e VIVANT) ; tuer les
serveurs dans un **appel shell séparé** (piège `pkill` auto-match). Ne pas confondre l'astro viasophia
(tiers, sur 4321) avec un orphelin à moi.

## Skills (project scope)

Located in `.claude/skills/`:

- **`live-coding-verify`** — triggers on any UI/Svelte/CSS/CM6 edit. Forces Playwright-based verification before "done".
- **`svelte-5-patterns`** — Svelte 5 runes rules ($state / $derived / $effect / $props / $bindable), compiler traps (await rewriting), CodeMirror-inside-Svelte pattern.
- **`vite-hmr-reset`** — deterministic HMR recovery procedure (legacy WSL2 fallback; rarely needed on native PC2). Use if HMR misbehaves under forced polling.
- **`cv-verify-node`** — prove modulation/envelope/clock/re-random behavior in Node/vitest on the pure functions (+ mocked AudioParam), NOT via a slow headless browser. Browser reserved for the final "does it sound" smoke.

## Protocole tour (hub `/home/romi/dev/bp/hub`, CLI `tour`)

Kanopi est coordonné via la tour. Le protocole est **mécanisé par le CLI `~/dev/bp/hub/tour`** —
fini les éditions markdown du courrier à la main. Non optionnel.

### Règle de boucle (hub/README.md §1-2, validée Romain — NON OPTIONNELLE)

- **Réveil = courrier d'abord.** À CHAQUE réveil (début de session ou ping), la **première
  action** est `~/dev/bp/hub/tour inbox`. Rien d'autre avant d'avoir lu mon courrier.
- **Rapport avant idle — RÈGLE DURE, NON NÉGOCIABLE (violée 2×, recadrage architecte [208]).**
  Ne JAMAIS rendre la main en silence. La **TOUTE DERNIÈRE action** de chaque tour, AVANT de
  m'endormir, est **TOUJOURS** : `~/dev/bp/hub/tour send architecte` (`FINI: <quoi> + commit/preuve`
  ou `BLOQUÉ: <sur quoi>`) **PUIS** `~/dev/bp/hub/tour inbox --ack` de tout courrier traité.
  - **Committer/pousser N'EST PAS un rapport.** Un commit/push sans `tour send` derrière =
    « endormi en silence » = VIOLATION. Le push est l'avant-dernière action, le `tour send` la dernière.
  - Vaut même quand le `tour wake` est « sauté (architecte busy) » : le message déposé suffit, mais
    il DOIT être déposé. « FINI mais pas reporté » n'existe pas.
  - Pas de stop-hook : l'architecte pilote les réveils, l'utilisateur monitore via la tour. C'est à
    MOI de ne jamais terminer un tour sans le `tour send` final.

1. **Identité (1× par session)** : `export BP_AGENT=kanopi` (ou `--from kanopi` sur chaque appel ;
   l'env ne persiste pas entre commandes shell d'une session Claude).
2. **Début de session** : `~/dev/bp/hub/tour inbox` (mes non-lus) + lire `TABLEAU.md` et mes
   `contrats/`. Quand un message est traité : `tour inbox --ack`.
3. **Écrire / demander un arbitrage** : `~/dev/bp/hub/tour send <dest> "message"` (`architecte` est
   un destinataire valide). **Jamais** écrire dans ma propre boîte. Décision :
   `tour decide <slug> -m "titre" --impacts a,b,c` (notifie auto les impactés).
4. **Fin de session** : MAJ moi-même ma ligne du `TABLEAU.md` + ma fiche `projets/agents/kanopi.md`.
   L'architecte ne corrige plus mes pièces — il recadre. « Le code fait foi » : un statut se
   vérifie sur pièces, jamais de mémoire.
   ⛔ **`baseline-status.json` (à MA racine) est GELÉ — ne rien y écrire** (architecte, 2026-07-28).
   Le tableau qu'il alimente est **mort** : jamais régénéré depuis le 14 juin, et sa colonne
   vertébrale est la source dont on a acté qu'elle n'est PAS la baseline de conformité (ma colonne
   y liste 5 grammaires, la campagne qui mesure vraiment en porte 113). **Écrire une ligne fraîche
   dans un tableau périmé le rendrait crédible** — c'est le contraire du but. L'arbitrage (le
   régénérer et l'entretenir, ou le supprimer avec son outil et sa référence) n'est pas rendu ;
   personne n'écrit dedans en attendant. Signaler, jamais boucher le trou en silence.

Détail : `hub/README.md` (§Le protocole + §Outil tour).

## Memory

Kanopi session-specific memory at `~/.claude/projects/-home-romi-dev-bp-kanopi/memory/` (separate from BPscript memory).

## RTFM — Indexed Knowledge Base

This project has been indexed with RTFM.

For any **exploratory search** (finding which files/modules/classes are relevant
to a topic), use `rtfm_search` instead of Glob, find, ls, or broad Grep.
Then use `rtfm_expand` to read easily most relevant files/sections.

## CodeGraph — graphe de code indexé

Ce dépôt est indexé avec CodeGraph (`.codegraph/`). Pour **comprendre ou localiser du code**
(symboles, appelants/appelés, rayon d'impact d'un changement), utilise
`codegraph explore "<question | symbole>"` (ou l'outil MCP `codegraph_explore`) **avant** grep/find ou
la lecture de fichiers. Complémentaire de RTFM : **RTFM** pour le quoi/où documentaire (texte + PDF),
**CodeGraph** pour la structure d'appel du code. (Index local, non versionné ; cloisonné à ce dépôt.)

## ⚠️ Sous-agents de dev — modèle imposé : Sonnet 5 (Romain 2026-07-12)

Quand tu lances un **sous-agent de développement** (outil Agent/Task), choisis
**TOUJOURS le modèle Sonnet 5** (`claude-sonnet-5`). Vaut pour chaque sous-agent
de dev que tu délègues — jamais un modèle plus lourd par défaut pour ce travail.
