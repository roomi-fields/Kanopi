# Contrat d'architecture — l'HÔTE Kanopi

> **Principe dur (loi n°2)** : l'hôte ne RÉSOUT / COMPOSE / REND **rien**. Il lit des facettes sur
> l'arbre dérivé, fournit/câble les sources amont, transmet les boutons, route les sorties — point.
> Toute résolution / composition / rendu effectué par l'hôte = **non-conformité**.

## Statut

🔶 **Cadre** — synthèse architecte sur pièces (carte phase 1 : 209 modules ; cartes de fonctions des
deux familles denses `bpx-adapter.ts` et `kronos-audio.ts`). NON ratifié. Confronte le code au
contrat de référence (`hub/contrats/kanopi-architecture.md`, qui fait foi) ; ne le remplace pas.

Verdict d'ensemble, prouvé par les graphes d'appel : **l'ossature est conforme** — `evaluate` et
`startKronosAudio` sont des orchestrateurs à fan-out qui APPELLENT les autorités (BPx, Kairos,
Kronos, devices, runtimes) sans réimplémenter leur logique ; aucun rendu son/visuel/octet n'est fait
par l'hôte ; pitch forwardé verbatim (KAI-10) ; tempo/mute passent par la porte d'écriture unique
`kairos.demande`. Les manquements sont **localisés et résiduels** (§5) : data de domaine portée par
l'hôte (C1), micro-compositions à la frontière (C3), et deux couplages internes évitables.

Marquage : ✅ratifié · ⚙️dérivé-du-code · 🔶proposé · ❓question-Romain.

---

## 1. Fonctionnel — l'hôte assemble, câble, transmet, route (ne calcule rien)

Kanopi est **le magnétophone**. Quatre verbes, aucun de plus :

- **Assemble** — bifurque les deux frontaux (.gr / .bps) vers un **AST unique**, sème le seed,
  appelle `derive()` (BPx), réconcilie le tempo lu de l'arbre, projette dans Kairos, publie la vue de
  production. C'est du montage de cycle de vie (eval / produce-only silencieux / step / replay /
  stop-in-place / hush / dispose), pas de la fabrication de contenu.
- **Câble** — monte la machine Kronos sur l'horloge `AudioContext` partagée, charge les banques
  déclarées, branche les puits (audio / MIDI / OSC / code) et les hooks (tempo, mètre, panneau
  acteurs, factory CV `exprSource` de runtime-audio).
- **Transmet** — projette les boutons utilisateur (`play/pause/stop/step/seek/tempo/loop/mute/
re-random`) vers Kronos et Kairos, sans tenir ni position ni machine d'état parallèle.
- **Route** — nomme la route par acteur ; chaque adaptateur sélectionne le sink sur
  `event.output.runtime` et **reshape** l'événement vers la forme du sink. Aucun adaptateur par
  défaut, aucun acteur « default » inventé.

Ce qu'il ne fait **jamais** : fabriquer du temps, de la structure, de la hauteur, du son, des octets,
des vues. Il câble des sources amont et rend la seule chose qui lui appartienne — l'**UI** (Svelte +
CodeMirror) et la saisie locale. ⚙️ Confirmé : les 155 fichiers de code se rangent en branchement
(`adaptateur`/`coeur`), projection (`stores`), rendu UI (`UI`), gestion locale (saisie/fichiers/biblio).

## 2. Contextuel — place dans le flux, voisins, lois cross-repo

**Flux métier (étalon, loi n°2)** :
`BPScript → BPx (arbre + catalogues) → Kairos (projette/résout/compose/aplatit) → Kronos
(temps/ordonnance/route) → runtimes (résolvent au natif + rendent)`.
Kanopi est **à côté** de ce flux, pas dedans : il l'instancie et le câble.

Voisins (frontières figées en §3 du contrat) :

- **Amont (consomme en lecture)** : BPx (`derive()`), Kairos (projection arbre/vues/pitch/modulation),
  Kronos (transport/curseur/routage).
- **Aval (branche des puits)** : runtime-audio, runtime-midi, runtime-osc, runtime-codevoices ;
  runtime-ui (vues Texte/Timeline).

Lois cross-repo qui le lient :

- ✅ **Principe dur (loi n°2) — résout/compose/rend RIEN** : résolution de hauteur → Kairos (KAI-10) ;
  composition de modulation → Kronos/Kairos ; rendu son/octets → runtimes ; rendu vues → runtime-ui
  (vues-à-calques) ; **seul rendu hôte = l'UI**.
- ✅ **Zéro état d'autorité** : chaque store est une projection ; ce que l'hôte invente = bug.
- ✅ **KAI-9 — l'adresse de sortie voyage DANS la donnée** (`event.output`), pas par crochet hôte ;
  l'hôte ne fournit plus `resolveOutput`/`pickTransport`. (C1 en §5 est l'analogue pitch/CV resté à traiter.)
- ✅ **KAI-10 — l'hôte ne résout plus le token→Hz** : la facette `content.pitch` est forwardée
  verbatim aux puits ; le runtime-audio résout `content.pitch.hz`.
- ✅ **Temps/position/transport = Kronos** : l'hôte émet des commandes et LIT la position à chaque
  frame ; jamais de compteur ni de 2ᵉ machine d'état. La porte d'écriture de l'arbre = `kairos.demande`.

---

## 3. Interface

Cinq frontières figées, regroupées ci-dessous par nature : **3.1** l'inventaire des directions
(un tableau par frontière), **3.2** les signatures exactes champ par champ, **3.3** l'accord des
deux bords (code ↔ étalon ↔ réalité du voisin). Les cinq frontières :

- **AMONT** — consommation de l'arbre dérivé BPx (lecture seule).
- **charger()** (écart C1) — l'hôte → Kairos : arbre + CONTEXTE de résolution/composition.
- **KRONOS** — transport (boutons) + routage de sortie KAI-9.
- **PUITS** — dispatch de l'hôte vers les runtimes (audio / midi / osc / codevoices).
- **RUNTIME-UI** — montage des vues de production (le rendu est parti chez runtime-ui).

### 3.1 Inventaire des directions (tableaux par frontière)

#### Frontière AMONT — Consommation de l'arbre dérivé BPx (lecture seule)

