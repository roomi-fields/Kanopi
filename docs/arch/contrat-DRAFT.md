# Contrat d'architecture — Kanopi (l'HÔTE) — BROUILLON (phase 1)

**Statut** : 🔶 brouillon, produit par l'agent Kanopi (phase 1 carto+conformité). NON ratifié.
**Propriétaire (à terme)** : architecte. **Promotion** : une fois ratifié par Romain → contrat de
référence (`hub/contrats/kanopi-architecture.md` existe déjà et **fait foi** ; ce DRAFT le
**confronte au code** et propose des précisions, il ne le remplace pas).

**Drivers confrontés** (tous lus, pas un seul) :

- ✅ `hub/contrats/kanopi-architecture.md` (loi : zéro état d'autorité ; loi n°2 : résout/compose/rend RIEN).
- ✅ `hub/contrats/kanopi-bpx-tree.md` v2 (l'arbre `derive()` que l'hôte CONSOMME en lecture seule).
- ✅ `hub/contrats/kanopi-runtime-midi.md` (+ MAJ 2026-06-29 : le runtime ne résout RIEN).
- ✅ `hub/contrats/kanopi-runtime-codevoices.md` (forme `RuntimeAdapter`).
- ✅ `hub/contrats/2026-06-16-sortie-production-texte-kanopi.md` (superséé en partie par vues-à-calques).
- ✅ décisions `2026-06-26-kai9-adresse-dans-arbre.md`, `2026-06-26-kairos-vues-a-calques.md` (+ corollaire KAI-10).
- Marquage : ✅ratifié · ⚙️dérivé-du-code · 🔶proposé · ❓question-Romain.

---

## 1. Fonctionnel — raison d'être

Kanopi est **l'hôte** : le magnétophone. Il **charge** la bande (passe l'arbre BPx à Kairos),
**presse les boutons** (émet `play/pause/stop/step/seek/tempo/loop` à Kronos), **lit l'afficheur**
(projette position/structure/vues), **route** (branche les puits par sortie) et **dessine l'UI**
(Svelte + CodeMirror). Il **ne fabrique rien** : ni temps, ni structure, ni hauteur, ni son, ni
octets — il câble des sources amont et rend l'UI. ⚙️ Confirmé sur pièces : les 155 fichiers de
code se rangent en branchement (`adaptateur`/`coeur`), projection (`stores`), rendu UI (`UI`), et
gestion locale (saisie, fichiers, bibliothèque).

## 2. Contextuel — place dans le flux, voisins, lois cross-repo

**Flux métier (étalon, loi n°2)** : `BPScript → BPx (arbre) → Kairos (projette/résout/compose/
aplatit) → Kronos (temps/ordonnance/route) → runtimes (résolvent au natif + rendent)`. Kanopi est
**à côté** de ce flux, pas dedans : il l'instancie et le câble.

Voisins (frontières — détaillées en §3) :

- **amont (consomme)** : BPx (`derive()`), Kairos (projection : arbre/vues/pitch/modulation),
  Kronos (transport/curseur/routage).
- **aval (branche)** : runtime-audio, runtime-midi, runtime-osc, runtime-codevoices (puits) ;
  runtime-ui (vues Texte/Timeline).

Lois cross-repo qui le lient :

- ✅ **Zéro état d'autorité** : chaque store est une projection ; ce que l'hôte invente = bug.
- ✅ **Résout/compose/rend RIEN** (loi n°2) : résolution → Kairos (KAI-10) ; composition → Kronos ;
  rendu son/octets → runtimes ; rendu vues → runtime-ui (vues-à-calques) ; seul rendu hôte = UI.
- ✅ **KAI-9** : l'adresse de sortie voyage DANS la donnée (`event.output`), pas par crochet hôte ;
  l'hôte ne fournit plus `resolveOutput`/`pickTransport`.
- ✅ **Temps/position/transport = Kronos** : l'hôte émet des commandes et LIT la position ;
  jamais de compteur ni de 2ᵉ machine d'état.

## 3. Interface — les frontières (LA partie scrutée)

