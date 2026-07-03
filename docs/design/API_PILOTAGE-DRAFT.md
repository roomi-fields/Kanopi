# API de pilotage Kanopi (« second front ») — RÉFÉRENCE de l'API PUBLIQUE

> Statut : **API PUBLIQUE** (décision Romain 2026-07-02 — `window.kanopi` installée en prod, plus
> DEV-only ; phase 1 validée archi [430]). **Référence informationnelle** : Romain en dérive une page
> d'aide web pour humains, ce document reste la source. **La §4 décrit la surface RÉELLE `window.kanopi`
> v6** (`kanopi-api.ts`, tenue à jour avec le code) ; les entrées non encore livrées sont en §4.4. Phasage en §8.
> Cadrage Romain 2026-07-01 : une API scriptable qui pilote **la vraie app qui tourne**, à côté
> de l'UI, **sans bypasser aucun composant**, avec **effets visibles dans l'UI**, et qui **remplace
> toutes les bidouilles de test** ad-hoc actuelles. Doit être **évolutive**.

## 1. But (fonctionnel)

- Offrir un **deuxième front de commande** sur l'app Kanopi en cours d'exécution — le premier étant
  l'UI. Piloter la production par script/CLI, sans clic manuel, pour tester : chargement de scène,
  éval/production, transport (play/stop/tempo/boucle/re-random), et **lire** structure, bindings de
  modulation, état transport, et une **mesure audio** de la sortie.
- **Remplacer** l'instrumentation de test jetable que j'écris à la main à chaque investigation
  (wraps `AudioContext`, imports dynamiques de stores, `window.__osc/__an/__bind`, etc.).

## 2. Règle dure (non négociable) — DÉLÉGUER, JAMAIS RÉIMPLÉMENTER

Chaque commande de l'API appelle **exactement le même point d'entrée que le bouton UI
correspondant** (le même store / la même action). **Aucune logique métier dans l'API.** Conséquences
garanties par construction :
- **Aucun composant bypassé** (l'API n'a pas de chemin parallèle).
- **L'UI reflète** tout effet (mêmes instances singletons réactives : `clock`, `kronosCursor`,
  `playback`, `workspace`, l'adaptateur).