**Producteur** : BPx (`createSession(ast).derive()` + `emit('timed-tokens')`). **Consommateur** :
Kanopi (l'hôte). **Sens** : Kanopi **LIT** des facettes ; il ne re-dérive jamais, n'interprète
jamais `payload`, ne résout/compose/rend rien. **Sources de vérité confrontées** :

- étalon hub `contrats/kanopi-bpx-tree.md` (figé **v2**, 2026-06-16) ;
- spec productrice `BPx/docs/ENGINE_SPEC.md §4.1 / §4.1bis / §4.2` (en avance sur l'étalon) ;
- code réel `kanopi/packages/ui/src/lib/runtimes/bpx-adapter.ts` (+ `bp3-deps.d.ts`,
  `meter.ts`, `stores/production.svelte.ts`).

PRINCIPE DUR vérifié sur cette frontière : **aucune résolution / composition / rendu hôte**. Toute
la donnée du domaine hauteur/sons (`payload`) reste opaque ; les noms viennent du résolveur de BPx
(`grammar.symbols.getName`) ; les facettes lues ne sont que **projetées** vers l'affichage et le
transport.

| Nom (facette)                      | Propriétaire | Sens              | Type / forme exact                                        | Invariant                                                         |
| ---------------------------------- | ------------ | ----------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| `Session.derive()`                 | BPx          | hôte lit          | `{ tree: DerivationTree; …meter?; sceneTiming }`          | l'hôte appelle, ne re-dérive jamais ; re-lit à CHAQUE eval        |
| `Session.emit('timed-tokens')`     | BPx          | hôte lit          | `TimedToken[]` (plat, ms)                                 | sortie de parité ; même source que les `span` de l'arbre          |
| `tree.root: TreeNode`              | BPx          | hôte lit          | nœud discriminé (5 familles en 'sounding')                | structure opaque ; l'hôte lit `type`/`span`/`symbolId`/enfants    |
| `node.span`                        | BPx          | hôte lit          | `Span` float64 (7 champs)                                 | l'hôte ne lit QUE `startMs`/`endMs` ; pas d'arrondi amont         |
| `node.symbolId`                    | BPx          | hôte lit          | `number` (clé registre, ≠ nom)                            | nom UNIQUEMENT via `grammar.symbols.getName(id)` ; rest = -1      |
| `node.payload`                     | BPx          | NE LIT PAS        | `unknown` (pitch/vél/canal/sons)                          | OPAQUE (R2) ; jamais lu structurellement par l'hôte               |
| `tree.metadata.tempo`              | BPx          | hôte lit          | `number` (tempo effectif)                                 | source unique du tempo ; jamais de défaut hôte fabriqué           |
| `tree.metadata.totalDurationBeats` | BPx          | hôte lit          | `number` (longueur compilée)                              | borne de boucle Kronos ; autorité BPx, jamais recalculée          |
| `tree.metadata.actors`             | BPx          | hôte lit          | `Record<acteur, ActorEntry>` (KAI-9/10)                   | énumération devices OSC seulement ; adresse voyage DANS la donnée |
| `tree.metadata.scenePitch`         | BPx          | (présent, non lu) | `{ alphabet?; tuning?; tokens }` (KAI-10)                 | identité hauteur globale ; consommée par Kairos, pas l'hôte       |
| `derive().meter?`                  | BPx          | hôte lit          | `{ numerators: number[]; denom }` (absent si non déclaré) | ABSENT ⇒ l'hôte ne projette AUCUNE barre (défaut 4 en repli aval) |
| `derive().sceneTiming`             | BPx          | (présent, non lu) | `{ natureOfTime; quantizationMs; clock?; duration? }`     | TOUJOURS présent ; l'hôte ne le consomme PAS aujourd'hui          |
| `grammar.symbols.getName(id)`      | BPx          | hôte lit          | `(id:number) => string`                                   | seul moyen de nommer une feuille ; échec ⇒ table vide, repli      |

#### Frontière `charger()` (écart C1) — l'hôte fournit l'arbre + le CONTEXTE de résolution/composition

> **Le finding « gros » de la carto Kanopi** (l'équivalent pitch/CV du « MIDI était gros »).
> Frontière physiquement émise par l'**hôte** (Kanopi orchestre l'appel), mais dont la forme est
> **possédée par Kairos** et dont la charge est **majoritairement produite par BPx**. C'est ici que se
> joue la non-conformité C1 : l'hôte n'est pas qu'un câble — il **importe la DATA du domaine
> hauteur/modulation** et **assemble** (voire **exécute**) une partie du contexte.
>
> Code réel : `kanopi/packages/ui/src/lib/runtimes/bpx-adapter.ts` (`PITCH_LIB` :137-143, `buildModulators`
> :1512-1517, `kairos.charger` eval :1531-1557 + re-dérive :1799-1808, `onExprSource`/`setExprSource` :983-989).
> Bord Kairos : `kairos/src/kairos.ts:47` (`charger`), `kairos/src/projection/projeter.ts:32-60`
> (`ContexteProjection`), `kairos/src/pitch/builder.ts:45-51` (`PitchLib`), `kronos/src/modulation/*`
> (`buildModulators`, `Modulator`, `ExprSource`).

| Élément                                                                                                   | Propriétaire de la forme               | Producteur réel de la valeur                                      | Sens                           | Type/forme exact                                                | Invariant                                                                                                      |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `charger(arbre, contexte)`                                                                                | Kairos                                 | Hôte (orchestre l'appel)                                          | hôte → Kairos (push, commande) | `(arbre: DerivationTree, contexte: ContexteProjection) => void` | écriture du contenu UNIQUEMENT par `demande()` ; `charger` (re)pose l'arbre + ré-aplatit + bumpe la génération |
| `arbre`                                                                                                   | BPx                                    | BPx (`session.derive().tree`)                                     | transmis verbatim              | `DerivationTree` (OPAQUE pour l'hôte)                           | l'hôte LIT/transmet, ne construit/re-dérive jamais l'arbre                                                     |
| `contexte.resolveName` / `resolveKind` / `transformMs` / `kpressOffset` / `order` / `resolveRuntimeState` | Kairos (type)                          | **BPx** (`session.buildProjectionContext()`)                      | étalé dans le contexte         | résolveurs+options d'émission                                   | l'hôte ne les assemble PAS (spread de l'objet BPx)                                                             |
| `contexte.transposeToken`                                                                                 | Kairos (type)                          | — (NON fourni)                                                    | absent                         | `(token, steps) => string`                                      | l'hôte ne le pose PAS : le transpose-son vit dans Kairos (KAI-10/B03, via `digitalLib`)                        |
| `contexte.pitchLib`                                                                                       | Kairos (`@kairos/core`)                | **HÔTE** (assemble `PITCH_LIB` depuis 5 JSON `bpscript/lib`)      | étalé dans le contexte         | `PitchLib` (5 catalogues read-only)                             | l'hôte fournit la DATA ; Kairos construit le résolveur + grave `content.pitch` ; l'hôte ne résout rien         |
| `contexte.digitalLib`                                                                                     | Kairos (`@kairos/core`)                | **HÔTE** (fournit `LIBS.digital` body-full du bundle bpscript)    | étalé dans le contexte         | `DigitalLib` (fonctions TS read-only, ex. `transpose`)         | l'hôte FOURNIT la lib (3 provenances, comme pitchLib) ; Kairos APPLIQUE les fonctions à la projection (KAI-B03) ; l'hôte n'exécute AUCUNE fonction — porter≠résoudre |
| `contexte.modulation.registry`                                                                            | Kairos (type) / `@kronos/core` (forme) | **HÔTE** (exécute `buildModulators(ast.cvInstances, modLibJson)`) | étalé dans le contexte         | `Readonly<Record<string, Modulator>>`                           | l'hôte assemble le registre (fusion d'args) ; Kairos COMPOSE les bindings à l'aplatissement                    |
| `contexte.modulation.exprSource`                                                                          | `@kronos/core` (type)                  | **runtime-audio** (passé par l'hôte)                              | étalé dans le contexte         | `ExprSource = (req: ExprRequest) => ModulationSource\|null`     | factory de courbe fournie PAR le runtime ; l'hôte la PASSE, ne compile jamais la courbe                        |
| `setReDerive(cb)`                                                                                         | Kairos                                 | Hôte (closure `reDeriveKairos`, installée par `startKronosAudio`) | hôte → Kairos                  | `(cb: (()=>void)\|null) => void`                                | l'hôte câble la re-dérivation au bord ; il n'écrit pas l'arbre lui-même                                        |

#### Frontière KRONOS — transport (boutons) + routage de sortie (KAI-9)

**Propriétaire de l'API** : Kronos (moteur de temps) + Kairos (grave `event.output`).
**Rôle de Kanopi** : presse les boutons (émet des commandes), LIT l'état/la position, BRANCHE les puits
par nom de runtime. Il ne tient ni machine d'état, ni compteur de position, ni table acteur→transport, et
**ne résout/compose/rend RIEN** sur ce chemin.

Étalons : `hub/contrats/kronos-transport.md` (commandes/état), `kronos/docs/CONTRACT_RUNTIME_ADAPTER.md`

- `kronos/src/runtime/runtime-adapter.ts` (forme cœur `ScheduledEvent`/`OutputRef`/`RuntimeAdapter`),
  décision `kronos/decisions/2026-06-26-kai9-adresse-dans-arbre.md`.
  Code hôte : `packages/ui/src/stores/{transport,playback,clock,kronos-cursor}.svelte.ts` +
  `packages/ui/src/lib/runtimes/kronos-audio.ts` (husk `packages/core/src/dispatcher/dispatcher.js`
  éliminé [842] : `packages/core/src` ne contient plus que `index.js`, vide).

| #   | Direction / champ                                    | Propriétaire                | Sens                | Type / forme exacte                                                       | Invariant                                                                            |
| --- | ---------------------------------------------------- | --------------------------- | ------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| K1  | `play() pause() stop() step(n=1) seek(scene)`        | Kronos `Transport`          | hôte ÉMET cmd       | `():void` ; `step(n=1)` ; `seek(scene:number)` (t_scène, s)               | l'hôte appelle, ne recalcule aucune transition ni position                           |
| K2  | `setTempo(bpm) setRate(r) setLoop/clearLoop`         | Kronos `Transport`          | cmd (voir écart É2) | `setTempo(bpm:number)` `setRate(r:number)` `setLoop(a,b)` `clearLoop()`   | échelle d'horloge = Kronos ; re-planif fenêtre côté Kronos                           |
| K3  | `state`                                              | Kronos `Transport`          | hôte LIT (observe)  | `'stopped'\|'running'\|'paused'` (`TransportState`)                       | miroir display seul (`kronosCursor.state`) ; jamais 2ᵉ FSM hôte                      |
| K4  | `onStateChange(cb)`                                  | Kronos `Transport`          | hôte s'abonne       | `(cb:(s:TransportState)=>void) => (()=>void)`                             | recopie pour affichage ; désabo au swap de handle                                    |
| K5  | `position()`                                         | Kronos `Transport`          | hôte LIT /frame     | `():number` (t_scène s ; curseur si running, gelé si paused)              | une seule autorité = curseur Kronos ; jamais intégrée hôte                           |
| K6  | `beatPosition(bpb=4)`                                | Kronos `Transport`          | hôte LIT /frame     | `(beatsPerBar?:number) => BeatPosition`                                   | repli boucle géré Kronos ; jamais un compteur de beats hôte                          |
| K7  | `absoluteBeatPosition(bpb=4)`                        | Kronos `Transport`          | hôte LIT /frame     | `(beatsPerBar?:number) => BeatPosition` (index NON replié, monotone)      | les events beat/bar lisent CET index, pas un `+1` hôte                               |
| K8  | `tempo`                                              | Kronos `Transport`          | hôte LIT            | `get tempo():number` (BPM live)                                           | autorité tempo = Kronos ; miroir échantillonné /frame                                |
| K9  | `loopDurationScene()`                                | Kronos `Transport`          | hôte LIT            | `():number` (durée boucle = durée timeline)                               | bornes de boucle lues de Kronos, pas un `reduce(max)` hôte                           |
| K10 | `bindStructureSource(src)`                           | Kronos `Transport`          | hôte BRANCHE        | `(src:StructureSource\|null):void` (= `kairos.sourceStructure()`)         | source = projection Kairos PULL ; l'hôte ne fabrique aucune timeline                 |
| K11 | `scheduler.addAdapter(runtime, adapter)`             | Kronos `Scheduler`          | hôte BRANCHE        | `(runtime:string, adapter:RuntimeAdapter):void`                           | l'hôte NOMME la route ; aucun adaptateur par défaut                                  |
| K12 | `event.output` (OutputRef)                           | Kairos grave / Kronos route | DATA traversante    | `{runtime:string, device?:string, channel?:number}`                       | adresse DANS la donnée ; Kronos route sur `runtime`, relaie device/channel SANS lire |
| K13 | `ScheduledEvent` (forme cœur)                        | Kronos cœur                 | DATA vers le puits  | `{onset, duration, actor?, output?, content, kind?, nature?}`             | `content` OPAQUE ; le cœur ne lit que `onset/duration/output.runtime`                |
| K14 | `RuntimeAdapter.send` (puits hôte)                   | hôte fournit                | hôte → puits        | `send(ev:ScheduledEvent):void` (+ `latency? close? stop? setActorMuted?`) | puits encode vers son fil ; l'hôte n'émet aucun son lui-même                         |
| K15 | toggles session `loop` / `reRandom`                  | hôte (store)                | état local hôte     | `loop:boolean=true`, `reRandom:boolean=false` + sinks live                | choix d'INTENTION (que rejouer) ; appliqué à la frontière de boucle                  |
| K16 | tempo live `retune(bpm)`                             | Kairos (porte d'écriture)   | cmd via Kairos      | `kairos.demande({type:'tempo', bpm, quand:'immediat'})`                   | live tempo passe par Kairos, PAS `transport.setTempo` (écart É2)                     |
| K17 | arm/désarm `setActorMuted(actor,muted)`              | Kairos (porte d'écriture)   | cmd via Kairos      | `kairos.demande({type:'mute', acteur, muet, quand:'immediat'})`           | acteur = clé de mute (≠ routage) ; état de mute survit re-dérivation                 |
| K18 | Model C : `buildOnly/replay/stopInPlace/resume/seek` | hôte (handle)               | cmd composées       | voir signatures ci-dessous                                                | composées sur LE MÊME clock/scheduler/cursor → zéro état dupliqué                    |

`BeatPosition` (Kronos) = `KronosCursorBeat` (hôte) = `{ beatsTotal:number, bar:number, beat:number, phase:number }`.

#### Frontière PUITS — dispatch de l'hôte vers les runtimes de sortie

Périmètre : tout ce qui sort de Kanopi vers un **puits** (sink) de rendu. Kanopi
**branche** (`scheduler.addAdapter`), **construit** les sinks qui ont besoin de l'horloge
partagée (audio, OSC) ou de l'instance par-acteur (MIDI), **encadre** une fine couche-glu
(`audioAdapter`/`midiAdapter`/`oscRuntimeAdapter`/`codeAdapter`) qui remappe chaque
`ScheduledEvent` Kronos vers la forme que le sink attend, puis **gère le cycle de vie**
(stop / mute / close). Kanopi **ne route pas** (Kronos route sur `event.output.runtime`,
gravé par Kairos), **ne résout aucune hauteur** (Kairos grave `content.pitch.hz`), **ne rend
rien** (les runtimes rendent).

Fichiers porteurs (chemins absolus) :

- `/home/romi/dev/bp/kanopi/packages/ui/src/lib/runtimes/kronos-audio.ts` — LE point de
  dispatch : construit AudioRuntime + OscAdapter, déclare les 4 adaptateurs-glu, enregistre
  par nom de runtime sur le `Scheduler`, expose le handle (stop/mute/seek/replay…).
- `/home/romi/dev/bp/kanopi/packages/ui/src/lib/runtimes/bpx-adapter.ts` — construit le
  `MidiTransport` par-acteur, le backtick sink (`registerBacktickSink`), appelle
  `startKronosAudio`, gère mute/cut/refire des voix.
- `/home/romi/dev/bp/kanopi/packages/core/src/dispatcher/dispatcher.js` — SUPPRIMÉ [842] : le
  conteneur INERTE de transports (lifecycle seul) + `coerceControlValues` étaient morts (zéro
  appelant vif) ; `packages/core/src` ne contient plus que `index.js`, vide. Teardown = `voice.
  kronosAudio?.stop()` + `runtime.dispose()` (ex. `midi.dispose()`) + `stopCode` pour les voix-code
  (`bpx-adapter.ts`) ; coercition string→nombre désormais dans les runtimes de sortie (R2,
  `output-runtime-contract.ts:8`).
- `/home/romi/dev/bp/kanopi/packages/ui/src/lib/runtimes/{adapter,registry}.ts` — forme
  `RuntimeAdapter` des voix de code + registre des adaptateurs (7 voix + bp3/bpscript).
- Surfaces consommées (stubs de types locaux, ce que l'hôte VOIT du voisin aval) :
  `runtime-audio.d.ts`, `runtime-midi.d.ts`, `runtime-osc.d.ts`, `runtime-codevoices.d.ts`.

| #     | Direction (nom)                                       | Propriétaire       | Sens                                                      | Type / forme exacte                                                                                                                                   | Invariant                                                                                                                                                                                       |
| ----- | ----------------------------------------------------- | ------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1    | `scheduler.addAdapter(name, adapter)`                 | Kronos             | Kanopi **branche**                                        | `name: string` ∈ {`audio`,`webaudio`,`midi`,`osc`,`code`} ; `adapter: RuntimeAdapter` (Kronos)                                                        | l'hôte nomme la route ; **aucun adaptateur par défaut** ; un runtime sans sink → diag Kronos `unknown-output-runtime` + log hôte `warnMissing`, jamais reroutage silencieux                     |
| P2    | `adapter.send(event)`                                 | Kronos appelle     | Kronos → glu hôte                                         | `event: ScheduledEvent` (cf. 3.2)                                                                                                                     | Kronos a DÉJÀ choisi l'adaptateur sur `event.output.runtime` ; la glu lit `content`/`output` pour remapper, jamais pour router                                                                  |
| P3    | AudioRuntime `send(e)`                                | runtime-audio      | Kanopi → puits audio                                      | `{onset, duration, actor?, kind?, content:{token, controls?, modulations?, pitch?}}`                                                                  | le puits lit `content.pitch.hz` (gravé Kairos) + rend `content.modulations` ; l'hôte ne compile/rend rien                                                                                       |
| P4    | MidiTransport `send(event, absTime)`                  | runtime-midi       | Kanopi → puits MIDI (chemin par-acteur, canonique Kronos) | `event: Record<string,unknown>` (`token, startSec, durSec, …controls, velocity?, pitch?, chan?`) ; `absTime: number`                                  | runtime-MIDI POSSÈDE le fil (note+bend, CC) ; zéro copie MIDI dans `core` ; canal = `event.output.channel` gravé Kairos, jamais l'hôte                                                          |
| P4bis | MidiSink `load/start/stop`                            | runtime-midi       | Kanopi → puits MIDI (chemin J2 autonome)                  | `load(TimedToken[], metadata?)` ; `start(onEnd?)` ; `stop()`                                                                                          | chemin « flux de jetons tel quel » (bêta-ensemble) ; **distinct** du chemin par-acteur P4 — voir écart E4                                                                                       |
| P5    | OscAdapter `send(e)`                                  | runtime-osc        | Kanopi → puits OSC                                        | `e: OscScheduledEvent` (`onset, duration, actor?, kind?, output?, content:{token, controls?, modulations?, pitch?}`)                                  | l'hôte construit l'adaptateur sur l'horloge partagée + nomme `osc` ; le profil mappe `controls`/`token`→adresses ; device/channel voyagent sur `event.output` ; l'hôte ne résout aucune adresse |
| P6    | codevoices `RuntimeAdapter` (`evaluate/stop/…`)       | runtime-codevoices | Kanopi **branche** 7 voix + tire à l'onset                | `codeVoiceAdapters: readonly RuntimeAdapter[]` ; tirage via `backtickSink(token, info, interp)`                                                       | voix = sink soutenu tiré à l'onset du jeton `BT…` par Kronos ; l'hôte garde le câblage `registerBacktickSink` ; interpréteur = `event.output.device`                                            |
| P7    | `setBindings(bindings)` (setup OSC)                   | runtime-osc        | Kanopi → puits OSC (hors hot-path)                        | `Record<actor, {device?, channel?}>` dérivé de `metadata.actors` (`deriveOscBindings`)                                                                | ÉNUMÉRATION seule (pré-charge des surfaces) ; le device/channel par-événement reste sur `event.output`                                                                                          |
| P8    | Cycle de vie : `stop()` / `close()` / `setActorMuted` | Kronos / sinks     | Kanopi commande                                           | `handle.stop()`→`transport.stop`+`driver.stop`+`oscAdapter.close()` ; mute→`kairos.demande({type:'mute'})` ; code→`stopCodeVoices`/`refireCodeVoices` | l'hôte ne tient ni FSM ni position ; mute des notes passe par la porte d'écriture Kairos, pas par `adapter.setActorMuted`                                                                       |
| P9    | Lifecycle MIDI — teardown direct (dispatcher éliminé [842]) | Kanopi        | détention locale                                          | `midi.dispose()` (le runtime MIDI possède son transport, fermé au re-eval/stop)                                                                       | plus de conteneur intermédiaire : le runtime MIDI ferme lui-même son transport ; jamais lu pour router                                                                                          |
| P10   | Portillon de compatibilité voix↔appareil              | Kanopi             | validation amont                                          | `gateVoiceDevice(actor, transportKey, evalInterp)` → `isCompatible(VoiceOutputType, DeviceType)`                                                      | refus à l'éval d'une voix incompatible (erreur claire, jamais drop silencieux) ; lecture de type, pas de résolution/rendu                                                                       |

#### Frontière RUNTIME-UI — montage des vues de production

> **Principe dur** : Kanopi ne RÉSOUT / COMPOSE / REND RIEN. À cette frontière l'hôte (a) câble les
> onglets depuis `productionViews`, (b) tend un handle **lecture seule** sur le Kairos vivant
> (`structureCourante()` / `arbreCourant()`, pass-through, n'invente aucune forme), (c) tend le
> transport/curseur Kronos (LU, aucun compteur), (d) **pousse** la donnée à chaque bump de génération.
> Le rendu (Texte + Structure) vit **entièrement** dans runtime-ui. Verdict loi n°2 à F10 : **PROPRE**.

| Nom                    | Propriétaire      | Sens (hôte)            | Type/forme exact                                                      | Invariant                                                                        |
| ---------------------- | ----------------- | ---------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Câblage des onglets    | runtime-ui        | l'hôte lit             | `productionViews: readonly ViewModule[]` = `[textView, timelineView]` | l'hôte mappe `{id,title}`→onglets ; ne possède aucun rendu                       |
| Cycle de vie d'une vue | runtime-ui        | l'hôte appelle         | `mount(ViewHost)` · `update(ProductionInput)` · `unmount()`           | l'hôte monte/pousse/démonte ; la vue LIT, ne recalcule rien                      |
| Surface DOM            | Kanopi (hôte)     | l'hôte fournit         | `ViewHost = { readonly container: HTMLElement }`                      | l'hôte gère l'agencement ; la vue ne place pas sa surface                        |
| Vue arbre (structure)  | Kairos            | l'hôte lit→pousse      | `ProductionStructure \| null` via `productionFeed.structure()`        | pass-through `kairos.structureCourante()` ; aucune corrélation/résolution hôte   |
| Plat (réservé)         | Kairos/Kronos     | l'hôte lit→pousse      | `FlatView \| null` via `productionFeed.plat()`                        | pass-through `kairos.arbreCourant()` (try/catch→null) ; **lu par aucune vue v1** |
| Transport/curseur      | Kronos            | l'hôte lit→pousse      | `TransportView = { mode, cursor }` (`kronosCursor.state` + `.active`) | l'hôte LIT `position()` par frame ; aucune FSM/compteur hôte                     |
| Signal de re-rendu     | Kanopi (hôte)     | l'hôte écrit→déclenche | `productionFeed.generation: number` (bump sur (re)load + swap)        | bump = « l'arbre vivant a changé » ; le `$effect` repousse `update()`            |
| Retour vue→scène       | runtime-ui→Kairos | sortant                | **∅ aujourd'hui**                                                     | runtime-ui n'émet RIEN ; canal sortant = Q2, amendement conscient                |

### 3.2 Signatures exactes (champ par champ, par frontière)

#### Frontière AMONT — signatures

**Résultat de dérivation** (forme PRODUCTRICE, ENGINE_SPEC §4.1) :

```
DerivationResult = { tree: DerivationTree; tokens: TimedToken[] }   // forme « BPxInstance »
```

RÉALITÉ Kanopi (chemin `Session`) : `derive()` rend `{ tree }` (+ `meter?` + `sceneTiming` posés sur
le résultat), et les jetons plats viennent SÉPARÉMENT de `emit('timed-tokens')`. L'hôte recompose
localement `{ tree, tokens }` (bpx-adapter:1470-1473).

**`DerivationTree`** :

```
DerivationTree = {
  root: TreeNode;
  metadata: {
    totalDurationBeats: number;   // LU (borne de boucle)
    tempo: number;                // LU (source unique tempo)
    generation: number;           // NON lu par l'hôte
    seed: number;                 // NON lu (l'hôte tient son propre currentSeed)
    derivationTimeMs: number;     // NON lu
    actors?: Record<acteur, ActorEntry>;  // LU (énum OSC) — KAI-9/10
    scenePitch?: { alphabet?; tuning?; tokens };  // présent, NON lu (→ Kairos)
  }
}
```

**`ActorEntry`** (`metadata.actors[acteur]`, émise dès ≥1 réglage) :

```
ActorEntry = {
  runtime?: 'midi' | 'osc' | 'audio' | … ;  // KAI-9, si transport déclaré
  params?:  Record<…>;                       // canal/device/port, si transport déclaré
  alphabet?: string;                         // KAI-10, si déclaré (alphabet.X)
  tuning?:   string;                         // KAI-10, si déclaré (tuning.Y)
}                                            // inclut l'acteur synthétique 'default'
```

**`Span`** (FLOAT64 partout, aucun arrondi) :

```
Span = {
  startBeat; endBeat; durationBeats;     // présents — NON lus par l'hôte
  startMs;   endMs;   durationMs;        // l'hôte lit UNIQUEMENT startMs + endMs
  tempoMultiplier;                       // présent — NON lu
}
```

**`TreeNode`** (5 familles en 'sounding' ; +`control` en 'complete' — voir Écart B) :

```
| { type:'sequence';   id; span; children: TreeNode[]; ruleRef: RuleRef | null }
| { type:'polymetric'; id; span; voices: VoiceNode[]; constraint:'equal-span';
    speed: number | null; ruleRef?: RuleRef | null }
| { type:'voice';      id; span; children: TreeNode[];
    proportions: Float64Array; symbolCount: number }
| { type:'occupying';  id; span; symbolId: number; payload: unknown;
    role:'leaf'|'rest'|'prolongation'; tieState:'start'|'continue'|'end'|null;
    ruleRef?: RuleRef | null }
| { type:'event';      id; span; symbolId: number; payload: unknown; ruleRef?: RuleRef | null }
| { type:'control';    id; span; symbolId; payload; kind }   // 'complete' SEULEMENT — voir Écart B
```

Champs RÉELLEMENT lus par l'hôte sur un nœud : `type`, `children`/`voices` (descente DFS),
`span.startMs`/`span.endMs`, `symbolId` (≥0). Ignorés (lecture partielle légitime) : `id`,
`ruleRef`, `tieState`, `proportions`, `symbolCount`, `payload`, `constraint`, `speed`, `kind`.

**`RuleRef`** (peuplé v2, NON lu par l'hôte) : `{ subgrammarIndex: number; ruleIndex: number;
lhsSymbolId: number }`. Racine = `null`.

**`TimedToken`** (flux plat, ms — `bp3-deps.d.ts:20`) :

```
TimedToken = {
  token: string;     // terminal écrit dans la grammaire
  start: number;     // onset ms
  end: number;       // fin ms
  duration: number;
  type: 'terminal' | 'rest' | 'control' | 'out_time';   // 'out_time' = valeur additionnelle réelle
  actor: string | null;
  [k: string]: unknown;
}
```

L'hôte FILTRE `t.type !== 'control'` avant tout consommateur aval (bpx-adapter:~1520) ; en
'sounding' il n'y a de toute façon aucun jeton control.

**`meter`** (`meter.ts`) : `{ numerators: readonly number[]; denom: number }`. Projeté en un entier
beats-par-barre : `[N]`/`[N,N,…]`→N ; additif différent `[a,b,…]`→`sum` (LIMITE documentée : la
sous-barre interne n'est pas projetée). Absent ⇒ `DEFAULT_BEATS_PER_BAR = 4` (repli, pas autorité).

**`sceneTiming`** (TOUJOURS présent côté BPx ; NON consommé côté hôte) :

```
SceneTiming = {
  natureOfTime: 'smooth' | 'striated';        // valeur effective (défaut strié)
  quantizationMs: number;                      // valeur effective (défaut 10)
  clock?: { pclock: number; qclock: number };  // déclaré-seulement
  duration?: { amount: number; unit: 'b' | 's' }; // déclaré-seulement (@duration)
}
```

**Résolution des noms** : `grammar.symbols.getName(id: number) => string`. L'hôte parcourt l'arbre
(DFS sur `children`/`voices`), résout chaque feuille `occupying`/`event` à `symbolId ≥ 0`, et bâtit
`symbolNames: Record<number,string>` (`buildSymbolNames`). Sur échec API ⇒ table vide, repli sur la
corrélation temporelle. Rests = `symbolId -1` (jamais résolus, `getName(-1)` lèverait).

#### Frontière `charger()` (C1) — signatures

```ts
// ── Le point d'entrée (Kairos possède la forme ; l'hôte appelle) ──
charger(arbre: DerivationTree, contexte: ContexteProjection): void   // kairos.ts:47

// ── Le 2ᵉ argument : UN seul objet ContexteProjection (projeter.ts:32-60) ──
interface ContexteProjection {
  // ── produits par BPx (session.buildProjectionContext()), étalés tels quels ──
  resolveName:          (symbolId: number) => string;                 // nom résolu (vue arbre + token)
  resolveKind?:         (symbolId: number) => string;
  transformMs?:         (ms: number) => number;                        // option d'émission
  kpressOffset?:        number;
  order?:               'chronological' | 'voice-major';               // défaut buildProjectionContext = voice-major
  resolveRuntimeState?: (nodeId: number) => Record<string, number> | null;
  transposeToken?:      (token: string, steps: number) => string;      // ⚠️ Kanopi NE le fournit PAS (transpose dans Kairos)

  // ── posés PAR L'HÔTE (les facettes-librairies que Kanopi FOURNIT, sans rien exécuter) ──
  pitchLib?:   PitchLib;                                               // KAI-10 — catalogues de hauteur (5 JSON bpscript/lib)
  digitalLib?: DigitalLib;                                             // KAI-B03 — lib de fonctions digitales (transpose), body-full du bundle bpscript (LIBS.digital)
  modulation?: {                                                       // KRO-24 — contexte CV
    registry:   Readonly<Record<string, Modulator>>;                   // buildModulators(cvInstances, modLib), construit par l'hôte
    exprSource?: ExprSource;                                           // factory de courbe (runtime-audio)
  };
}

// ── pitchLib : assemblé par l'hôte (bpx-adapter.ts:137-143) ──
const PITCH_LIB: PitchLib = {                                          // builder.ts:45-51
  alphabets:    Readonly<Record<string, AlphabetEntry | undefined>>;   // ← bpscript/lib/alphabets.json
  tunings:      Readonly<Record<string, TuningEntry   | undefined>>;   // ← bpscript/lib/tunings.json
  temperaments: Readonly<Record<string, unknown>>;                     // ← bpscript/lib/temperaments.json
  scales:       Readonly<Record<string, unknown>>;                     // ← bpscript/lib/scales.json
  octaves:      Readonly<Record<string, unknown>>;                     // ← bpscript/lib/octaves.json
};
interface AlphabetEntry {                                              // builder.ts:25-29
  notes?:       readonly string[];
  alterations?: Readonly<Record<string, number>> | readonly string[];
  octaves?:     string;
}
interface TuningEntry {                                                // builder.ts:32-42
  temperament?: string; alphabet?: string; scale?: string;
  degrees?:     readonly number[]; ascending?: readonly number[];
  alterations?: Readonly<Record<string, Ratio>>;
  baseHz?:      number; baseNote?: string; baseRegister?: number;
}

// ── modulation.registry : EXÉCUTÉ par l'hôte (bpx-adapter.ts:1512-1517) ──
buildModulators(                                                       // @kronos/core, modulator-registry.ts:37
  instances: readonly CvInstance[],   // ← (ast.cvInstances ?? [])  (facette de l'AST BPx)
  lib:       ModLib,                  // ← modLibJson (bpscript/lib/mod.json)
): Record<string, Modulator>;
interface CvInstance   { name: string; objectType: string;            // modulator-registry.ts:13-19
                         args?: readonly (number|string)[];
                         namedArgs?: Readonly<Record<string, number|string|boolean>>;
                         code?: string | null; }
interface ModLib       { objects: Readonly<Record<string, ModLibObject>>; }     // :27-29
interface ModLibObject { parameters: Readonly<Record<string, {default: number|string|boolean}>>;
                         curve: Curve; }                              // :22-25
interface Modulator    { objectType: string; params: CurveParams; curve: Curve; } // :31-35
// Règle de fusion exécutée DANS l'hôte : défauts lib < args positionnels < args nommés.

// ── modulation.exprSource : passé par l'hôte (bpx-adapter.ts:983-989) ──
type ExprSource = (req: ExprRequest) => ModulationSource | null;       // compose.ts:88
// onExprSource = (exprSource de runtime-audio) as unknown as ExprSource ; câblé au chargement du module.

// ── L'autre porte hôte→Kairos (frontière H du contrat Kairos) ──
setReDerive(callback: (() => void) | null): void;                      // kairos.ts:98
// Kanopi NE l'appelle plus en direct : startKronosAudio fait kairos.setReDerive(reRandom && loop ? cb : null).

// ── Facette gravée EN AVAL par Kairos (preuve que l'hôte ne résout rien) ──
interface PitchFacet { hz: number; noteName?: string; alteration?: string|null;  // hauteur.ts:28-39
                       register?: number; degree?: number; }
// content.pitch (PitchFacet) + content.sounds (boolean) sont GRAVÉS par Kairos, jamais par l'hôte.
```

**Identité par acteur (alphabet/accordage) : SUR L'ARBRE, pas dans le contexte.** Les CHOIX de
hauteur voyagent dans `arbre.metadata.actors[a].{alphabet,tuning}` + repli `arbre.metadata.scenePitch.
{alphabet,tuning,tokens}` (écrits par BPx, lus par `resoudre-hauteur.ts:117-137`). L'hôte ne pose que
les **catalogues** ; c'est exactement le modèle KAI-9 (l'adresse voyage dans la donnée). Conforme.

**Les deux sites d'appel sont identiques sur ces facettes** : eval (`:1531-1557`) et re-dérive au bord
(`:1799-1808`) étalent tous deux `...bpx.buildProjectionContext()` + `pitchLib: PITCH_LIB` +
`modulation: { registry: kronosRegistry, exprSource: onExprSource }`. `kronosRegistry` est hissé
(cycle-invariant) donc construit UNE fois ; seul le littéral `{pitchLib, modulation}` est répété.

#### Frontière KRONOS — signatures

**K12 — `OutputRef` (KAI-9, `runtime-adapter.ts:33-40`)** — l'adresse effective gravée par événement :

- `runtime: string` — nom de sortie opaque et stable, clé de routage O(1) (`'audio'|'webaudio'|'midi'|'osc'|'code'`). Kronos sélectionne l'adaptateur dessus, ne le résout pas.
- `device?: string` — adressage fin OPAQUE pour le cœur ; lu par le sink seul (ex. interpréteur `strudel`/`hydra` pour `code`, device OSC).
- `channel?: number` — canal OPAQUE pour le cœur ; lu par le sink seul (ex. canal MIDI).

**K13 — `ScheduledEvent` (`runtime-adapter.ts:43-70`)** — forme cœur ratifiée (option B, 2026-06-21) :

- `onset: number` — instant matériel absolu t_audio (s) — CŒUR.
- `duration: number` — durée s audio déjà dilatée par le rate — CŒUR.
- `actor?: string` — acteur d'origine ; absent en mono ; reste clé de MUTE/arm (KAI-7), distincte du routage.
- `output?: OutputRef` — étiquette de routage (K12), transportée telle quelle ; absente ⇒ routage par `actor` (rétro-compat).
- `content: EventContent` = `Readonly<Record<string,unknown>>` — charge OPAQUE, jamais lue par le cœur.
- `kind?: 'note' | 'control'` — absent ⇒ `'note'` ; un `'control'` est un marqueur output-facing horodaté.
- `nature?: string` — étiquette BPx OPAQUE pour un `'control'` (ex. `instant`) ; le cœur route dessus, ne la lit pas.

**Forme OBSERVÉE de `content`** (NON figée, cadrée par-runtime) telle que produite par `prep()` dans `kronos-audio.ts:357-379` :
`{ token:string, controls?:Record<string,unknown>, rq?:Record<string,number>, startSec?:number, modulations?:ModulationBinding[], pitch?:unknown }` — la hauteur arrive en `content.pitch.hz` **déjà résolue par Kairos** (KAI-10) ; modulation CV en `content.modulations`.

**K14 — `RuntimeAdapter` (`runtime-adapter.ts:72-94`)** — surface que l'hôte fournit à Kronos :

- `send(event: ScheduledEvent): void` — émet un événement déjà horodaté en t_audio absolu (obligatoire).
- `latency?: number` — latence propre (s), compensée à la planif : `onset = audioTimeFor(t_scène) − latency` ; absente ⇒ 0.
- `close?(): void` — libère les ressources de la sortie.
- `stop?(): void` — stop de scène : ferme les voix EN COURS (sinks SOUTENUS code/Strudel/Hydra ; un synthé note n'en a pas besoin).
- `setActorMuted?(actor:string, muted:boolean): void` — arm/désarm propagé par l'ordonnanceur (arrête/relance une voix soutenue).

**Adaptateurs construits par l'hôte (`kronos-audio.ts:383-471`)** — glue minimale, un par runtime :

- `audioAdapter` (`'audio'`+`'webaudio'`, l.383) → `audioSink.send({onset, duration, actor, kind, content:{token, controls, pitch, modulations}})`.
- `midiAdapter` (`'midi'`, l.404) → `midiSink.send({token, startSec, durSec, ...coerced, velocity?, pitch?, chan?}, ev.onset)` ; `chan = ev.output.channel`.
- `oscRuntimeAdapter` (`'osc'`, l.427) → `oscSink.send({onset, duration, actor, kind, output:ev.output, content:{token, controls, pitch, modulations}})` — `output` relayé VERBATIM.
- `codeAdapter` (`'code'`, l.453) → `backtickSink(token, {startSec, durSec, absTime:ev.onset}, interp=ev.output.device)` ; **pas de `stop()`** (les voix de code sont coupées par l'hôte à Pause/Stop, préservées sur re-éval même-fichier).

**K1-K9 — commandes/état Kronos `Transport` (`kronos/src/transport/transport.ts`)** :
`play():void` (l.132) · `pause():void` (l.140) · `stop():void` (l.149) · `step(n=1):void` (l.163) · `seek(scene:number):void` (l.176) · `setTempo(bpm:number):void` (l.186) · `setRate(r:number):void` (l.191) · `get state():TransportState` (l.219) · `position():number` (l.229) · `beatPosition(beatsPerBar=4):BeatPosition` (l.239) · `absoluteBeatPosition(beatsPerBar=4):BeatPosition` (l.249) · `get tempo():number` (l.278) · `onStateChange(cb):()=>void` (l.303) · `bindStructureSource(source):void` (l.86) · `loopDurationScene():number` (l.261) · `setStepGrain(scene):void` (l.213).

**K18 — handle hôte `KronosAudioHandle` (`kronos-audio.ts:148-208`)** — composition Model C sur le MÊME clock/scheduler/cursor :

- `transport: Transport` — la machine d'état unique + autorité de position (l'hôte projette dessus).
- `beatsPerBar: number` — replié depuis le mètre dérivé (`DeriveResult.meter`, autorité BPx) ; lu par le store curseur pour les events onBar/onBeat.
- `stop(): void` — teardown one-shot : `transport.stop()` + `driver.stop()` + `oscAdapter.close()` (re-éval même-fichier ; ne coupe PAS les voix de code).
- `stopInPlace(): void` — STOP Model C : position→0, émission off, timeline conservée ; `oscAdapter.stop()` (socket gardé) + `stopCodeVoices()`.
- `replay(): void` — rejoue de 0 sans re-dérivation : `transport.play()` + `driver.start()` + `refireCodeVoices()`.
- `cutCodeVoices()/refireCodeVoices(): void` — coupe/relance les voix de code soutenues (PAUSE/REPRISE, géré hôte).
- `setReRandom(on:boolean): void` — installe/retire la re-dérivation sur le scheduler actif (gate `reRandom ⊗ loop`).
- `setLoop(on:boolean): void` — `scheduler.setLoop(on)` + `cursor.setLoop(on)` + ré-évalue la re-dérivation.
- `position(): number` — t_scène lu du Transport (exception STEP : retourne `step.fromSec`, pas la borne d'atterrissage).
- `beatPosition(): KronosCursorBeat` — bar·beat lu du Transport (exception STEP : `cursor.beatPositionForScene(step.fromSec,…)`).
- `seek(sceneSec): void` — re-ancre `clock.start(sceneSec)` + `scheduler.start(sceneSec)`, sans nouveau graphe audio.
- `resume(sceneSec): void` — reprise en place : `scheduler.setSceneBound(null)` + re-ancre + `driver.start()` (un seul scheduler sur tout play→pause→play).
- `retune(bpm): void` — tempo live via `kairos.demande({type:'tempo', bpm, quand:'immediat'})` (PAS `transport.setTempo`).
- `setActorMuted(actor, muted): void` — via `kairos.demande({type:'mute', acteur, muet, quand:'immediat'})`.

**K15 — store `transport.svelte.ts`** : `loop=$state(true)`, `reRandom=$state(false)` ; `setLoopSink/setReRandomSink` câblés par bpx-adapter pour atteindre la voix Kronos EN COURS (handle `kronosAudio`, effectif au prochain cycle — plus de dispatcher, husk éliminé [842]) ; `toggleLoop/toggleReRandom`.

**Câblage commandes (boutons) → Transport** : `playback.svelte.ts` mappe les gestes boutons →
commandes Transport et PROJETTE `mode` depuis `kronosCursor.state` (aucune FSM hôte) :
`play()` (résume si paused, sinon `replayActiveScene()` Model C, sinon éval) · `pause()` (`transport.pause()`+`cutCodeVoices()`) · `stop()` (`stopInPlace()`) · `step(file)` (beat suivant DÉRIVÉ de `handle.beatPosition().beatsTotal+1`, jamais un compteur hôte) · `activeBeat()` (lu de `transport.beatPosition()`).

**Lecture position /frame — `kronos-cursor.svelte.ts`** : une boucle rAF privée échantillonne
`active.beatPosition()` (display) et `transport.absoluteBeatPosition(beatsPerBar)` (events beat/bar sur croisements d'entiers, count = index absolu Kronos, jamais un tally `+1`). `state` miroité via `onStateChange`, `tempo` garde-échantillonné. Gelé/effacé hors `running`.

#### Frontière PUITS — signatures

##### Événement universel reçu de Kronos — `ScheduledEvent`

(source : `/home/romi/dev/bp/kronos/src/runtime/runtime-adapter.ts`)

```ts
interface ScheduledEvent {
  readonly onset: number; // t_audio absolu (s), latence adaptateur déjà compensée
  readonly duration: number; // s audio (déjà dilatée par le rate horloge)
  readonly actor?: string; // acteur d'origine ; clé de MUTE/arm (KAI-7), ≠ routage
  readonly output?: OutputRef; // calque de routage KAI-9 (cf. ci-dessous) ; absent ⇒ route par actor
  readonly content: EventContent; // charge OPAQUE pour le cœur ; transportée verbatim
  readonly kind?: "note" | "control"; // absent ⇒ 'note'
  readonly nature?: string; // étiquette BPx opaque pour un 'control' ; cœur route, ne lit pas
}
type EventContent = Readonly<Record<string, unknown>>;
interface OutputRef {
  readonly runtime: string; // clé de routage opaque ('audio'|'midi'|'osc'|'code'|'webaudio')
  readonly device?: string; // adressage fin OPAQUE pour le cœur ; lu par le sink seul
  readonly channel?: number; // canal OPAQUE pour le cœur ; lu par le sink seul
}
```

##### Adaptateur de sortie Kronos — `RuntimeAdapter` (forme cœur ratifiée option B)

```ts
interface RuntimeAdapter {
  send(event: ScheduledEvent): void; // émet un événement déjà horodaté t_audio
  readonly latency?: number; // s ; absent ⇒ 0 ; onset = audioTimeFor(t_scène) − latency
  close?(): void; // libère les ressources de la sortie
  stop?(): void; // stop de scène : ferme les voix EN COURS (sinks soutenus)
  setActorMuted?(actor: string, muted: boolean): void; // arm/désarm d'une voix en cours
}
```

**Forme observée côté glu Kanopi** : les 4 adaptateurs-glu n'implémentent QUE `send`
(audioAdapter, midiAdapter, oscRuntimeAdapter, codeAdapter). `stop`/`setActorMuted`/`close`/
`latency` ne sont PAS portés sur la glu — le stop/mute passe ailleurs (handle Kronos +
`kairos.demande`) — cf. écart E3.

##### Couche-glu — remapping `content` par sink (kronos-audio.ts)

Fonction commune `prep(content)` :

- `coerced = coerceControlValues(content.controls)` — string-numérique → number (`vel:'80'`→80,
  `filterQ:'2.5'`→2.5, exposants OK ; hex/`Infinity`/`NaN`/non-numérique restent string ;
  overflow ±Infinity → on garde la string).
- puis **supprime** toute clé `coerced[k]` dont la valeur est un objet (descripteur CV résiduel —
  la modulation passe par `content.modulations`).
- `velRaw` = `coerced.vel` (number) sinon `content.rq.vel` (number) sinon `undefined`.

`audioAdapter.send(ev)` → `audioSink.send({`
`onset: ev.onset, duration: ev.duration, actor: ev.actor, kind: ev.kind,`
`content: { token: c.token, controls: {…coerced, velocity?: velRaw/127}, pitch: c.pitch, modulations: c.modulations ?? [] } })`.

`midiAdapter.send(ev)` → `midiSink.send({`
`token: c.token, startSec: c.startSec ?? 0, durSec: ev.duration, …coerced,`
`velocity?: velRaw/127, pitch?: c.pitch, chan?: ev.output.channel }, ev.onset)`.

`oscRuntimeAdapter.send(ev)` → `oscSink.send({`
`onset, duration, actor, kind, output: ev.output,`
`content: { token: c.token, controls: coerced, pitch: c.pitch, modulations: c.modulations ?? [] } })`.

`codeAdapter.send(ev)` → `backtickSink(ev.content.token, {startSec: c.startSec ?? 0, durSec: ev.duration, absTime: ev.onset}, ev.output.device)`.
Pas de `stop()` sur `codeAdapter` (un re-eval même-fichier ne doit pas couper Hydra/Strudel encore voulu).

Enregistrement (kronos-audio.ts:476-483) :
`new Scheduler({clock, timeline, loop})` ;
`addAdapter('audio', audioAdapter)` + `addAdapter('webaudio', audioAdapter)` (si audioSink) ;
`addAdapter('midi', midiAdapter)` (si midiSink) ; `addAdapter('osc', oscRuntimeAdapter)` (si oscSink) ;
`addAdapter('code', codeAdapter)` (si backtickSink). **Aucun adaptateur par défaut.**

##### Puits AUDIO — `runtime-audio` (surface consommée)

```ts
class AudioRuntime {
  constructor(audioCtx: AudioContext, opts?: AudioRuntimeOptions);
  send(event: {
    onset: number;
    duration: number;
    actor?: string | null;
    kind?: string;
    content: {
      token: string;
      controls?: Record<string, unknown> | null;
      modulations?: unknown[] | null;
    };
  }): void;
  stop(): void;
  setActorMuted(actor: string, muted: boolean): void;
}
interface AudioRuntimeOptions {
  sounds?: { resolve(token: string): unknown } | undefined; // VIDE dans Kanopi (aucune résolution son ici)
  clock?: AudioClock; // mapping t_scène↔t_audio (CV)
}
interface AudioClock {
  musicalNow(audioTime: number): number;
  audioTimeFor(sceneSec: number): number;
}
function createAudioRuntime(
  audioCtx: AudioContext,
  opts?: AudioRuntimeOptions,
): AudioRuntime;
const exprSource: (req: {
  spec: unknown;
  params?: unknown;
  startScene: number;
  endScene: number;
  gateSec?: number;
}) => ModulationSource | null; // fabrique de courbe CV injectée dans la composition Kronos
```

Construction (kronos-audio.ts:282) : `createAudioRuntime(audioCtx, { clock, sounds: undefined })`.
`audioSink = opts.sinks?.webaudio ?? opts.sinks?.audio ?? audioRuntime`. KAI-10 : aucun
résolveur de hauteur injecté (l'option `pitch` a disparu).

##### Puits MIDI — `runtime-midi` (deux surfaces déclarées)

```ts
// (P4) chemin par-acteur, canonique Kronos — ce que kronos-audio.ts utilise :
class MidiTransport {
  constructor(opts?: MidiTransportOptions);
  init(): Promise<void>; // requête port Web MIDI ; pas de matériel → no-op, ne jette jamais
  send(event: Record<string, unknown>, absTime: number): void;
}
interface MidiTransportOptions {
  outputIndex?: number;
  resolver?: unknown;
  keyOffset?: number;
} // keyOffset = 60 − c4key

// (P4bis) chemin J2 autonome (flux de jetons tel quel, bêta-ensemble) :
class MidiSink {
  constructor(audioCtx: AudioContext, opts?: MidiSinkOptions);
  init(): Promise<boolean>; // false si aucun port MIDI
  setOutput(port: unknown): void;
  load(bpxTimedTokens: TimedToken[], metadata?: Record<string, unknown>): void;
  start(onEnd?: () => void): void;
  stop(): void;
}
interface MidiSinkOptions {
  outputIndex?: number;
  tuning?: string;
  controlDefaults?: Record<string, unknown>;
}
```

Câblage réel (bpx-adapter.ts:~2146-2161, `createMidiRuntime({})` — a remplacé `new MidiTransport({})`,
staleness adjacente non traitée ici) : un seul runtime MIDI pour la scène, `await midi.init().catch(()=>{})`,
teardown direct `midi.dispose()` (plus de `dispatcher.addTransport`, husk éliminé [842] : le paquet MIDI
possède désormais le cycle de vie de son transport), puis passé en `sinks: { midi }` à `startKronosAudio`.

##### Puits OSC — `runtime-osc/browser` (surface consommée)

```ts
class OscAdapter {
  constructor(opts: {
    transport: OscTransport;
    profile?: OscOutputProfile;
    prefix?: string;
    latency?: number;
    now?: () => number;
  });
  readonly latency: number;
  setBindings(bindings: Record<string, OscBinding>): Promise<void>; // setup, hors hot-path
  send(event: OscScheduledEvent): void; // émet un événement déjà horodaté t_audio
  stop(): void; // annule les émissions planifiées non envoyées
  setActorMuted(actor: string, muted: boolean): void;
  close(): void; // libère timers + transport
}
interface OscBinding {
  device?: string;
  channel?: number;
} // donnée de scène @actor X device:<name> ch:<n>
interface OscOutputRef {
  runtime: string;
  device?: string;
  channel?: number;
} // gravé Kairos par événement (KAI-9)
interface OscScheduledEvent {
  onset: number;
  duration: number;
  actor?: string | null;
  kind?: string;
  output?: OscOutputRef;
  content: {
    token: string;
    controls?: Record<string, unknown> | null;
    modulations?: unknown[] | null;
  };
}
interface OscTransport {
  send(bytes: unknown): void;
  close?(): void;
}
class WebSocketTransport implements OscTransport {
  constructor(opts: {
    socket?: unknown;
    url?: string;
    WebSocketImpl?: unknown;
  });
  send(bytes): void;
  close(): void;
}
interface OscOutputProfile {
  map(
    event: OscScheduledEvent,
  ): Array<{ offsetSec: number; address: string; args: unknown[] }>;
  prepareSurfaces?(deviceNames?: string[]): Promise<void>;
  setBindings?(bindings: Record<string, OscBinding>): Promise<void>;
}
class OscBridgeProfile implements OscOutputProfile {
  constructor(opts?: {
    library?: { resolve(name: string): unknown } | null;
    resolveSurface?: ((name: string) => unknown) | null;
    resolveHz?: (token: unknown) => number | null;
    velocity?: number;
    pitchBendRange?: number;
    sendPitchBend?: boolean;
    log?: (msg: string) => void;
  });
  map(event): Array<{ offsetSec: number; address: string; args: unknown[] }>;
  prepareSurfaces(deviceNames?): Promise<void>;
  setBindings(bindings): Promise<void>;
}
```

Construction (kronos-audio.ts:301-339), gardée par `!buildOnly && oscBindings non vide && oscWsUrl` :
`ws = new WebSocket(oscWsUrl)` (URL lue de `library/routing.json` → `osc.ws`) avec log « relais
injoignable » sur `error`/`close` non-propre ; `transport = new WebSocketTransport({socket: ws})` ;
`oscAdapter = new OscAdapter({ transport, profile: new OscBridgeProfile({log}), now: ()=>audioCtx.currentTime })` ;
`void oscAdapter.setBindings(deriveOscBindings(opts.actors)).catch(log)`.
`deriveOscBindings` ne retient que les acteurs `runtime==='osc'` de `metadata.actors`, extrait
`device` (string) et `channel` (`params.channel` sinon `params.ch`).

##### Puits VOIX DE CODE — `runtime-codevoices` + forme `RuntimeAdapter` (adapter.ts)

```ts
interface RuntimeAdapter {
  readonly id: Runtime; // 'strudel'|'tidal'|'hydra'|'p5'|'mercury'|'csound'|'js' (sous-ensemble de Runtime)
  readonly outputType: VoiceOutputType; // OBLIGATOIRE — pilote la compatibilité voix↔appareil
  readonly extensions: readonly string[]; // ex. ['.hydra'] (avec le point)
  evaluate(code: string, src: EvalSource, log: LogPush): Promise<void>; // point de capture tiré par Kronos
  stop(src: EvalSource, log: LogPush): Promise<void>;
  setBpm?(bpm: number, log: LogPush): void;
  onBeat?(count: number, log: LogPush): void; // battement monotonic du clock central
  onBar?(count: number, log: LogPush): void;
  readonly events?: EventBus; // relayé dans core.events au démarrage
  dispose(): Promise<void>;
}
type VoiceOutputType =
  | "notes"
  | "signal"
  | "visual"
  | "control"
  | "light"
  | "text";
type EvalSource = {
  actorId?: string;
  fileId: string;
  docOffset?: number;
  flags?: Record<string, number>;
  section?: { index: number; count: number };
  produceOnly?: boolean;
};
type LogPush = (e: {
  runtime: Runtime;
  level: "info" | "warn" | "error";
  msg: string;
}) => void;
type Runtime =
  | "kanopi"
  | "strudel"
  | "hydra"
  | "p5"
  | "mercury"
  | "csound"
  | "bp3"
  | "bpscript"
  | "tidal"
  | "sc"
  | "python"
  | "js"
  | "system";

const codeVoiceAdapters: readonly RuntimeAdapter[]; // les 7 voix prêtes à étaler dans la registry
// + attaches DOM : attachHydraCanvas(el), attachP5Container(el)
// + pont Strudel CM : widgetPlugin, extensions, highlightExtension, registerStrudelEditorView/unregister,
//   strudelStatus/onStrudelStatus/onStrudelError/onSlotErrorChange/getSlotErrors, loadSampleBank
```

Registre (registry.ts) : `Map<Runtime, RuntimeAdapter>` = `…codeVoiceAdapters.map(a→[a.id,a])`

- `['bp3', bp3Adapter]` + `['bpscript', bpscriptAdapter]`. Placeholders extensions `.scd→sc`,
  `.py→python`. `getAdapter`, `listRuntimes`, `knownExtensions`, `runtimeFromExtension` (défaut `bpscript`).

Tirage à l'onset (`registerBacktickSink`, bpx-adapter.ts:1179) :
`sink(token, info, interp)` → `entry = backticks[token]` ; saute si l'acteur est dans
`mutedActors` ; `runtime = runtimeForInterp(interp ?? entry.interp)` ; import dynamique de
`./registry` (casse le cycle bp3↔registry) → `getAdapter(runtime).evaluate(entry.code, {actorId, fileId}, log)` ;
interpréteur inconnu / pas d'adaptateur → log erreur (jamais silencieux), fire-and-forget.

##### Dispatcher inerte (lifecycle MIDI) — SUPPRIMÉ [842], historique

Le conteneur `class Dispatcher` (`packages/core/src/dispatcher/dispatcher.js`) — un `transports:
Record<string, {close()}>` par nom pour fermer chaque transport au re-eval, plus `coerceControlValues`
(string→number) — était un husk post-Kronos sans appelant vif (« INERT TRANSPORT CONTAINER ONLY »,
post-RA-6/post-KAI-9). Éliminé entièrement (classe + fonction + `bp3-core.d.ts`) ; `packages/core/src`
ne contient plus que `index.js`, vide. Remplacé par : teardown MIDI direct `midi.dispose()` (le paquet
runtime-MIDI possède son transport) ; coercition string→number désormais dans les runtimes de sortie
(R2, `output-runtime-contract.ts:8`), jamais côté hôte. Le routage reste par `event.output.runtime`
(inchangé — c'était déjà vrai avant la suppression du husk).

#### Frontière RUNTIME-UI — signatures (code réel runtime-ui `src/contract/`)

**Cycle de vie — `view.ts`**

```ts
export type ViewId = "text" | "structure"; // ⚠ réel = 'structure' (UI-7), PAS 'timeline'
export type PlaybackMode = "stopped" | "running" | "paused"; // vocabulaire Kronos : 'running'

export interface CursorView {
  position(): number;
} // secondes (t_scene), curseur mobile / gelé en pause
export interface TransportView {
  readonly mode: PlaybackMode;
  readonly cursor: CursorView | null; // null quand aucune scène live
}
export interface ProductionInput {
  readonly structure: ProductionStructure | null; // null avant tout eval / voix backtick
  readonly plat?: FlatView | null; // réservé acteurs/pistes — lu par AUCUNE vue v1
  readonly transport?: TransportView; // absent pour la vue Texte
}
export interface ViewHost {
  readonly container: HTMLElement;
}
export interface ViewModule {
  readonly id: ViewId;
  readonly title: string;
  mount(host: ViewHost): void;
  update(input: ProductionInput): void;
  unmount(): void;
}
```

**Donnée de production — `production.ts`**

```ts
export interface SecSpan {
  start: number;
  end: number;
} // SECONDES (t_scene)
export type StructureNode =
  | { type: "sequence"; children: StructureNode[]; span: SecSpan }
  | { type: "polymetric"; voices: StructureNode[]; span: SecSpan }
  | { type: "voice"; children: StructureNode[]; span: SecSpan }
  | {
      type: "occupying";
      name: string;
      role: "leaf" | "rest" | "prolongation";
      span: SecSpan;
    }
  | { type: "event"; name: string; span: SecSpan };
export interface ProductionStructure {
  root: StructureNode;
  durationSec: number; // borne de boucle AUTORITAIRE (Kairos), LUE
}
export interface FlatEvent {
  readonly sceneOnset: number;
  readonly sceneDuration: number;
  readonly kind?: "note" | "rest" | "control";
  readonly actor?: string;
  readonly content: {
    readonly token: string;
    readonly controls?: Readonly<Record<string, unknown>>;
  };
}
export interface FlatView {
  query(fromScene: number, toScene: number): readonly FlatEvent[];
  actors?(): ReadonlySet<string>;
  readonly duration: number; // secondes
}
```

**Façade — `src/index.ts`** : exporte tous les types ci-dessus + adaptateurs purs
`structureToCanonical`, `orderedTokensFromStructure`, `structureToTimelineStream`, type `StreamToken` ;
modules `textView`/`createTextView`, `timelineView`/`createTimelineView` ; et
`productionViews: readonly ViewModule[] = [textView, timelineView]`.

**Côté HÔTE — ce que Kanopi pousse réellement**

- `ProductionViewHost.svelte` : `onMount(() => view.mount({ container }))` ; `onDestroy(() => view.unmount())` ;
  `$effect` lit `productionFeed.generation` puis appelle
  `view.update({ structure: productionFeed.structure(), plat: productionFeed.plat(),
transport: { mode: kronosCursor.state, cursor: kronosCursor.active } })`.
- `BottomPanel.svelte` : `import { productionViews } from 'runtime-ui'` ;
  `productionViews.map(v => ({ id: v.id, label: v.title }))` → onglets ; rendu délégué à `ProductionViewHost`.
- `productionFeed` (store) : `structure(): ProductionStructure|null = #kairos?.structureCourante() ?? null` ;
  `plat(): FlatView|null = try { #kairos.arbreCourant() } catch { null }` ; `set(kairos|null)` et `swapped()`
  incrémentent `generation`.
- `kronosCursor.state: TransportState` = `'stopped'|'running'|'paused'` (`@kronos/core`) ; `kronosCursor.active`.
- Sites de poussée (`bpx-adapter.ts`) : `:1904 kronosCursor.set(kronosAudio)` + `:1906 productionFeed.set(kairos)`
  à l'eval ; `:1810 productionFeed.swapped()` au re-random ; teardown `:2065/2080/2100` met les deux à `null`.

### 3.3 Accord des deux bords (par frontière)

#### Frontière AMONT — accord (code vs étalon vs réalité)

| #   | Sujet                          | Étalon hub v2            | ENGINE_SPEC BPx     | Code Kanopi                     | Verdict                          |
| --- | ------------------------------ | ------------------------ | ------------------- | ------------------------------- | -------------------------------- |
| A   | `metadata.actors`/`scenePitch` | ABSENT                   | §4.1bis présent     | LU (`actors`)                   | étalon EN RETARD → bump          |
| B   | `output:'complete'`            | décrit comme vivant      | décrit comme vivant | THROWS, 'sounding' seul         | obsolète des deux côtés          |
| C   | voie d'appel                   | `derive()→{tree,tokens}` | idem                | `createSession`+`derive`+`emit` | écart de forme (à graver)        |
| D   | filtrage `type:'control'`      | non spécifié             | —                   | `filter(t.type!=='control')`    | conforme (sélection légère)      |
| E   | `sceneTiming`                  | « TOUJOURS lire »        | TOUJOURS présent    | JAMAIS lu                       | champ contractuel non consommé   |
| F   | `payload` opaque               | NE PAS lire              | OPAQUE R2           | jamais lu en prod               | CONFORME                         |
| G   | `Span` (7 champs)              | 7 champs float64         | 7 champs float64    | lit `startMs`/`endMs`           | conforme (lecture partielle)     |
| H   | `out_time` (token)             | non listé                | —                   | valeur réelle du type           | additif non documenté à l'étalon |

**Accord profond** :

- ✅ **Aucune non-conformité « résout / compose / rend »** sur CETTE frontière. L'hôte LIT
  (`tempo`, `totalDurationBeats`, `actors`, `meter`, `span.startMs/endMs`, `symbolId`) et PROJETTE
  (beats-par-barre, bornes de sections via `sectionBoundsFromTree`, longueur de scène via
  `root.span.endMs`). Les noms sont rendus par le résolveur de BPx, pas par l'hôte. `payload` n'est
  jamais ouvert. La projection `meter→beatsPerBar` collapse l'additif en longueur de cycle : calcul
  d'affichage sur une valeur d'autorité, pas une invention (LIMITE documentée, conforme).
- ⚠️ **Écart A (à corriger en priorité)** : l'étalon hub `kanopi-bpx-tree.md` v2 ne documente NI
  `metadata.actors` NI `metadata.scenePitch` (ajouts KAI-9/KAI-10), alors que l'hôte LIT
  `metadata.actors` (énumération des devices OSC, bpx-adapter:1562) et que ENGINE_SPEC §4.1bis les
  définit. Le contrat hub est en retard sur le code et sur le producteur → **bump du contrat hub**.
- ⚠️ **Écart B** : `output:'complete'` (nœud/jeton `type:'control'`) est décrit comme vivant par
  l'étalon ET par ENGINE_SPEC §4.1, mais a MIGRÉ vers Kairos et `derive({output:'complete'})` LÈVE
  désormais côté BPx (`bp3-deps.d.ts:97-98`, bpx-adapter:1466-1468). Kanopi n'emprunte QUE le défaut
  'sounding' ; le type `control` n'apparaît jamais dans l'arbre côté hôte. Les deux specs sont
  obsolètes sur ce point.
- ⚠️ **Écart C** : forme d'appel. L'étalon dit `derive() → { tree, tokens }` en un coup ; la réalité
  est `createSession(ast, opts)` puis `derive()` (→ `{ tree }` + `meter?` + `sceneTiming`) puis
  `emit('timed-tokens')` pour le flux plat. À graver dans le contrat hub.
- ℹ️ **Écart E** : `sceneTiming` (et `natureOfTime`/`quantizationMs`/`clock`/`duration`) est garanti
  toujours présent mais **jamais consommé** par l'hôte aujourd'hui — facette contractuelle inerte
  côté Kanopi (pas une non-conformité ; l'hôte a le droit de ne pas lire). À noter pour ne pas la
  croire « utilisée ».
- ℹ️ **Écart H** : `TimedToken.type` admet `'out_time'` (valeur réelle) que l'étalon ne liste pas.
- 📎 **Hors périmètre de CETTE frontière** : l'assemblage de la `PitchLib` (5 catalogues) et du
  registre de modulation injectés dans Kairos relève de la frontière d'**écriture vers Kairos**
  (`charger()`, écart C1), pas de la lecture de l'arbre BPx. Mentionné car les NOMS de hauteur
  (`metadata.actors`, `scenePitch`) voyagent DANS l'arbre (lecture ici) tandis que la DATA catalogue
  est injectée ailleurs — la résolution token→fréquence appartient à Kairos, jamais à l'hôte.

#### Frontière `charger()` (C1) — accord (code hôte ↔ étalon Kairos ↔ réalité)

| Aspect                           | Hôte (Kanopi)                                                     | Bord Kairos (étalon)                                                | Verdict                                                        |
| -------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| `pitchLib` (type)                | `import { type PitchLib } from '@kairos/core'` (:51)              | `ContexteProjection.pitchLib?: PitchLib` (projeter.ts:52)           | ✅ même type, même owner                                       |
| `modulation.registry` (type)     | `ReturnType<typeof buildModulators>` = `Record<string,Modulator>` | `Readonly<Record<string,Modulator>>`, `Modulator` de `@kronos/core` | ✅ concorde                                                    |
| `exprSource` (type)              | `onExprSource: ExprSource` de `@kronos/core`                      | `exprSource?: ExprSource` (même `@kronos/core`)                     | ✅ type ; 🔶 cast `as unknown` au runtime-audio                |
| `arbre`                          | `derived.tree as unknown as Parameters<Kairos['charger']>[0]`     | `arbre: DerivationTree` (de `bpx`)                                  | 🔶 double-cast `unknown` aux 2 sites                           |
| `contexte`                       | `{...} as unknown as Parameters<Kairos['charger']>[1]`            | `ContexteProjection`                                                | 🔶 double-cast `unknown` (compilateur ne vérifie pas l'accord) |
| identité hauteur par acteur      | sur l'arbre (`metadata.actors`/`scenePitch`, BPx)                 | lue par `resoudre-hauteur.ts` sur l'arbre                           | ✅ modèle KAI-9, conforme                                      |
| `content.pitch`/`content.sounds` | jamais touchés par l'hôte                                         | gravés par Kairos à l'aplatissement                                 | ✅ l'hôte ne résout rien                                       |

**Écarts à signaler :**

- **🔶 C1 (non-conformité « résout/compose », principale).** Mécaniquement l'hôte ne grave ni Hz ni
  binding de timeline (Kairos résout/compose). MAIS : (1) il **importe la DATA du domaine** —
  `alphabets/tunings/temperaments/scales/octaves.json` + `mod.json` ; (2) il **exécute `buildModulators`**
  (`@kronos/core`) **en process** : la fusion `défauts < positionnels < nommés` est de la **logique de
  domaine modulation tournée côté hôte**, pas un simple passage de data. C'est l'analogue pitch/CV du
  crochet `resolveOutput` que KAI-9 a justement supprimé en faisant voyager l'adresse DANS la donnée.
  **Question d'archi (escalade Romain)** : branchement légitime (l'hôte prête la lib, l'amont résout),
  OU les catalogues + le registre doivent-ils voyager `BPScript → BPx → Kairos` dans la donnée (modèle
  KAI-9), pour que l'hôte soit aveugle au domaine hauteur/modulation ? Non tranché.

- **🔶 Forme du payload mal représentée dans l'étalon Kanopi.** Le brouillon Kanopi §3.1/§3.2 écrit
  `{ tree, ctx:{ pitchLib }, modulation:{ registry, exprSource } }` — laissant croire à un sous-objet
  `ctx` + un `modulation` frère. La **réalité** : `charger(tree, { ...buildProjectionContext(),
pitchLib, modulation })` — `pitchLib` et `modulation` sont des champs **frères au même niveau** dans
  l'**unique** 2ᵉ argument `ContexteProjection`. À corriger dans l'étalon.

- **🔶 `transposeToken` : champ de contrat délibérément non posé.** Présent dans `ContexteProjection`
  (projeter.ts:44) mais Kanopi ne le fournit PLUS (transpose-son déplacé dans Kairos, KAI-10,
  commentaire :1551-1554). Surface de contrat « morte » côté hôte — à acter (le supprimer du contrat,
  ou documenter qu'il est réservé à un transpose d'affichage futur, KAN-18).

- **🔶 Double-cast `as unknown as Parameters<Kairos['charger']>[…]` aux deux sites.** L'hôte
  court-circuite le typage : le `DerivationTree` du paquet `bpx` côté hôte et celui importé par Kairos
  ne sont pas vérifiés identiques ; `ContexteProjection` n'est pas importé côté hôte. Le compilateur ne
  garantit donc PAS l'accord de cette frontière — fragilité (régression silencieuse possible).

- **🔶 Dérive doc côté Kairos (E3 du contrat Kairos).** `kairos/src/index.ts:20` parle encore de
  « `ContexteProjection.pitch` » alors que le champ réel est `pitchLib` — le code Kanopi pose bien
  `pitchLib`, c'est le commentaire Kairos qui est périmé.

#### Frontière KRONOS — accord (code vs étalon vs réalité)

| Point                                    | Étalon                                            | Code réel                                                                         | Verdict                                                              |
| ---------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Commandes play/pause/stop/step/seek      | `kronos-transport.md §API`                        | `playback`→`transport.*` ; step DÉRIVE le beat                                    | ✅ concorde                                                          |
| Une seule autorité de position           | invariant « curseur Kronos, jamais compteur »     | rAF LIT `beatPosition`/`absoluteBeatPosition`, zéro intégration                   | ✅ concorde                                                          |
| Pas de 2ᵉ FSM hôte                       | interdit dur                                      | `mode` = projection pure de `kronosCursor.state`                                  | ✅ concorde (commentaires : `lastBeat`/FSM/`kronosPaused` SUPPRIMÉS) |
| `OutputRef{runtime,device?,channel?}`    | `runtime-adapter.ts:33` + décision KAI-9          | identique ; `addAdapter` par nom, aucun défaut                                    | ✅ concorde                                                          |
| Adresse DANS la donnée (plus de crochet) | KAI-9 : `resolveOutput`/`pickTransport` SUPPRIMÉS | hôte ne lit aucune carte acteur→transport ; route sur `ev.output.runtime`         | ✅ concorde                                                          |
| `ScheduledEvent` forme cœur opaque       | option B ratifiée                                 | `prep()` traite `content` mais le cœur ne le lit pas ; pitch déjà résolu (KAI-10) | ✅ concorde                                                          |
| Clé runtime inconnue                     | `unknown-output-runtime` (Kronos)                 | `warnMissing()` log, jamais reroutage silencieux                                  | ✅ concorde                                                          |

**Écarts / non-conformités signalés :**

- **É1 (✅ RÉSOLU [842], anciennement 🔶) — coercition des contrôles côté hôte.** L'ancien
  `coerceControlValues` (`dispatcher.js:23`, réutilisé par un `prep()` depuis lui aussi retiré —
  cf. note adjacente au §5) convertissait string→number (`vel:'80'`→80) DANS l'hôte. Le husk
  `dispatcher.js` a été éliminé [842] : la coercition vit désormais DANS les runtimes de sortie
  (R2, `output-runtime-contract.ts:8`), conforme à `kanopi-runtime-midi.md`. _Cf. écart C3 du §5
  (à réviser en cohérence)._

- **É2 (⚙️, divergence étalon↔réalité, NON-bug) — tempo/mute live ne passent PAS par `Transport`.**
  L'étalon `kronos-transport.md` liste `setTempo(bpm)`/`setRate(r)`/`setLoop(...)` comme commandes
  Transport que l'hôte appelle. Réalité : seuls `play/pause/stop/step/seek` vont direct au `Transport` ;
  le **tempo live** (`retune`) et le **mute** (`setActorMuted`) passent par la **porte d'écriture Kairos**
  (`kairos.demande`, l.682-693), `setLoop` agit sur `scheduler`+`cursor` via le handle. C'est un
  durcissement post-KAI-10 (autorité de composition = Kairos), pas une violation — mais l'étalon
  transport mérite une MAJ pour refléter ce partage (commande directe vs porte Kairos).

- **É3 (🔶, à surveiller) — le canal MIDI est LU côté hôte, pas par le sink seul.** `OutputRef` stipule
  device/channel « lu par le sink seul ». Or `midiAdapter` (`kronos-audio.ts:418-419`) fait
  `const ch = ev.output?.channel; event.chan = ch` — l'**hôte** extrait `output.channel` et le recopie sur
  l'événement MIDI avant de le passer au sink. Asymétrie avec `oscRuntimeAdapter` (l.436) qui relaie
  `output: ev.output` VERBATIM (le sink OSC lit lui-même). C'est une micro-lecture d'adressage côté hôte,
  contraire à la lettre de l'opacité — idéalement la `MidiTransport` devrait lire `ev.output.channel`
  elle-même. Mécaniquement inoffensif (relais, pas résolution) mais à aligner.

- **É4 (🔶, à surveiller) — remap de charge dans la glue hôte.** Les adaptateurs hôtes ne relaient pas
  `content` strictement verbatim : `prep()` **supprime** les objets descripteurs CV résiduels
  (`delete coerced[k]`, l.370) et calcule `velocity = velRaw/127` (l.388, 414). C'est un encodage léger
  (0..127→0..1) effectué côté hôte alors que le contrat veut « le runtime encode vers son fil ». À la
  limite du principe dur (l'hôte ne devrait que câbler) ; à pousser vers les sinks lors de l'assainissement.

- **É5 (✅ légitime, noté) — énumération OSC lit les params d'acteur.** `deriveOscBindings` (l.221-234) lit
  `runtime`/`device`/`channel`/`ch` depuis `metadata.actors` (autorité BPx) UNIQUEMENT pour pré-charger les
  surfaces device au setup (`setBindings`, chemin chaud sync) ; le device/channel par événement voyage
  toujours sur `event.output`. Lecture de setup, pas de résolution par événement — conforme, mais c'est le
  seul endroit où l'hôte touche encore la table acteur→adresse (traçabilité).

- **É6 (✅ légitime) — valeurs host-owned résiduelles.** `clock.svelte.ts` garde `beatsPerBar` (Kronos n'a
  pas de signature rythmique → valeur de session) et le `userTempo` D10 (seul tempo host-owned : saisie
  AVANT/SANS scène, clampé [20,300]). Le tempo de scène (`setSceneTempo`) ne s'écrit jamais dans `#tempo`
  et ne fuit jamais dans `userTempo`. Aucune autorité inventée (plus de défaut « 128 »). Conforme.

#### Frontière PUITS — accord (code Kanopi ↔ étalon ↔ réalité du voisin)

| Bord                                                         | Étalon                                                          | Code Kanopi                                                                                                     | Verdict                            |
| ------------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `ScheduledEvent` / `OutputRef`                               | CONTRACT_RUNTIME_ADAPTER.md §2,§7 + kronos `runtime-adapter.ts` | consommé verbatim ; route sur `output.runtime`                                                                  | **CONCORDE**                       |
| Forme cœur `{onset,duration,actor?,content opaque}` option B | étalon §2/§6 ratifié                                            | la glu N'ajoute pas de hauteur au cœur ; `content.pitch` reste dans `content`                                   | **CONCORDE** (Kronos zéro hauteur) |
| `RuntimeAdapter` voix de code                                | kanopi-runtime-codevoices.md §2                                 | `adapter.ts` identique (id, outputType, extensions, evaluate, stop, setBpm?, onBeat?, onBar?, events?, dispose) | **CONCORDE**                       |
| `EvalSource` / `LogPush` / `EventBus`                        | kanopi-runtime-codevoices.md §3-5                               | identiques (flags/section/produceOnly ignorés par les voix de code)                                             | **CONCORDE**                       |
| AudioRuntime `content.pitch.hz` (KAI-10)                     | CONTRACT §7.4 + runtime-audio.d.ts                              | `audioAdapter` transmet `c.pitch` verbatim ; `sounds: undefined`                                                | **CONCORDE**                       |
| MIDI ne résout RIEN                                          | kanopi-runtime-midi.md MAJ 2026-06-29                           | `MidiTransport` lit `event.pitch.hz` ; hôte n'injecte aucun résolveur                                           | **CONCORDE** (côté hôte)           |
| Canal MIDI = `event.output.channel` gravé Kairos             | KAI-9                                                           | `midiAdapter` : `chan = ev.output?.channel`                                                                     | **CONCORDE**                       |

**Écarts signalés**

- **E1 — composition de payload côté hôte (tension de conformité PRINCIPALE).** La glu
  (`prep` + les 4 adaptateurs) **lit** `content.{token,controls,rq,startSec,pitch,modulations}`
  et **reconstruit** un objet par sink. Le contrat dit `content` OPAQUE, transporté verbatim ;
  ici l'hôte renomme/réagence des champs et calcule `velocity = velRaw/127` (MIDI 0..127 → 0..1)
  côté hôte. C'est une **encodage/composition hôte légère** sur le chemin du puits — l'analogue
  pitch/CV du crochet supprimé par KAI-9. À trancher : ces adaptateurs-glu sont-ils un détail de
  câblage admis (l'hôte est l'auteur de l'adaptateur Kronos pour audio/midi/osc), ou doivent-ils
  rétrécir à un pur passe-plat (le sink lisant directement la forme Kronos) ? Escalade Romain.

- **E2 — `coerceControlValues` RÉSOLU [842] (écart C3 du §5, à réviser).** L'ancien
  `dispatcher.js:coerceControlValues` (réutilisé par un `prep()` lui aussi retiré) convertissait
  string→number côté hôte, contraire à kanopi-runtime-midi.md MAJ 2026-06-20 (« verbatim… la
  coercition est CHEZ runtime-midi »). Le husk `dispatcher.js` a été supprimé [842] : la coercition
  vit désormais dans les runtimes de sortie, conforme à l'étalon.

- **E3 — la glu n'implémente pas `stop`/`setActorMuted`/`close`/`latency`.** Le contrat
  RuntimeAdapter offre ces hooks optionnels (§7.2) ; les 4 adaptateurs-glu ne portent que `send`.
  Le mute des notes passe par `kairos.demande({type:'mute'})` (porte d'écriture Kairos), le stop
  par le handle Kronos (`transport.stop`/`driver.stop`/`oscAdapter.close`), le cut des voix de
  code par `stopCodeVoices`/`refireCodeVoices`. Cohérent avec « Kronos owns the audio » mais
  **divergent de la forme d'adaptateur étalon** — à documenter (le routage du désarm ne passe pas
  par `adapter.setActorMuted`).

- **E4 — deux surfaces MIDI, contrat figé sur la mauvaise.** kanopi-runtime-midi.md épingle
  (INTERFACE PINNÉE 2026-06-13) **`MidiSink`** (`load/start/stop`) comme point d'entrée. Or le
  chemin de dispatch vivant (par-acteur, Kronos) utilise **`MidiTransport.send(event, absTime)`**
  (déclaré « the canonical Kronos TransportLike for MIDI » dans `runtime-midi.d.ts`). Le contrat
  hub est **en retard** sur le code : il documente `MidiSink` (flux de jetons J2) alors que la
  frontière de dispatch réelle est `MidiTransport`. À réconcilier dans le contrat.

- **E5 — pas de contrat hub figé pour la frontière OSC.** La surface OSC (OscAdapter,
  OscBridgeProfile, WebSocketTransport, OscScheduledEvent, OscBinding/OutputRef…) n'est décrite
  QUE par le stub local `runtime-osc.d.ts`. Aucun `hub/contrats/kanopi-runtime-osc.md` n'existe
  (seule la mémoire projet `project_runtime_osc_lance.md` la mentionne). Frontière la plus riche
  côté code (profil + transport + bindings) mais non ratifiée. À figer.

- **E6 — l'hôte construit le `WebSocket` OSC lui-même.** kronos-audio.ts ouvre `new WebSocket(url)`
  (pour logguer une fois un relais injoignable) avant de le passer à `WebSocketTransport({socket})`.
  Lecture de `routing.json` → `osc.ws`. Câblage légitime (l'hôte fournit le tuyau, runtime-osc
  porte le fil), noté pour traçabilité — l'hôte ne sérialise aucun octet OSC. _(Cf. tangle C6.)_

- **E7 — `deriveOscBindings` lit `metadata.actors` côté hôte.** Énumération seule (pré-charge des
  surfaces via `setBindings`, hot-path sync ensuite) ; le device/channel par-événement reste sur
  `event.output`. Conforme (énumération de setup ≠ routage), mais c'est une lecture de la table
  acteurs→sortie par l'hôte — à garder borné.

**Bilan loi n°2 (résout / compose / rend RIEN).** Résolution de hauteur : déléguée (Kairos grave
`content.pitch.hz`, l'hôte le transmet verbatim) — **PROPRE**. Rendu son/octets/adresses :
délégué aux runtimes — **PROPRE**. Composition : un **résidu** côté hôte sur le chemin du puits —
la couche-glu remappe `content` par sink + coerce les contrôles + calcule `velocity/127` (E1+E2).
C'est le finding de conformité de cette frontière : non pas un calcul musical, mais une
**transformation de charge** que le modèle voudrait verbatim.

#### Frontière RUNTIME-UI — accord (code vs étalon vs réalité)

| Point                                | Étalon (runtime-ui-architecture.md)                  | Code réel (runtime-ui + Kanopi)                     | Verdict                     |
| ------------------------------------ | ---------------------------------------------------- | --------------------------------------------------- | --------------------------- |
| `ViewModule`/`ViewHost`/cycle de vie | §3.2 `mount/update/unmount`, `{container}`           | identique (`view.ts`)                               | ✅ concorde                 |
| `structure` pass-through Kairos      | §3.1 lecture seule, noms résolus amont               | `structureCourante()` relayé tel quel               | ✅ concorde                 |
| `TransportView.mode` = vocab Kronos  | `'stopped\|running\|paused'`                         | `kronosCursor.state: TransportState` idem           | ✅ concorde                 |
| `StructureNode` 5 variants + spans s | §3.1 `sequence\|polymetric\|voice\|occupying\|event` | identique (`production.ts`)                         | ✅ concorde                 |
| Sortant runtime-ui→amont             | §3.3 ∅ aujourd'hui (Q2 ouverte)                      | aucun import d'écriture, aucune émission            | ✅ concorde                 |
| Câblage onglets, hôte rend ∅         | §1.5 l'hôte câble, ne rend rien                      | `BottomPanel` mappe `productionViews`, 0 rendu hôte | ✅ concorde — loi n°2 tenue |

**Écarts / non-conformités signalés**

1. **`plat` non retiré (Q4 ratifiée, NON appliquée)** — l'étalon (Q4, §3.1🔶) tranche : `plat` retiré de
   l'entrée v1, durée de boucle unique = `structure.durationSec`. Réalité : `ProductionInput.plat?` existe
   encore (`view.ts:47`), l'hôte le pousse encore (`productionFeed.plat()`), et `FlatView.duration`
   **duplique** `ProductionStructure.durationSec`. Aucune vue v1 ne lit `plat`. → item d'assainissement
   ouvert, à propager Kairos/Kronos/Kanopi. **Pas un calcul hôte** (pass-through), mais conduit mort.

2. **Nommage `ViewId` — commentaire d'étalon périmé** — l'étalon §3.2 garde en commentaire `'text' | 'timeline'`,
   alors que le texte UI-7 (§1) et le code réel disent `'text' | 'structure'`. Le dossier interne reste
   `views/timeline/` (export `timelineView`) mais son `id` user-facing = `'structure'`. → corriger le seul
   commentaire §3.2 de l'étalon ; le code est conforme à UI-7.

3. **`CursorView` sous-borné vs sur-fourniture hôte** — l'étalon/contrat type `CursorView = {position():number}`
   (surface minimale). Réalité : l'hôte passe `kronosCursor.active`, un `KronosCursorView` **bien plus riche**
   (`transport` = autorité Kronos complète, `beatsPerBar`, `beatPosition()`, `cutCodeVoices()`,
   `refireCodeVoices()`). Structurellement un sur-ensemble de `{position()}`, donc compile, mais le contrat
   n'**empêche pas** la vue d'atteindre `.transport` et de commander le transport. La conformité repose
   uniquement sur la discipline R5 (la vue lit `position()` et rien d'autre). → risque de latitude : narrower
   le handle passé, ou figer dans le type que seul `position()` est offert.

4. **Côté Kanopi (fiche F10 du présent contrat) imprécise** — la fiche F10 décrit
   `ProductionInput{ structure, flat, cursor }` : noms réels = `structure`, **`plat`** (pas `flat`),
   **`transport`** (pas `cursor`, qui est imbriqué dans `transport.cursor`). → la présente §3 aligne
   la forme réelle (`structure` / `plat?` / `transport`).

5. **Store hôte `production` (ProductionSet) — projection en doublon, commentaire périmé** (adjacent, hors
   F10) — ce store legacy porte `tokens / rawTokens / tree / sections / symbolNames / beatDurSec /
durationSec` et son en-tête prétend « the Text panel renders the production BY ORDER ». Or **aucun panneau
   Texte hôte n'existe** (bottom-panel = `BottomPanel` + `ProductionViewHost` seuls) : le rendu Texte est
   passé à `runtime-ui` (`textView`), nourri par `productionFeed` — **pas** par ce store. Au plan F10 ce
   store est inutilisé ; il ne sert plus qu'à STEP (`beatCount` via `TransportCluster`) et au gating
   (`production.clear()` dans `real-core.ts:294`). Les champs en forme de vue (`tokens/tree/sections/
symbolNames`) sont morts vis-à-vis du rendu et dupliquent ce que Kairos possède désormais. Pas une
   re-dérivation (c'est une projection de `derive()`), mais commentaire trompeur + champs morts à nettoyer.

### 3.4 Notes de bas de frontière — invariants figés amont (compléments du critique de complétude)

Six invariants figés des étalons, présents au contrat mais non surfacés en §3.2/§3.3 ci-dessus —
ajoutés ici pour que le contrat soit auto-suffisant (un lecteur n'a pas à rouvrir l'étalon).

- **AMONT — « ne pas dépendre de l'ABSENCE » des annotations moteur** (`kanopi-bpx-tree.md:60-61`,
  figé). Les champs additifs `isVirtualTempoWrap`, `isInternalScalingVoice`, `articul`,
  `emitSuppressed`, `runtimeQualifiers`, `simultaneous`, `simultaneousSecondary` sont des
  annotations moteur OPTIONNELLES. L'hôte ne les lit pas — et **ne doit pas se reposer sur leur
  absence** (un ajout additif amont ne doit jamais casser l'hôte). Invariant de robustesse.
- **AMONT — accords `A!B` : deux feuilles au MÊME span = un accord** (`kanopi-bpx-tree.md:63-70`,
  figé). Un accord matérialise **plusieurs feuilles `occupying role='leaf'` co-attaquées** (même
  `span`, charge propre par note), pas un nouveau type de nœud. L'hôte les lit comme des feuilles
  normales (sa descente DFS les traite trivialement) ; il n'a pas à interpréter `simultaneous`/
  `simultaneousSecondary`. Noté pour qu'un lecteur sache que deux feuilles au même onset = un accord.
- **AMONT — « Pas de gamme globale »** (`kanopi-bpx-tree.md:55`). L'échelle est par bloc polymétrique
  (`polymetric.speed`/`scale`), jamais un attribut de scène. Rien à exposer côté tonalité — trivial,
  noté pour exhaustivité (l'hôte n'invente aucune tonalité globale).
- **charger() / PUITS — forme figée du binding de modulation** (`CONTRACT_RUNTIME_ADAPTER.md:142-147`
  §7.3). La liaison CV composée a la forme `{ input, clock, windowStartScene, windowEndScene, source }`
  (composée par `composeTreeModulations`, échantillonnée en t_scène par l'adaptateur via le
  `ClockProvider` partagé). Côté hôte elle reste **opaque** (transportée dans `content.modulations`
  verbatim) — l'hôte ne la lit ni ne la compose ; détaillée ici car c'est une forme figée de l'étalon aval.
- **PUITS codevoices — types figés du bus d'événements** (`kanopi-runtime-codevoices.md:50-54` §5).
  `EventBus` (relayé dans `core.events`) porte `KanopiEvent = beat|bar|transport|trigger|token|flag`
  (`schemaVersion: 1`) ; `TokenLocation = [from, to, fileId]` ; `EventSourceTag = CodeVoiceRuntime |
'clock'`. Les voix de code n'émettent que `trigger` (cycle eval/stop) et `token` (Strudel) en leur nom.
- **TOPOLOGIE — règle ID-ref + test « projection pure »** (`kanopi-architecture.md:58` et `:62-65`,
  l'étalon-maître). Règle de projection n°6 : **référencer par ID, jamais par copie d'objet**. Test
  d'acceptation d'un store : le **vider et le reconstruire depuis sa source amont** → l'UI doit être
  identique ; s'il diffère, le store cachait de l'autorité = violation. (Repris en §4 comme critère.)

---

## 4. Topologie voulue (organisation CIBLE — ≠ décalque du code)

### 4.1 Les blocs

- **adaptateur** = la **seule** porte hôte↔moteur. Tout branchement amont/aval y vit ; aucun autre
  bloc ne parle à Kairos/Kronos/puits en direct — **sauf** les `stores` qui LISENT (position/vues) :
  lecture autorisée (projection), écriture interdite ailleurs.
- **stores** = projections pures (lecture amont → état réactif UI). Aucune écriture d'autorité, aucun
  effet de recopie store→store.
- **coeur** = `core/index.js` (vide — husk Dispatcher éliminé [842]) + branchement runtimes via
  `runtimes/registry`.
- **UI** ne parle qu'aux stores + monte runtime-ui ; ne touche jamais Kairos/Kronos en direct.
- **bibliotheque / persistance / commandes / texte / midi** : gestion locale (contenu groupé,
  workspace réel, palette/raccourcis, formats d'affichage, saisie clavier MIDI entrante).
- Règle de structure : **sens unique** moteur/BPx/workspace → UI (lecture) ; UI → moteur (commande).

### 4.2 Famille dense A — `bpx-adapter.ts` : LE hub runtime (statut : conforme dans l'ossature)

UNE fabrique `makeBpxAdapter` produit les deux jumeaux `bp3Adapter` (.gr) et `bpscriptAdapter` (.bps),
qui ne diffèrent QUE par leur frontal et convergent sur un AST unique. Chaîne :
`source → frontal → SceneAST → createSession/derive (BPx) → Kairos.charger → startKronosAudio
(routage par acteur sur event.output) → sinks MIDI/audio/OSC/code`. Densité = un `evaluate` (~640 l.)
qui orchestre tout le cycle de vie + l'arm/disarm live des voix.

| Sous-rôle (regroupé)                   | Fonctions                                                      | Statut         |
| -------------------------------------- | -------------------------------------------------------------- | -------------- |
| Bifurcation frontaux → AST unique      | `grFrontend`, `bpsFrontend`, `evaluate`                        | ✅ conforme    |
| Lecture de facettes de l'AST           | `actorTableFromAst`, `flagStatesFromAst`, `mmFromAst`,         | ✅ conforme    |
|                                        | `librariesFromAst`, `backticksFromAst`, `btTokenByActor`,      |                |
|                                        | `soundingFromAst`, `buildOrchestration`, `effectiveTempoBpm`   |                |
| Dérivation + projection                | `createSession/derive`, `buildSymbolNames`, `Kairos.charger`,  | ✅ conforme    |
|                                        | `reDeriveKairos` (closure bord de boucle)                      |                |
| Montage du routage par acteur          | `gateVoiceDevice`, `voiceOutputType`, `runtimeForInterp`,      | ✅ conforme    |
|                                        | `registerBacktickSink`, `startKronosAudio`, `loadDeclaredLibs` |                |
| Cycle de vie + live                    | `stop` (sentinelles), `dispose`, `setBpm`, `emitLifecycle`,    | ✅ conforme    |
|                                        | arm/disarm orchestré, `getCtx`/`peekCtx`, sinks/toggles        |                |
| **Résolution d'aux .gr pilotée**       | `parseWithSound`, `resolveGrAux`, `soundFromRef`,              | 🔶 **C2-bis**  |
|                                        | `resolveSeSettings`                                            | (frontal hôte) |
| **Data de domaine portée**             | `PITCH_LIB` (5 catalogues, l.137), `WESTERN_NOTES` (l.352)     | ❌ **C1**      |
| **Calcul d'affichage / règle langage** | `publishProduction`/`sectionBoundsFromTree` (equal-split),     | 🔶 **C4'**     |
|                                        | `withDefaultScene` (« scène int min = défaut »), grille STEP   |                |

**Nature** : complexité **essentielle** d'assemblage hôte — `evaluate` appelle les autorités sans
réimplémenter. Les écarts sont des **passagers** dans ce hub conforme, pas son ossature.

**Tangle accidentel (évitable, → C6)** : cycle `bpx-adapter ↔ registry`. `registry.ts:7` importe
**statiquement** `bp3Adapter`/`bpscriptAdapter` ; en retour le hub doit dispatcher vers ses
adaptateurs frères de voix-code, co-enregistrés dans le même registre. Symptômes : 2 imports
**dynamiques** `await import('./registry')` pour casser le cycle d'éval de module, et
`codeVoiceAdapters` tiré de `runtime-codevoices` (l.101) plutôt que du registre (commentaire explicite).
**Cible** : injecter le dispatch voix-code DANS la fabrique (dépendance descendante) au lieu de
l'auto-rechercher dans un registre qui contient déjà l'adaptateur.

### 4.3 Famille dense B — `kronos-audio.ts` : frontière transport audio (statut : conforme, résidu mineur)

Deux fonctions de module. `deriveOscBindings` (helper pur : énumère `metadata.actors`, extrait les
acteurs `runtime==='osc'` pour pré-fetch des surfaces — **conforme**). `startKronosAudio` = builder
unique : assemble la machine Kronos (clock/scheduler/cursor/transport/driver) sur l'horloge partagée,
déclare **5 adaptateurs purement routeurs** (sélection sur `event.output.runtime`, AUCUN défaut),
bind la `StructureSource` de Kairos, retourne un handle de ~16 closures.

| Sous-rôle (regroupé)           | Closures                                                     | Statut            |
| ------------------------------ | ------------------------------------------------------------ | ----------------- |
| Assemblage de la machine       | `startKronosAudio`, `applyReDerive`, `warnMissing`           | ✅ conforme       |
| Routage par sortie (note)      | `audioAdapter.send`, `midiAdapter.send`                      | ⚠️ vel/127 (C3)   |
| Routage par sortie (OSC/code)  | `oscRuntimeAdapter.send`, `codeAdapter.send`                 | ✅ conforme       |
| Pré-traitement du payload      | `prep` (coerce + élague contrôles-objet + repli vel)         | 🔶 **C3**         |
| Projection lifecycle (Model C) | `handle.stop/stopInPlace/replay/cut/refire CodeVoices`       | ✅ conforme       |
| Projection transport           | `handle.position/beatPosition/seek/resume` (lit Kronos)      | ✅ conforme       |
| Boutons via porte d'écriture   | `handle.retune`, `handle.setActorMuted` (→ `kairos.demande`) | ✅ **exemplaire** |
| Boutons live                   | `handle.setReRandom`, `handle.setLoop`                       | ✅ conforme       |

**Nature** : majoritairement **essentielle**. Chemins exemplaires : `retune`/`setActorMuted` passent
par la porte d'écriture unique `kairos.demande` (l'hôte ne ré-ancre jamais l'horloge ni n'écrit
l'arbre) ; pitch forwardé verbatim dans les 3 adaptateurs note (KAI-10). Pas de cycle registry ici.

**Tangle accidentel (évitable, → C6)** : le montage du socket OSC inline dans le builder (`new
WebSocket` + listeners error/close + flag + try/catch + `setBindings().catch`) couple l'hôte aux
détails de cycle de vie WebSocket qui appartiennent à runtime-osc. Glue défendable, mais c'est du code
transport dans le builder.

---

## Invariants vérifiables MACHINE (encodés par le garde `npm run arch`)

1. ✅ **pas-de-résolveur-de-hauteur-dans-l'hôte** : aucun module Kanopi n'importe un résolveur de
   hauteur amont (`/pitch`, `*resolver*`). VERT — l'hôte importe le `type PitchLib` et la DATA, jamais
   la logique `@kronos/core/pitch`. _(Mais il PORTE la data : `PITCH_LIB`/`WESTERN_NOTES` — cf. C1.)_
2. ✅ **aucun court-circuit hôte→sortie** : les seules sorties aval sont `adaptateur→puits`,
   `stores/UI→runtime-ui` ; aucun chemin hôte→son/octet hors adaptateurs.
3. ✅ **un seul adaptateur par sink, sélection par `event.output.runtime`** : aucun adaptateur par
   défaut, aucun acteur « default » inventé (vérifiable : pas de branche fallback dans les 5 `.send`).
4. 🔶 **no-circular** : pas de cycle de dépendance. _(8 cycles actuels — cf. C6 ;
   `bpx-adapter↔registry` est le principal.)_
5. 🔶 (proposé) **pas-de-conversion-d'unité-dans-l'hôte** : interdire `velocity = velRaw/127` et la
   coercition de contrôles à la frontière (cf. C3) — détectable par motif sur `kronos-audio.ts`.
6. 🔶 (proposé) **pas-de-copie-MIDI-dans-core** : `packages/core` ne ré-héberge aucun transport MIDI
   (copie supprimée ; figer pour empêcher la rechute).
7. 🔶 (proposé) **pas-de-catalogue-de-domaine-importé** : `bpx-adapter.ts` ne doit pas importer les
   JSON `bpscript/lib/{alphabets,tunings,temperaments,scales,octaves}` ni coder d'alphabet musical
   (`WESTERN_NOTES`) — dépend de la résolution C1.

---

## 5. Écarts code ↔ contrat

> Test central : surface CHAQUE endroit où l'hôte résout / compose / rend, ou porte la data du
> domaine. Le rendu, la résolution de hauteur et l'aplatissement sont PROPRES (délégués). Les écarts
> restants sont un conduit de DATA (C1), des micro-compositions de frontière (C3), un frontal piloté
> par l'hôte (C2), du code/doc mort (C4) et du couplage interne (C6).

### ❓ C1 — PRINCIPAL (escalade Romain) : l'hôte PORTE la data du domaine hauteur/modulation

- **Preuve** : `bpx-adapter.ts:137` `PITCH_LIB` agrège les 5 catalogues `bpscript/lib` ; `:352`
  `WESTERN_NOTES = ['C'..'B']` (alphabet occidental codé, fallback de parse .gr) ; `:1544/1804`
  injecte `ctx.pitchLib = PITCH_LIB` dans Kairos ; `buildModulators(sceneCV, modLib)` assemble le
  registre CV.
- **Nature** : mécaniquement l'hôte ne **résout** rien (Kairos résout, Kronos/Kairos composent) — mais
  il **importe la data du domaine** et **assemble le contexte** injecté. C'est l'analogue pitch/CV du
  crochet `resolveOutput` que **KAI-9 a supprimé** en faisant voyager l'adresse DANS la donnée.
  `WESTERN_NOTES` est atténué (passé en `fallbackAlphabet`, le frontal sniffe sinon) ; `PITCH_LIB` est
  rationalisé par LAN-14 (hôte « gatekeeper de fraîcheur »). S'y ajoute (frontière `charger()`)
  l'exécution **en process** de `buildModulators` (fusion `défauts < positionnels < nommés`) = logique
  de domaine modulation tournée côté hôte, pas un simple passage de data.
- **Escalade Romain** : branchement légitime — OU catalogues + registre de modulation doivent-ils
  voyager `BPScript→BPx→Kairos` dans la donnée (modèle KAI-9), pour que l'hôte ignore tout du domaine ?
  **C'est le finding « gros » de cette carto** (l'équivalent de « MIDI était gros »).

### 🔶 C2 — frontal .gr piloté par l'hôte + store `blocks` qui re-parse le texte

- **Résolution d'aux .gr** : `parseWithSound`/`resolveGrAux`/`soundFromRef`/`resolveSeSettings`
  pilotent une résolution multi-passe (alphabet, symboles sonnants, réglages moteur) — logique
  déléguée à bp3-frontend mais **dont l'orchestration vit dans l'hôte**. À pousser côté frontal.
- **`extract-blocks.ts`** re-parse le TEXTE des onglets (consommé par `stores/blocks` + `CMEditor`).
  À confirmer phase 2 : alimente-t-il SEULEMENT l'affordance d'éval éditeur (saisie locale =
  légitime) ou la structure de lecture (interdit) ? Indice favorable : les acteurs viennent de
  `core.actors`, pas du texte.

### 🔶 C3 — micro-composition à la frontière transport (`kronos-audio.ts` + ex-dispatcher) — coercition RÉSOLUE [842], reste À VÉRIFIER

- **Volet coercition (RÉSOLU [842])** : la coercition string→nombre venait AS-IS du husk `dispatcher.js`
  (`core/src/dispatcher.js`), contraire à `kanopi-runtime-midi.md` (« contrôles verbatim, jamais
  coercés — coercition CHEZ le runtime »). Le husk a été supprimé ; la coercition vit désormais dans
  les runtimes de sortie (R2, `output-runtime-contract.ts:8`), conforme à l'étalon.
- **Volet velocity/`prep()` (NON vérifié dans ce passage — À TRANCHER)** : ce finding citait aussi
  `kronos-audio.ts:388/:414` (`velocity = velRaw/127` dans `audioAdapter`/`midiAdapter`) et un `prep()`
  (l.~372) qui élaguait les descripteurs CV. Une lecture du fichier actuel (post-migration « audio
  quitte l'hôte ») montre que `prep`/`warnMissing`/`audioAdapter`/`midiAdapter`/`oscRuntimeAdapter` n'y
  figurent plus du tout (cf. commentaire `kronos-audio.ts:399` « Plus de warnMissing ni de prep/coerce
  hôte »). Ce volet semble donc lui aussi obsolète, mais c'est une migration SÉPARÉE (browser/webaudio→
  audio) hors mandat de cette passe — non réécrit ici, à confirmer et clore par un audit dédié.
- **Confirmé par les frontières** : KRONOS É1 (coercition, RÉSOLU) ; PUITS E2 (coercition, RÉSOLU).
  É4/E1 (remap `vel/127`, élagage CV) restent À VÉRIFIER (même réserve que ci-dessus).

### 🔶 C4 — code/doc mort (rendu déménagé) + calcul d'affichage hôte

- `bpx-adapter.ts:52-54` décrit un flattener hôte `treeToDispatchEvents` **qui n'existe plus** (`:30`
  confirme « Kairos is the SOLE projection source »). `lib/text-order/order-tokens.d.ts` = stub d'un
  producteur de texte hôte **superséé** par vues-à-calques (texte rendu par runtime-ui) — aucun
  consommateur. Nettoyage doc/code mort.
- **C4'** (calcul d'affichage) : `publishProduction`/`sectionBoundsFromTree` calculent les bornes de
  sections avec un repli equal-split `i*durée/count` **inventé par l'hôte** (display-only) ;
  `withDefaultScene` encode la règle de langage « scène d'int min = défaut ». Justifiés (D10 / affichage
  passif) mais c'est du calcul/règle de domaine côté hôte — à tracer.
- **Confirmé par la frontière RUNTIME-UI** : item 5 (store `production` legacy — champs en forme de vue
  `tokens/tree/sections/symbolNames` morts vis-à-vis du rendu, commentaire trompeur) ; item 1 (`plat`
  non retiré = conduit mort, Q4 ratifiée non appliquée).

### ⚙️ C6 — 8 cycles de dépendance internes (garde no-circular)

- `bpx-adapter ↔ registry` (le tangle de la famille A — cassé à coups d'imports dynamiques),
  `core-real ↔ clock`, `blocks ↔ playback/workspace`, + le socket OSC inline (famille B, = PUITS E6 /
  KRONOS tangle). Couplage **interne** (pas une violation de frontière) ; cible = injection de
  dépendance descendante. À résorber pendant l'assainissement ; n'empêche pas la carte.

### Récapitulatif — où vit chaque écart de frontière

| Écart de frontière                                            | Frontière  | Rattachement §5     | Nature                             |
| ------------------------------------------------------------- | ---------- | ------------------- | ---------------------------------- |
| A — étalon en retard sur `actors`/`scenePitch`                | AMONT      | sync contrat hub    | doc à bumper                       |
| B — `output:'complete'` obsolète des deux côtés               | AMONT      | sync contrat hub    | doc obsolète                       |
| C — forme d'appel `createSession`+`derive`+`emit`             | AMONT      | sync contrat hub    | à graver                           |
| E — `sceneTiming` jamais consommé                             | AMONT      | (info)              | facette inerte, légitime           |
| H — `out_time` non listé                                      | AMONT      | sync contrat hub    | additif à documenter               |
| C1 (frontière `charger()`) — DATA domaine + `buildModulators` | charger()  | **C1**              | ❓ Romain                          |
| forme payload `ctx`/`modulation` mal décrite                  | charger()  | C1 (doc)            | étalon à corriger                  |
| `transposeToken` non posé                                     | charger()  | (info)              | surface morte côté hôte            |
| double-cast `as unknown` aux 2 sites                          | charger()  | (fragilité)         | typage non vérifié                 |
| dérive doc Kairos `.pitch`/`pitchLib`                         | charger()  | sync doc Kairos     | commentaire périmé                 |
| É1 — coercition contrôles                                     | KRONOS     | **C3**              | à pousser aval                     |
| É2 — tempo/mute via Kairos (pas Transport)                    | KRONOS     | (étalon à MAJ)      | durcissement légitime              |
| É3 — canal MIDI lu côté hôte                                  | KRONOS     | (à aligner)         | micro-lecture d'adressage          |
| É4 — remap charge `vel/127` + élagage CV                      | KRONOS     | **C3**              | à pousser aval                     |
| É5 — énumération OSC lit params acteur                        | KRONOS     | (info)              | setup légitime                     |
| É6 — valeurs host-owned résiduelles                           | KRONOS     | (info)              | légitime, aucune autorité inventée |
| E1 — composition payload côté hôte                            | PUITS      | **C3** (principale) | ❓ trancher (escalade)             |
| E2 — `coerceControlValues` coerce                             | PUITS      | **C3**              | à pousser aval                     |
| E3 — glu n'implémente que `send`                              | PUITS      | (à documenter)      | divergence forme adaptateur        |
| E4 — deux surfaces MIDI, contrat figé sur `MidiSink`          | PUITS      | sync contrat hub    | à réconcilier                      |
| E5 — pas de contrat hub OSC figé                              | PUITS      | sync contrat hub    | à figer                            |
| E6 — hôte construit le `WebSocket` OSC                        | PUITS      | **C6**              | tangle, légitime mais à borner     |
| E7 — `deriveOscBindings` lit `actors`                         | PUITS      | (info)              | énumération de setup, légitime     |
| 1 — `plat` non retiré                                         | RUNTIME-UI | **C4**              | conduit mort (Q4 non appliquée)    |
| 2 — `ViewId` commentaire périmé                               | RUNTIME-UI | sync étalon         | doc à corriger                     |
| 3 — `CursorView` sur-fourni                                   | RUNTIME-UI | (latitude)          | narrower le handle                 |
| 4 — fiche F10 imprécise                                       | RUNTIME-UI | (alignée ici)       | corrigé en §3                      |
| 5 — store `production` champs morts                           | RUNTIME-UI | **C4**              | nettoyage                          |

---

## Questions Romain

1. **C1 (la grosse)** — l'hôte importe la DATA du domaine (5 catalogues hauteur + `mod.json`) et
   **exécute** `buildModulators` en process : branchement légitime, OU les catalogues + le registre de
   modulation doivent-ils voyager `BPScript → BPx → Kairos` dans la donnée (modèle KAI-9), pour que
   l'hôte soit aveugle au domaine hauteur/modulation ? (cf. frontière `charger()`.)

2. **C2** — store `blocks` (re-parse texte) : périmètre confirmé = affordance d'éval éditeur seulement ?
   La résolution d'aux .gr (`parseWithSound`/`resolveGrAux`/…) remonte-t-elle entièrement côté
   bp3-frontend ?

3. **C3 / E1** — la couche-glu (`prep` + 4 adaptateurs) est-elle un détail de câblage admis (l'hôte est
   auteur de l'adaptateur Kronos pour audio/midi/osc), ou doit-elle rétrécir à un pur passe-plat — la
   conversion `vel/127`, la coercition `coerceControlValues` et l'élagage des descripteurs CV déménageant
   vers runtime-audio/midi/Kairos (invariant machine n°5) ?

4. **E4 / E5 (sync contrat hub)** — figer la frontière MIDI réelle sur `MidiTransport.send` (et non
   `MidiSink`) ; créer le contrat hub OSC manquant (`kanopi-runtime-osc.md`). À ratifier.

5. **`transposeToken`** — surface de contrat morte côté hôte : la supprimer du contrat, ou la documenter
   comme réservée à un transpose d'affichage futur (KAN-18) ?