> Contrats aux **frontières de module** uniquement (figés). Les internes (entre fichiers Kanopi)
> NE sont PAS figés ici — la carte les photographie, on veut pouvoir les refactorer.

### 3.1 Inventaire des directions

| #   | Frontière                          | Propriétaire       | Sens                 | Type/forme échangé                                                             | Invariant                                                                                           |
| --- | ---------------------------------- | ------------------ | -------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| F1  | Kanopi → **BPx** `derive()`        | BPx                | lit                  | `{ tree: DerivationTree, tokens: TimedToken[] }` (+ `meter?`, `sceneTiming`)   | hôte **lit**, ne re-dérive jamais ; `payload` opaque ; re-lit `meter`/`sceneTiming` à CHAQUE derive |
| F2  | Kanopi → **Kairos** `charger(...)` | Kairos             | écrit (commande)     | `{ tree, ctx:{ pitchLib }, modulation:{ registry, exprSource } }`              | écriture **uniquement** via l'API Kairos ; l'hôte fournit la DATA, Kairos résout/aplatit            |
| F3  | **Kairos** → Kanopi (vues)         | Kairos             | lit                  | `arbreCourant(): FlatView`, vue arbre `ProductionStructure` (noms résolus)     | lecture seule hors-temps ; l'hôte ne produit aucune vue                                             |
| F4  | Kanopi ↔ **Kronos** (transport)    | Kronos             | écrit cmd / lit état | cmd `play/pause/stop/step/seek/tempo/loop` ; lit `beatPosition()`, état        | l'hôte ne tient ni position ni FSM ; lit chaque frame                                               |
| F5  | **Kronos** routage → puits         | Kronos             | (hôte branche)       | `addAdapter(runtime, adapter)` ; Kronos route sur `event.output.runtime`       | l'hôte nomme la route ; Kronos relaie device/channel **sans les lire**                              |
| F6  | Kanopi → **runtime-audio**         | runtime-audio      | branche              | `AudioRuntime` (sink) + `exprSource` (factory courbe CV)                       | le puits résout Hz (`content.pitch.hz`) + rend la courbe ; l'hôte ne compile/rend RIEN              |
| F7  | Kanopi → **runtime-midi**          | runtime-midi       | branche              | `MidiTransport` (par acteur `transport:midi`)                                  | runtime-MIDI POSSÈDE le fil MIDI ; zéro copie MIDI dans Kanopi/core                                 |
| F8  | Kanopi → **runtime-osc**           | runtime-osc        | branche              | adapter OSC sur l'horloge partagée                                             | l'hôte nomme la route `osc` + passe les octets ; le transport porte le fil                          |
| F9  | Kanopi → **runtime-codevoices**    | runtime-codevoices | branche              | `codeVoiceAdapters: RuntimeAdapter[]` (7 voix) + attaches DOM                  | voix = sink tiré à l'onset par Kronos ; l'hôte garde le câblage `registerBacktickSink`              |
| F10 | Kanopi → **runtime-ui**            | runtime-ui         | monte                | `ViewModule.mount({container})` + `ProductionInput{ structure, flat, cursor }` | runtime-ui REND ; l'hôte fournit vues Kairos + curseur Kronos                                       |

### 3.2 Signatures exactes (la forme complète, chaque champ)

