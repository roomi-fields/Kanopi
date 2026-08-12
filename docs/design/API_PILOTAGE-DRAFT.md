# API de pilotage Kanopi (« second front ») — RÉFÉRENCE de l'API PUBLIQUE

> Statut : **API PUBLIQUE** (décision Romain 2026-07-02 — `window.kanopi` installée en prod, plus
> DEV-only ; phase 1 validée archi [430]). **Référence informationnelle** : Romain en dérive une page
> d'aide web pour humains, ce document reste la source. **La §4 décrit la surface RÉELLE `window.kanopi`
> v17** (`kanopi-api.ts`, qui fait foi) ; les entrées non encore livrées sont en §4.4. Phasage en §8.
>
> **SURFACE PARTAGÉE — les deux frontaux mesurent par elle** (arbitrage 2026-08-12 [1312]/[1314]) :
> la mesure de campagne se prend en appelant cette façade telle quelle. Elle n'est **pas figée** —
> figer un usage qu'on ne connaît pas encore coûte plus qu'il ne protège — mais **toute modification
> part en préavis au moment du geste**, pas quand elle casse chez le consommateur.
>
> ⛔ **CE DOCUMENT A MENTI, ET IL FAUT SAVOIR COMMENT** : au 2026-08-12 son en-tête annonçait la v6,
> sa §4 la v10, et le code en était à la v17 — sept versions de dérive. Il documentait deux entrées
> **retirées du code** (`inspect.modulations`, `inspect.clearObserved`, parties le 2026-07-03 avec
> l'enveloppe audio de l'hôte) et déclarait « non implémentées » deux capacités **livrées depuis**
> (`produce()`, et l'écriture du tempo dans la scène). Un consommateur qui l'aurait lu aurait appelé
> des méthodes inexistantes et cru absentes des méthodes présentes. Remis en conformité sur le code.
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
| `setSceneText(text) → boolean` | `workspace.updateContents(id, text)` | frappe éditeur |
| `produce() → Promise<void>` | `commands/produce` — geste COMPLET, bascule comprise | bouton PROD |
| `eval() → Promise<void>` | `openBlocks.evalOne(b)` ∀ bloc ouvert | Ctrl+Enter (par bloc) |
| `play()` `pause()` `stop()` | `playback.*` | boutons transport |
| `setTempo(bpm) → number` | `commands/tempo` — warp **ET** écriture de la directive | champ BPM |
| `toggleLoop()` `toggleReRandom()` | `transport.toggle*` | boutons |
| `hush() → Promise<void>` | `core.hushAll()` | Ctrl+. |
| `removeFile(path) → boolean` | `workspace.removeFile` par CHEMIN | corbeille de l'arbre |

**Les valeurs de retour disent NON quand c'est non** — aucune de ces commandes n'échoue en silence :

- `setSceneText` rend `false` s'il n'y a **pas d'onglet actif**, et **refuse** d'écrire dans un
  fichier de DONNÉES (librairie, entrée de catalogue) : l'appelant doit d'abord donner le focus à un
  onglet de SCÈNE. Un banc de 2026-07-13 écrivait du texte de scène dans l'onglet au focus, quel
  qu'il fût, et corrompait la librairie.
- `removeFile` prend un **CHEMIN**, pas un identifiant — un banc connaît le chemin qu'il a écrit, pas
  l'identifiant minté à l'ouverture. Rend `false` si aucun fichier ne le porte. **La confirmation
  n'est pas ici** : elle vit dans l'interface, où vit le geste humain ; l'effet, lui, est le même.
- `setTempo` rend la valeur **appliquée** (bornée), pas celle demandée.

⚠️ **DEUX GESTES ONT ÉTÉ RÉPARÉS PARCE QU'ILS MESURAIENT AUTRE CHOSE QUE L'UTILISATEUR** — c'est le
piège que cette table sert à ne plus reproduire. `setTempo` warpait sans reporter la valeur dans la
directive de la scène : un re-eval faisait retomber le tempo ([927]). `produce` sautait le prélude de
bascule qui coupe la scène sortante, produisant deux scènes superposées ([929]). **Une commande qui
ne délègue pas le geste COMPLET viole la règle dure de la §2**, même quand la moitié manquante « vit
ailleurs par construction ».

### 4.2 Inspection (`inspect.*`, lecture seule)

| Requête | Source (singleton / facette) |
|---|---|
| `inspect.structure()` | `productionFeed.structure()` (structure projetée Kairos) |
| `inspect.flat()` | `productionFeed.plat()` — arbre « flat » Kairos (`arbreCourant()`, lecture) |
| `inspect.seedRegime()` | v13 — **le régime de graine de la dérivation courante** (voir encadré ci-dessous) |
| `inspect.declaredInputs()` | v15 — les RÔLES d'entrée que la scène active DÉCLARE, lus sur l'AST amont |
| `inspect.inputs()` | v15 — les ÉVÉNEMENTS d'entrée vus sur le bus, VERBATIM, du plus ancien au plus récent |
| `inspect.voiceEvents()` | ce que les VOIX DE CODE ont publié sur le bus COMMUN (le pont de republication est supprimé) |
| `inspect.hydraClock(runtime='hydra') → number\|null` | v11 — horloge PROPRE d'une voix de code (`peekClock`) ; `undefined` pour les moteurs sans horloge posable |
| `inspect.audio.enableMeter(fftSize=2048)` / `disableMeter()` | compteur runtime-audio (lecture-seule) |
| `inspect.audio.measure() → {rms, spectralCentroid} \| null` | idem (active le compteur au besoin) |
| `inspect.audio.clockBound() → boolean` | v8 — le sink audio a-t-il reçu la vue horloge de KRONOS (`bindClock`, canal B) |
| `inspect.audio.enableEventLog(cap=512)` / `disableEventLog()` / `eventLog()` | v16 [334] — journal des ENVOIS REÇUS, ouvert par runtime-audio à SA frontière ; trois passe-plats (l'hôte allume, lit, éteint). `eventLog()` rend `null` si éteint |
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

⛔ **`inspect.modulations()` ET `inspect.clearObserved()` N'EXISTENT PLUS** — retirées le 2026-07-03
(e8f59f9) avec l'enveloppe audio de l'hôte : Kanopi ne forwarde plus d'événements audio mis en forme,
runtime-audio reçoit l'événement VERBATIM, et il n'y a donc plus de tampon à observer ni à vider. Une
inspection des modulations se re-créerait par une affordance **lecture seule de runtime-audio**,
coordonnée avec lui — jamais par une enveloppe posée ici. Ce document les a listées **cinq semaines
de trop** ; elles sont nommées ici pour que personne ne les cherche.

⚠️ **LE RÉGIME DE GRAINE SE LIT, ET IL FAUT LE LIRE AVANT DE COMPARER DEUX PRODUCTIONS.**
`inspect.seedRegime()` rend `{regime:'graine-figee', graine:N}` ou `{regime:'horloge', graine:null,
cause}` (`null` si rien n'a dérivé). Sur le refus d'une grammaire à re-semence, la chaîne rejoue
**sans** graine : le rattrapage est juste, mais il était muet. Deux dérivations de la même scène,
l'une reproductible et l'autre tirée sur l'horloge, étaient **indistinguables après coup** — de quoi
affirmer un écart entre deux productions dont l'une n'a jamais été reproductible. La graine se pose
par l'adresse : `?seed=N` fige le tirage, et un bandeau ambre le dit à l'écran tant que le mode est
actif.

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
`inspect <clé> [args]` route **génériquement** vers `inspect.<clé>` : le CLI ne tient aucune liste de
clés et suit donc la façade sans être retouché. Une clé inconnue le DIT (`inspect inconnu: <clé>`).

### 4.4 NON implémenté — ce qui reste à extraire d'un composant

**Mesuré sur le code au 2026-08-12**, pas hérité de la rédaction initiale. `produce()` et l'écriture
du tempo dans la scène **ont été livrées** ([929], [927]) et sont sorties de cette liste.

- `loadScene(id)` — le chargement passe par un **clic UI** (le CLI `load` clique la carte de la
  bibliothèque dont le titre contient le nom).
- `seek(pos)`, `step()` — non délégués.
- `getSceneText()` / `getMeter()` — pas de getter de texte ni de mètre-DeriveResult (le mètre AUDIO,
  lui, est `inspect.audio.*`).
- La résolution du **bloc-sous-curseur** du Ctrl+Enter reste en composant : `eval()` évalue TOUS les
  blocs ouverts, là où l'éditeur en évalue un seul. Candidat au même traitement que les deux gestes
  réparés de la §4.1.

**RETIRÉ ET NON REMPLACÉ** — `setPlayFocus` (v17, [1015]) : le focus de jeu n'est plus commandé, il
est **lu** sur le verrou des majuscules à chaque geste. Une commande qui le poserait serait une
seconde autorité sur le même état. Un banc l'arme **comme un utilisateur**, en envoyant un événement
qui porte le drapeau du verrou (`new KeyboardEvent('keydown', { modifierCapsLock: true })`).

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

- **Phase 1 — ✅ LIVRÉE** — façade `window.kanopi` sur ce qui a déjà des méthodes de store
  (eval/transport/tempo + inspection structure/flat/état/position) + sonde `audio` unifiée + le CLI
  `kanopi-cli.mjs` (Playwright/CDP). **Remplace les bidouilles.** Détail : §4.1–4.3.
- **Phase 2 — ENTAMÉE, deux gestes extraits sur cinq** — `produce` et l'écriture du tempo vivent
  désormais en services partagés (`lib/commands/produce`, `lib/commands/tempo`), appelés par l'UI
  **et** par la façade. Restent `loadScene`, `seek`, `step` et le bloc-sous-curseur (§4.4). Ces deux
  extractions n'ont pas été un confort : sans elles, un banc mené par l'API mesurait un comportement
  que l'utilisateur ne produit jamais.
- **Phase 3 (option)** — pont WebSocket (CLI persistante) + rendu audio hors-ligne déterministe.

## 9. Garde-fous

- Règle « déléguer jamais réimplémenter » **écrite dans le code** (commentaire de la façade) et
  vérifiée en revue.
- Un test qui prouve que **API et UI appellent le même point d'entrée** (ex. `kanopi.setTempo` et le
  champ BPM passent tous deux par `clock.setBpm` — pas de second chemin).
- Interdiction d'état propre dans la façade.

## 10. Ce que ce document ne dit pas, et où le demander

Les quatre questions d'origine (périmètre, emplacement, canal, gel du contrat) sont **tranchées** :
la façade vit dans `packages/ui/src/lib/pilot/`, elle s'appelle `window.kanopi`, le canal est
Playwright/CDP, et le gel est **écarté pour l'instant** au profit de cette description ([1314]).

Ce qui reste ouvert appartient aux **consommateurs**, pas à moi : une capacité qui manque à un
frontal se demande par le bus, avec le geste qu'elle doit reproduire. Une capacité ajoutée est
**additive** et part en préavis au moment du geste.

⚠️ **CE DOCUMENT SUIT LE CODE, JAMAIS L'INVERSE.** `kanopi-api.ts` fait foi ; `version` y est
l'unique numéro vrai. La dérive relevée en tête de fichier — sept versions, deux entrées fantômes,
deux capacités déclarées absentes alors qu'elles étaient livrées — a duré parce que rien n'obligeait
la §4 à bouger avec la façade. Toute modification de la surface se répercute ICI dans le même geste.
