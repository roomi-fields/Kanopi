# API de pilotage Kanopi (« second front ») — SPÉCIFICATION (DRAFT, à valider archi)

> Statut : **brouillon**, produit pour validation architecte + ratification Romain. Non commité.
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

## 4. Interface — commandes (spécification)

Deux familles : **commandes** (effet, délèguent à l'UI) et **inspection** (lecture, sans effet).

### 4.1 Commandes (effet ⇒ délègue au même point d'entrée que l'UI)

| Commande | Délègue à (point d'entrée existant) | Équiv. UI |
|---|---|---|
| `loadScene(idOrText)` | `workspace` (ouvre/charge) | bouton Library / nouveau |
| `setSceneText(text)` | contenu CM / `workspace.updateContents` | frappe éditeur |
| `eval()` | `evaluateBlock` de l'adaptateur | Ctrl+Enter |
| `produce()` | re-dérivation (re-roll) | bouton Produce |
| `play()` `stop()` `pause()` `step()` | `playback.*` | boutons transport |
| `seek(pos)` | `playback`/transport seek | scrubber |
| `setTempo(n)` | `clock.setBpm` (+ `writeTempoToScene` via service) | champ BPM |
| `toggleLoop()` `toggleReRandom()` | `transport.toggle*` | boutons |
| `hush()` | même chemin que Ctrl+. | Ctrl+. |

### 4.2 Inspection (lecture seule)

| Requête | Source (singleton / facette) |
|---|---|
| `getSceneText()` | contenu CM |
| `getStructure()` | `productionFeed.structure()` |
| `getModulationBindings()` | `content.modulations` du flat courant (sonde formalisée) |
| `getTransportState()` | `kronosCursor.active.transport` |
| `getEffectiveTempo()` | `kronosCursor.tempo` |
| `getMeter()` | facette mètre du DeriveResult |
| `audio.measure({window, kind})` | analyseur branché sur la sortie (RMS / centroïde spectral) |

La sonde `audio` est **la seule** partie qui touche Web Audio : un `AnalyserNode` branché **une fois**
sur la sortie (pas des wraps globaux de `createOscillator`), plus un tap d'onsets planifiés pour
corréler note→mesure. Formalisée, versionnée.

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

- **Phase 1 (petite)** — façade `window.kanopi` sur ce qui a déjà des méthodes de store
  (load/eval/produce/transport/tempo + inspection structure/bindings/état) + sonde `audio` unifiée
  + un wrapper CLI (Playwright/CDP). **Remplace mes bidouilles.**
- **Phase 2 (refactor modéré)** — remonter les actions-composant (ex. `writeTempoToScene`) en
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