- **F1 — `derive()`** (étalon `kanopi-bpx-tree.md` v2) : `DerivationTree = { root: TreeNode,
metadata{ totalDurationBeats, tempo, generation, seed, derivationTimeMs } }` ; nœuds
  `sequence|polymetric|voice|occupying|event|control` ; `Span` float64 ;
  `meter?={numerators:number[],denom}` (ABSENT ⇒ l'hôte ne projette **aucune** barre) ;
  `sceneTiming={natureOfTime,quantizationMs,clock?,duration?}`.
- **F2 — `ctx.pitchLib: PitchLib`** = `{ alphabets, tunings, temperaments, scales, octaves }`
  (type importé de `@kairos/core`). `modulation = { registry: buildModulators(sceneCV, modLib),
exprSource }`. ⚙️ **C'est ici que se joue l'écart C1** (cf. §5) : l'hôte ASSEMBLE cette data.
- **F4 — transport** : commandes émises via le handle Kronos ; lecture
  `kronosCursor.active.beatPosition()` (handle compensé, pas le rAF central).
- **F6 — `exprSource: ExprSource`** (de `runtime-audio`) : factory `backtick curve → ModulationSource`,
  injectée dans la composition Kronos (`setExprSource`) → l'hôte ne compile jamais la courbe.
- **F9 — `RuntimeAdapter`** (étalon `kanopi-runtime-codevoices.md`) :
  `{ id, outputType, extensions, evaluate(code,src,log), stop, setBpm?, onBeat?, onBar?, events?,
dispose }`. `EvalSource={ actorId?, fileId, docOffset?, flags?, section?, produceOnly? }`.

### 3.3 Accord des deux bords (vérifié contre l'étalon de l'autre dépôt)

- ✅ **F1** ↔ `BPx/docs/ENGINE_SPEC.md §4.1` (v2 figé) : l'hôte lit `meter`/`sceneTiming` (fix F10 :
  ne code plus `BEATS_PER_BAR=4`). Concorde.
- ✅ **F7** ↔ `kanopi-runtime-midi.md` MAJ 2026-06-29 : le runtime ne résout plus la hauteur ;
  l'hôte importe `MidiTransport` AS-IS, zéro copie. Concorde (la copie core `transports/midi.js`
  est supprimée — confirmé `core/src/index.js`).
- ✅ **F9** ↔ `kanopi-runtime-codevoices.md` (forme figée 2026-06-23). Concorde.
- ❓ **F2** : `ctx.pitchLib` + `modulation.registry` — la forme est posée (KAI-10 canal
  `ctx.pitchLib`), mais **qui doit ASSEMBLER cette data** n'est pas tranché côté contrat (écart C1).

## 4. Topologie voulue (organisation CIBLE — ≠ décalque du code)

- **adaptateur** = la seule porte hôte↔moteur. Tout branchement amont/aval y vit ; aucun autre
  bloc ne parle à Kairos/Kronos/puits en direct… **sauf** les `stores` qui LISENT
  (position/vues) — lecture autorisée (projection), écriture interdite ailleurs.
- **stores** = projections pures (lecture amont → état réactif UI). Aucune écriture d'autorité,
  aucun `$effect` de recopie store→store.
- **coeur** = registry + dispatcher **inerte** (structure que Kronos lit, jamais émetteur de son).
- **UI** ne parle qu'aux stores + monte runtime-ui ; ne touche jamais Kairos/Kronos en direct.
- Règle de structure : **sens unique** moteur/BPx/workspace → UI (lecture) ; UI → moteur (commande).

## Invariants vérifiables MACHINE (encodés par le garde `npm run arch`)

1. ✅ **no-circular** : pas de cycle de dépendance. _(8 cycles actuels détectés — cf. §5 écart C6.)_
2. ✅ **pas-de-resolveur-hauteur-dans-hote** : aucun module Kanopi n'importe un résolveur de
   hauteur amont (`/pitch`, `*resolver*`). VERT aujourd'hui (l'hôte importe le `type PitchLib`
   et la DATA, jamais la logique `@kronos/core/pitch`).
3. 🔶 (proposé) **pas-de-copie-MIDI-dans-core** : `packages/core` ne doit pas ré-héberger un
   transport MIDI (la copie est supprimée ; figer pour empêcher la rechute).

## 5. Écarts code ↔ contrat (LA confrontation — phase 1)

> **Test central (loi n°2)** : surface CHAQUE endroit où l'hôte résout / compose / rend.
> Verdict global : **rendu, résolution de hauteur et aplatissement sont PROPRES** (délégués).
> L'écart principal est un **conduit de DATA de résolution/composition** — pas un calcul hôte.

### ⚠️ C1 — PRINCIPAL : l'hôte est le conduit+assembleur du contexte de résolution & composition