- Pas de mock, pas de moteur dupliqué → pas de fausse confiance (l'anti-pattern du projet).

## 3. Architecture

**Fait technique cadrant** : la logique de l'app tourne **dans le navigateur** (Svelte côté client) ;
le serveur Vite ne sert que les fichiers. Donc l'API est une **façade exposée DANS l'app**, pilotée
**depuis l'extérieur** via le protocole DevTools / Playwright (navigateur possiblement *headless*).
« Sans UI manuelle », pas « sans navigateur » — c'est le seul moyen d'avoir *exactement* le vrai
câblage et la répercussion UI.

Quatre couches :

1. **Façade `window.kanopi`** (formalise et remplace l'actuelle surface de debug `__kanopi`) —
   commandes + inspection. Chaque méthode = **un délégué** vers l'action existante. Zéro logique.
2. **Services partagés** — remonter les rares actions qui vivent aujourd'hui **dans un composant
   Svelte** (ex. `writeTempoToScene` dans `TransportCluster.svelte`) en **service** appelé par le
   composant ET la façade. C'est ce qui donne « TOUS les mêmes fonctionnements ».
3. **Sondes d'inspection stables** — hooks nommés pour lire structure / bindings / mètre audio, en
   remplacement des taps ad-hoc. Lecture seule, aucun effet.
4. **Canal externe** — Playwright / CDP d'abord (existe déjà) ; pont WebSocket optionnel plus tard
   pour une CLI persistante sans Playwright (confort, pas cœur).

Principe transverse : **une seule source de vérité** (les stores singletons). L'API n'introduit
aucun état propre.

## 4. Interface — surface RÉELLE `window.kanopi` v10 (source de vérité : `kanopi-api.ts`)

Installée dans **TOUS les builds** (prod incluse — API publique, plus DEV-only). `window.kanopi.version` = **10**.
Surface **additive** (ajouter une capacité ≠ casser l'existant). Deux familles : **commandes** (effet,
délèguent au point d'entrée UI) et **inspection** (`inspect.*`, lecture seule, aucun effet).

### 4.1 Commandes (effet ⇒ délègue au même point d'entrée que l'UI)

| Méthode | Délègue à | Équiv. UI |
|---|---|---|
| `setSceneText(text) → boolean` | `workspace.updateContents(id, text)` | frappe éditeur (false si pas d'onglet) |
| `eval() → Promise` | `openBlocks.evalOne(b)` ∀ bloc ouvert | Ctrl+Enter (par bloc) |
| `play()` `pause()` `stop()` | `playback.*` | boutons transport |
| `setTempo(bpm) → number` | `clock.setBpm` (rend la valeur clampée) | champ BPM |
| `toggleLoop()` `toggleReRandom()` | `transport.toggle*` | boutons |
| `hush() → Promise` | `core.hushAll()` | Ctrl+. |

### 4.2 Inspection (`inspect.*`, lecture seule)

| Requête | Source (singleton / facette) |
|---|---|
| `inspect.structure()` | `productionFeed.structure()` (structure projetée Kairos) |
| `inspect.flat()` | `productionFeed.plat()` — arbre « flat » Kairos (`arbreCourant()`, lecture) |
| `inspect.modulations(input?)` | bindings OBSERVÉS sur les events forwardés (tampon borné 512) |
| `inspect.clearObserved()` | vide le tampon d'observation (avant une capture) |
| `inspect.audio.enableMeter(fftSize=2048)` / `disableMeter()` | compteur runtime-audio (lecture-seule) |
| `inspect.audio.measure() → {rms, spectralCentroid} \| null` | idem (active le compteur au besoin) |
| `inspect.audio.clockBound() → boolean` | v8 — le sink audio a-t-il reçu la vue horloge de KRONOS (`bindClock`, canal B) |
| `inspect.frameStats() → {frames, rafStallsOver100, longtasks}` | v9 — sonde de FLUIDITÉ du fil principal (~15 s glissantes, gels horodatés) pour mesurer dans la session réelle |
| `inspect.profileScroll(ms=8000) → Promise<{ok, samples, idlePct, top}>` | v10 — sonde de PILE CHAUDE (JS Self-Profiling) : NOMME les fonctions qui tiennent le fil pendant un geste reproduit (exige l'en-tête `Document-Policy: js-profiling`, posé par vite.config — redémarrer un serveur antérieur) |
| `inspect.generation() → number` | `productionFeed.generation` (re-charge / swap re-random) |
| `inspect.transportState() → string\|null` | `kronosCursor.active.transport.state` (autorité Kronos) |
| `inspect.position() → number\|null` | `kronosCursor.active.transport.position()` (beats) |
| `inspect.cursorState() → string` | v7 — miroir réactif `kronosCursor.state` (rendu ; l'autorité reste `transportState`) |
| `inspect.cursorBeat() → {bar,beat,beatsTotal}\|null` | v7 — beat/bar RENDU (`kronosCursor.beat`, échantillonné par le rAF) |
| `inspect.lastViewInput(viewId?) → snapshot\|snapshot[]` | v7 — dernier `ProductionInput` poussé aux vues (`mode`/`hasCursor`/`durationSec` + identités stables `cursorId`/`structureId`) |
| `inspect.effectiveTempo() → number` | `kronosCursor.tempo` (miroir réactif) |
| `inspect.loop()` / `inspect.reRandom() → boolean` | `transport.loop` / `transport.reRandom` |

`inspect.modulations(input?)` rend un tableau de bindings extraits VERBATIM du content forwardé :
`{ token, onset, occurrence, input, clock, busRef, windowStartScene, windowEndScene, ringId, seam }`,
filtrable par `input` (ex. `'cutoff'`). C'est un **observateur** (remplace le tap `AudioRuntime.send`),
pas une lecture directe de la facette Kairos — une inspection par-facette des modulations demande un
hook de lecture amont (décision archi escaladée).

La sonde `audio` est **la seule** partie qui touche Web Audio et **ne tient aucun nœud côté Kanopi** :
elle délègue à l'affordance lecture-seule de runtime-audio (`pilotAudioMeter()`) qui lit des NOMBRES
(RMS, centroïde spectral en Hz) sur un `AnalyserNode` branché une fois. Le compteur est recréé à chaque
eval (nouvel AudioRuntime) → `measure()` le réactive à la volée (idempotent).

### 4.3 Canal CLI (`packages/ui/scripts/kanopi-cli.mjs`) — troisième front

Pilote `window.kanopi` depuis un terminal via Playwright (Chrome headless sur le serveur de dev) :

```
node scripts/kanopi-cli.mjs <commande> [args…]      # une commande
node scripts/kanopi-cli.mjs run <fichier|->         # un script (une commande/ligne, # = commentaire)
```

Env `KANOPI_BASE_URL` (défaut `http://localhost:5173`) · option `--headed`. Chaque commande = un appel
`window.kanopi.*`, SAUF `load <nom-carte>` (clic UI sur la bibliothèque, cf. §4.4) et `wait <ms>`.
`inspect <clé> [args]` route vers `inspect.<clé>` (structure | transportState | effectiveTempo | loop |
reRandom | generation | flat | modulations [input]).

### 4.4 Proposé / NON encore implémenté (phase 2 — action logée dans un composant Svelte)

Ces entrées de la spec initiale **n'existent pas** dans la surface v6 : elles vivent dans un composant
(pas dans un store), donc leur exposition propre passe par l'extraction en service partagé UI+API (§8) :

- `loadScene(id)` — le chargement passe pour l'instant par un **clic UI** (le CLI `load` clique la
  carte Library dont le titre contient le nom).
- `produce()` — re-dérivation (re-roll) logée dans un composant.
- `seek(pos)`, `step()` — non délégués.
- `setTempo` **n'écrit pas** le tempo dans la scène (`writeTempoToScene`) : v6 fait seulement
  `clock.setBpm` ; l'écriture-scène reste candidate phase 2.
- `getSceneText()` / `getMeter()` — pas de getter de texte ni de mètre-DeriveResult (le mètre AUDIO,
  lui, est `inspect.audio.*`).

## 5. Ce que ça remplace (nettoyage — obligatoire, pas optionnel)

À supprimer une fois l'API en place :
- Les wraps globaux `AudioContext.prototype.createOscillator / createBiquadFilter / connect` que je
  réinstalle à chaque test → remplacés par la sonde `audio.*`.
- Les imports dynamiques de stores (`import('/src/stores/…')`) dans mes evals → **piège connu** :
  ils peuvent rendre une **instance DUPLIQUÉE** du module (vu cette session : `userTempo` lu à
  `null`). L'API expose les **vrais singletons** → supprime le piège.
- Les surfaces jetables `window.__osc/__an/__bind/__kc/__snap` → remplacées par `window.kanopi.*`.

## 6. Évolutivité (exigence Romain)

- **Registre de commandes extensible** : ajouter une capacité = ajouter une méthode façade + son
  délégué, sans toucher au canal ni au reste.
- **Sondes extensibles** : ajouter une mesure = un hook nommé (ex. une nouvelle facette à lire).
- **Schéma d'API versionné** : `window.kanopi.version` ; contrat stable pour la CLI.

## 7. Honnêteté / limites

- Ça **tourne dans un navigateur** (headless possible), pas en Node pur. Assumé : c'est là que vit
  le vrai câblage.
- Le **son réellement rendu** reste temps réel via l'app ; un rendu **hors-ligne déterministe**
  (`OfflineAudioContext`) est une **évolution de phase 3** (accélère + rend reproductible la mesure
  audio), pas la fondation.

## 8. Phasage

- **Phase 1 (petite) — ✅ LIVRÉE (v6)** — façade `window.kanopi` sur ce qui a déjà des méthodes de
  store (eval/transport/tempo + inspection structure/flat/modulations/état/position) + sonde `audio`
  unifiée + le CLI `kanopi-cli.mjs` (Playwright/CDP). **Remplace les bidouilles.** Détail : §4.1–4.3.
- **Phase 2 (refactor modéré) — pas lancée (gelée avec le lot pilotage)** — remonter les
  actions-composant (`loadScene`, `produce`, `writeTempoToScene`, `seek`, `step` — cf. §4.4) en
  services partagés UI+API → complétude « aucun bypass ».
- **Phase 3 (option)** — pont WebSocket (CLI persistante) + rendu audio hors-ligne déterministe.

## 9. Garde-fous

- Règle « déléguer jamais réimplémenter » **écrite dans le code** (commentaire de la façade) et
  vérifiée en revue.
- Un test qui prouve que **API et UI appellent le même point d'entrée** (ex. `kanopi.setTempo` et le
  champ BPM passent tous deux par `clock.setBpm` — pas de second chemin).
- Interdiction d'état propre dans la façade.

## 10. Questions à l'architecte

1. Périmètre + emplacement (façade dans `packages/ui/src/lib/…` ? nom `window.kanopi` ?).
2. Le refactor « actions-composant → services » (phase 2) touche des composants : GO par étapes ?
3. Canal : Playwright/CDP d'abord suffit, ou pont WS d'emblée ?
4. Contrat d'interface à figer (partie 4) : à ratifier avant que je code ?