- **Preuve** : `bpx-adapter.ts:17-25` importe `bpscript/lib/{alphabets,tunings,temperaments,
scales,octaves}.json` + `mod.json` ; `:137-142` assemble `PITCH_LIB` ; `:1512-1516` appelle
  `buildModulators(sceneCV, modLibJson)` ; `:1544/1804` injecte `ctx.pitchLib` + `modulation:
{registry}` dans Kairos.
- **Nature** : mécaniquement, l'hôte ne résout/compose **rien** (Kairos résout la hauteur,
  Kronos/Kairos composent la modulation) — mais il **importe la DATA du domaine hauteur/
  modulation** et **assemble le contexte** qu'il injecte. C'est l'analogue pitch/CV du crochet
  hôte `resolveOutput` que **KAI-9 a justement supprimé** en faisant voyager l'adresse DANS la
  donnée.
- **Question (escalade)** : est-ce du **branchement légitime** (l'hôte fournit la lib, l'amont
  résout) — OU les catalogues + le registre de modulation doivent-ils **voyager
  BPScript→BPx→Kairos dans la donnée** (comme l'adresse KAI-9), pour que l'hôte ignore tout du
  domaine hauteur/modulation ? **C'est le finding « gros » de cette carto** (l'équivalent du
  « MIDI était gros »). → archi/Romain.

### 🔶 C2 — `extract-blocks.ts` re-parse le TEXTE des onglets

- **Preuve** : `lib/blocks/extract-blocks.ts` (« lists one entry per block detected in every open
  file ») → consommé par `stores/blocks.svelte.ts` + `CMEditor.svelte`.
- **Contrat** : anti-pattern explicite « ❌ re-parse du texte des onglets pour produire des blocs
  qui **alimentent la lecture** ». **À confirmer en phase 2** : ce store alimente-t-il SEULEMENT
  l'affordance d'éval éditeur (saisie locale = **légitime**, seul état mutable propre) ou la
  structure de lecture (**interdit**) ? Indice favorable : les **acteurs** viennent bien de
  `core.actors` (scène compilée), pas du texte (`stores/actors.svelte.ts`).

### 🔶 C3 — `coerceControlValues` coerce les contrôles côté hôte

- **Preuve** : `core/src/dispatcher/dispatcher.js:23` coerce string→number (`vel:'80'`→80).
- **Contrat** : `kanopi-runtime-midi.md` MAJ 2026-06-20 — les contrôles arrivent « verbatim
  (string OU number, **jamais coercé** — la coercition est CHEZ runtime-midi) ». Candidat à
  pousser vers le runtime (audio). Mineur (chemin audio hôte legacy).

### 🔶 C4 — commentaires / stubs périmés (rendu déménagé)

- `bpx-adapter.ts:52-54` décrit un flattener hôte `treeToDispatchEvents` **qui n'existe plus**
  (`:30` confirme « Kairos is the SOLE projection source — no parallel host-side flattener »).
- `lib/text-order/order-tokens.d.ts` = stub d'un producteur de texte hôte (cahier 2026-06-16)
  **superséé** par vues-à-calques (le texte est rendu par runtime-ui depuis la vue arbre Kairos) ;
  aucun consommateur hôte trouvé. Nettoyage doc/code mort.

### ⚙️ C5 — `bar-beat.ts` formate la position

- `lib/format/bar-beat.ts` formate bar·beat·phase pour les afficheurs. **Vérifié non-coupable** de
  l'ancienne autorité `BEATS_PER_BAR=4` (fix F10 : le mètre vient de `result.meter`). Conforme ;
  noté pour traçabilité.

### ⚙️ C6 — 8 cycles de dépendance (garde no-circular)

- p.ex. `bpx-adapter ↔ registry`, `core-real ↔ clock`, `blocks ↔ playback/workspace`. Signe de
  couplage interne (pas une violation de frontière). À résorber pendant l'assainissement ;
  n'empêche pas la carte.

## Questions Romain (récap)

1. **C1** — branchement légitime, ou faire voyager catalogues + registre de modulation dans la
   donnée (modèle KAI-9) pour un hôte aveugle au domaine hauteur/modulation ?
2. **C2** — le store `blocks` (re-parse texte) : périmètre confirmé = affordance d'éval éditeur
   seulement ?
3. **C3** — la coercition des contrôles déménage-t-elle vers runtime-audio ?
