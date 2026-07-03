# Revue de code Kanopi — 2026-06-27

**Demandeur** : Romain · **Périmètre** : arc de migration magnétophone / KAI-9 / KAI-10 /
@mm→@tempo · **Diff** : `git diff 58c153d...HEAD -- packages/` (97 fichiers).

**Méthode** : revue multi-agents (effort max). 10 chercheurs (5 axes correction + reuse,
simplification, efficiency, altitude, conventions) → 42 candidats → 41 vérificateurs adversariaux
**indépendants** (un par couple fichier:ligne) → **38 vérifiés / 4 réfutés** → synthèse
dédupliquée par cause racine = **31 défauts distincts**. Chaque finding est ancré
fichier:ligne + commit de migration ; les preuves d'identité circulaires sont rejetées.
Coût : ~4,2 M tokens, 54 agents.

**Verdicts** : `CONFIRMÉ` = entrée/état déclencheur + sortie fausse nommés, ligne citée ·
`PLAUSIBLE` = mécanisme réel, déclencheur incertain (timing/env).

---

## Verdict sur la question dure (Kanopi ne résout / compose / rend RIEN)

**KAI-10 (hauteur) est propre** : aucun finding ne montre l'hôte recalculant
hauteur/fréquence/accordage. La résolution de hauteur a bien quitté Kanopi — vérifié
adversarialement, zéro recalcul de `content.pitch`. **Résidu** : du **code mort** que KAI-10 a
laissé derrière (F14), avec des commentaires qui décrivent encore une résolution de hauteur hôte
supprimée — dangereux car il invite à recâbler l'anti-pattern.

**Mais une autorité inventée par l'hôte survit**, sur une autre facette que la hauteur :
**la mesure** (F10). L'hôte code en dur `BEATS_PER_BAR = 4` au lieu de lire la facette
`result.meter` que BPx grave. C'est le seul accroc franc au principe « ne résout/n'invente rien »
— et il touche directement le matériau maqâm/non-occidental (mesures additives) ciblé par les
migrations.

**Synthèse de l'arc** : la dette confirmée n'est pas dans la hauteur — elle est surtout dans
**le magnétophone / voix de code** (régressions de transport réelles, F01–F08) et dans une
**poignée d'autorités inventées ou figées** (F10, F11). Le thème systémique récurrent : l'hôte
**fige ou invente** une autorité qu'il devrait lire en amont.

---

## A — Bugs de correction transport / audio (les plus graves) · CONFIRMÉS

### F01 — Stop/Pause inertes sur les voix de code autonomes
`packages/ui/src/stores/playback.svelte.ts:97` (+ `lib/core-real/real-core.ts:353`) · commits
b61531e (Model C `stopInPlace`) / 784fa44.
Le chemin Stop est passé de `core.silenceRuntimes()` (sentinelle `__hush__`, honorée par
runtime-codevoices) à `core.stopInPlace()` (sentinelle `__stop_in_place__`). Les adaptateurs de
voix de code ne traitent comme hush total que `__hush__`/vide (`runtime-codevoices strudel.ts:851`) ;
toute autre clé supprime un slot inexistant et **re-flush les voix encore armées**. Une voix de
code autonome ne crée aucun handle Kronos, donc `playback.pause()` (l.87-88) est aussi un no-op
(transport null, kronosCursor.active null).
**Scénario** : ouvrir un `.strudel`/`.hydra`/`.tidal`/`.p5` autonome, évaluer (ça sonne), presser
Stop → **le son continue** ; Pause inerte aussi. Seul Ctrl+. (hushAll → `__hush__`) coupe. Les
voix backtick embarquées dans un `.bps` ne sont pas touchées (leur handle Kronos coupe via
`opts.stopCodeVoices`, `kronos-audio.ts:591`) — d'où une suite e2e `.bps` restée verte sur cette
régression.

### F02 — Éval d'une voix de code = transport affiché « STOPPED » (aggrave F01)
`packages/ui/src/lib/core-real/real-core.ts:313` · commit 784fa44.
`evaluateBlock` ne bascule plus un état transport « playing » après éval d'un fichier voix-de-code
seul (l'appel hôte `startSilently()` a été retiré). Pour bp3/bpscript natif, un handle Kronos passe
le curseur à « running » ; une voix de code autonome ne bâtit aucun handle → `playback.mode`
reste « stopped » et `clock.state.playing` reste false. Le commentaire le présente comme voulu
(l'ancien « playing » inventé par l'hôte était l'anti-pattern retiré), **mais l'invariant
« éval qui sonne → transport lit playing » n'est pas rétabli** pour ce chemin.
**Scénario** : évaluer un `.strudel`/`.hydra` : ça joue, mais le transport affiche STOPPED, le BPM
« — », les 4 LED ne s'animent pas. L'UI contredit l'audio (et avec F01 : l'utilisateur voit
« stopped », presse Stop, rien ne change).

### F03 — STEP saute un temps sur deux
`packages/ui/src/stores/playback.svelte.ts:112`.
STEP lit le `transport.beatPosition()` **brut** (garé en fin de grain joué, K+1) au lieu du
`beatPosition()` **compensé** du handle (le temps joué K), puis ajoute 1 → suivant = K+2. Kronos
`step(1)` pose `#resume = fold(from+grain)` et `position()` renvoie ce point d'atterrissage
(`kronos transport.ts:170/230`) ; le handle surcharge `beatPosition()` précisément pour annuler ça,
mais `step()` court-circuite le handle via `this.transport`.
**Scénario** : STEP répété auditionne 0,2,4,… (ou 1,3,5,… si le handle est garé à 0) — la moitié
de la production inaudible au pas-à-pas.

### F04 — Espace traite « pause » comme stop
`packages/ui/src/lib/keybindings/bindings.ts:73` (+ commande palette `commands/registry.ts:29`).
`playback.mode === 'stopped' ? play() : stop()` route l'état « paused » vers le `else` → `stop()`.
L'ancien comportement (`clock.toggle`) reprenait depuis pause ; `playback.play()` reprend toujours
un transport en pause en place, mais ni Espace ni la commande ne peuvent atteindre ce chemin.
**Scénario** : pause en milieu de scène + Espace (attendu : reprendre) → stop + playhead remis à 0 ;
le prochain Play repart du haut, position de pause perdue.

### F05 — « Unmute all » (Ctrl+0) laisse une voix orchestrée muette
`packages/ui/src/lib/core-mock/mock-runtime.ts:48`.
`MockActors.unmuteAll()` mute directement le champ `muted` sans passer par `this.setMuted()`,
court-circuitant l'override `RealActors.setMuted` (`real-core.ts:40`, dont le hook `onMute` appelle
`armOrchestratedActor → kronosAudio.setActorMuted(name,false)`) ; `RealActors` ne surcharge pas
`unmuteAll`.
**Scénario** : jouer un `.bps` orchestré, mute une voix (Ctrl+1, elle se tait), Ctrl+0 : la LED
s'éteint (store ré-émet `muted:false`) mais **la voix reste silencieuse** (onMute ne tire pas, ni
le mute persistant Kronos ni le set hôte ne sont nettoyés). Il faut re-toggler 2× pour rétablir.

### F06 — Fuite de tempo inter-scène (garde de réentrance défait)
`packages/ui/src/lib/runtimes/bpx-adapter.ts:1537` (+ `:951`).
Le garde `projectingGrammarTempo` (posé true l.1535, remis false dans le `finally` **synchrone**)
doit empêcher le tempo projeté d'une scène d'être enregistré comme `userTempo`. Mais le puits de
tempo (`real-core.ts:88`) **diffère** le `clock.setBpm → adapter.setBpm` réentrant en microtâche
(`import().then()`) ; quand `if (!projectingGrammarTempo) userTempo = bpm` s'exécute, le `finally`
a déjà remis le drapeau à false → le garde ne se déclenche **jamais**.
**Scénario** : après une scène `@mm:70`, charger/évaluer une scène **sans** `@mm` la fait dériver
et sonner à 70 BPM (et l'affichage montre 70) au lieu du défaut moteur 60 — la fuite exacte que le
garde devait prévenir.

### F07 — Tempo de scène projeté écrêté [20,300]
`packages/ui/src/stores/clock.svelte.ts:69`.
`setBpm()` clampe **toute** valeur à [20,300] (`clampBpm`), mais le tempo effectif projeté de la
scène y arrive via `onTempoFromGrammar` (`bpx-adapter.ts:1537 → setTempoSink → real-core.ts:89 →
clock.setBpm`). Le commentaire du store (l.29) affirme que le clamp ne vaut que pour la saisie
locale, jamais pour le tempo projeté — le câblage viole ça : le tempo projeté est clampé puis la
valeur clampée re-essaime, écrasant `currentBpm` de l'adaptateur (la copie de la grille STEP).
**Scénario** : une scène `@tempo 16` ou `@tempo 400` voit sa grille STEP et l'affichage BPM forcés
à 20/300, désaccordés du tempo réellement dérivé (16/400). Scènes 20–300 non affectées.

### F08 — Socket OSC ouverte en phase produce (contrat buildOnly violé)
`packages/ui/src/lib/runtimes/kronos-audio.ts:289` · commits OSC-5b c11b025 + Model C b61531e.
Le montage OSC (`new WebSocket(oscWsUrl)` + `oscAdapter.setBindings`, l.289-323) s'exécute
**inconditionnellement**, AVANT la branche buildOnly/step/play (l.527-543). L'unique appelant
(`bpx-adapter.ts:1880`) passe ensemble `buildOnly`, `actors=actorOutputs` ET `oscWsUrl=routing.json`.
Donc un produce/load Model C (`buildOnly=true`) d'une scène à acteurs `transport.osc` **ouvre une
vraie WebSocket** vers le relais et pré-résout les bindings alors que le transport reste « stopped »
et muet — ce que le contrat buildOnly interdit explicitement (l.523-526). Asymétrie :
`driver.start()` EST gardé par `!buildOnly`, le montage OSC ne l'est pas ; seul OSC fuit.
**Scénario** : ouvrir/produire (sans Play) une scène OSC ouvre prématurément la connexion ; si le
relais est éteint, journalise « relais OSC injoignable » pendant un chargement silencieux.

### F09 — Notation scientifique non bornée → Infinity → RangeError AudioParam
`packages/core/src/dispatcher/dispatcher.js:35` · commit 896f476.
La regex numérique de `coerceControlValues` accepte la notation scientifique non bornée : `1e400`
passe le test et `Number()` rend Infinity — contredisant le commentaire inline « la regex ne matche
que des littéraux finis, donc `Number(s)` est toujours fini » dont dépend désormais le chemin audio
live (`kronos-audio prep()` → contrôles/vélocité de chaque note).
**Scénario** : `(cutoff:1e400)` ou `(filterQ:1e309)` silencieusement coercé en Infinity ;
`kronos-audio` le transmet à runtime-audio, où affecter une valeur non-finie à un AudioParam Web
Audio jette une RangeError dans `send()` → la voix échoue à se programmer, note muette/erreur au
lieu d'une dégradation propre.

---

## B — Autorité inventée / résolution résiduelle (cœur du principe dur) · CONFIRMÉS

### F10 — `BEATS_PER_BAR = 4` codé en dur au lieu de la facette `result.meter`
`packages/ui/src/stores/kronos-cursor.svelte.ts:127` (+ `:130`, `clock.svelte.ts:77`,
`kronos-audio.ts:205` & `:646`).
Le regroupement en barres code en dur `BEATS_PER_BAR=4` dans plusieurs sites hôte au lieu de lire
la facette de mesure que BPx grave (`session.d.ts:183 meter?: MeterSignature`) ; grep d'un seul
`.meter` lu = **vide**. Constante dupliquée (`kronos-cursor.svelte.ts:38`, `kronos-audio.ts:205`,
`clock.svelte.ts:24`), contredisant la source `result.meter` établie (a60f031).
**Scénario** : une scène à mesure non-4 / additive — exactement le matériau maqâm ciblé
(`[meter:3+2/8]`) — a son index de barre calculé `floor(beat/4)` (et `transport.beatPosition(4)`
à `kronos-audio.ts:646`), donc l'affichage barre·temps ET les `onBar` envoyés à p5/hydra tombent
sur une frontière de 4 temps qui n'existe pas dans la musique : position affichée et visuels
désalignés de ce qu'on entend. L'hôte invente l'autorité de mesure (CLAUDE.md : « tout ce que
l'hôte invente = bug »). **C'est le finding le plus grave pour le critère « ne résout rien ».**
*NB : une variante à `kronos-cursor.svelte.ts:38` a été réfutée séparément (voir Réfutés) ; la
cause racine confirmée est bien la triplication de la constante listée ci-dessus.*

### F11 — `.gr` re-parsé depuis le TEXTE (anti-pattern interdit)
`packages/ui/src/lib/runtimes/bpx-adapter.ts:392` (+ `:382`).
Deux lecteurs de section parallèles : `headSectionNames` re-parse le **texte** des règles de tête
`.gr` par regex/scan de caractères, tandis que `.bps` passe par `headSectionNamesFromAst`. Le
commentaire `head-sections-ast.ts:6` dit que le lecteur AST « remplace » le scan texte — faux pour
`.gr`.
**Scénario** : les repères de section `.gr` dérivés par regex sur la source grammaticale = anti-pattern
« blocs re-parsés du texte » interdit par l'architecture. Une ligne de tête `.gr` que le scanner
mé-tokenise (groupes `{}` imbriqués, terminaux de contrôle inline) donne des bornes de section
fausses/absentes dans la vue production/timeline, alors que le chemin AST `.bps` est correct.
Une fonctionnalité, deux chemins divergents à maintenir, le texte étant le cas fragile justifié
seulement par « .gr n'a pas d'AST ».

---

## C — Tempo @mm→@tempo : l'hôte n'adopte pas le canon v0.8 · CONFIRMÉS

### F12 — `mmFromAst` ne reconnaît que le nœud `mm`, pas `@tempo`
`packages/ui/src/lib/runtimes/bpx-adapter.ts:494`.
`mmFromAst` ne matche que `node.name==='mm'` ; une scène v0.8 `@tempo:120` (canon) donne
`declaredMm=undefined → deriveTempo=undefined` (l.1432). L'hôte n'adopte pas le tempo déclaré.
**Cause racine partiellement AMONT** : l'oracle note que bpscript ne route pas encore `@tempo`,
donc le frontend n'émet possiblement pas de nœud `tempo` à lire. → à coordonner avec BPx.
**Scénario** : sur `midi-channel-override.bps` (`@tempo:120`), la grille STEP et l'affichage tempo
hôte ne reflètent pas les 120 BPM déclarés.

### F13 — `writeMmDirective` ne réécrit que `@mm`, pas `@tempo`
`packages/ui/src/lib/runtimes/mm-directive.ts:16` · canon v0.8 = `@tempo` (arbitrage Romain
2026-06-26 « tout migrer en @tempo », commit v0.8 c816f03).
`writeMmDirective` ne reconnaît que `@mm` (MM_RE l.9). Helper de réécriture 100 % hôte (indépendant
du routage amont).
**Scénario** : l'utilisateur change le BPM du transport sur une scène v0.8 `@tempo:120` →
`writeMmDirective` ne matche pas et renvoie le texte inchangé : la ligne tempo n'est jamais réécrite,
valeur affichée et source divergent silencieusement (alors que l'intention est « changer le tempo
du haut doit changer le `@tempo` de la scène »).

---

## D — Code mort post-extraction · CONFIRMÉS

### F14 — `scaleSystemFromAst` + champs alphabet/tuning scène morts + commentaires trompeurs (post-KAI-10)
`packages/ui/src/lib/runtimes/bpx-adapter.ts:474` · commit 8755a7d.
`scaleSystemFromAst` + les champs scène-level alphabet/tuning (spread l.687) ne sont lus **nulle
part** (seul l'alphabet par-acteur `props.alphabet` l.608 est vivant) ; les commentaires l.161-167
et l.684-687 décrivent encore « the non-orchestrated WebAudio path builds its pitch resolver from
the bpscript catalogs », ce que KAI-10 a supprimé — contredisant l'en-tête du fichier l.46-50
(« host imports ZERO of @kronos/core/pitch »).
**Coût** : viole « pas de code mort laissé par une extraction ». Un mainteneur suit le commentaire
« the WebAudio path resolves pitches » et recâble une résolution de hauteur hôte — exactement
l'anti-pattern que KAI-10 a éliminé — ou perd du temps à découvrir que ces champs sont morts ;
`scaleSystemFromAst` tourne à chaque parse pour rien.

### F15 — Carte acteur→transport du Dispatcher morte + commentaires trompeurs (post-KAI-9)
`packages/core/src/dispatcher/dispatcher.js:69` · commit 90c1448.
La carte acteur→transport (`_actors` l.52, `setActors` l.69, `setActorTransport` l.83) n'est jamais
ni remplie ni lue — le routage se fait désormais par `event.output.runtime`. Le Dispatcher ne sert
plus que de conteneur de cycle de vie (`addTransport`/`stop`).
**Coût** : aucun appelant n'invoque `setActors`/`setActorTransport` (grep), et le dispatcher n'est
même pas passé à `startKronosAudio`. Pire : les en-têtes `dispatcher.js:4` et `index.js:1` affirment
encore « Kronos reads this object's per-actor map (`_actors`) » — faux. Un mainteneur appellera
l'API annoncée en attendant un effet → no-op silencieux + debug perdu. ~30 lignes mortes que le
commentaire trompeur protège.

### F16 — Relais `play/stop/toggle` morts du store clock
`packages/ui/src/stores/clock.svelte.ts:53`.
`play()` (l.53), `stop()` (l.56), `toggle()` (l.59) du store clock sont des relais morts vers
`playback` : aucun appelant. Le registre de commandes route délibérément via `playback` directement
(« never the clock directly », `registry.ts:21-30`) et réimplémente même `toggle`.
**Coût** : grep confirme zéro appel (hors définitions/commentaires). L'ancien `blocks.svelte`
appelait `clock.play()`, la migration l'a remplacé par `replayArmed()`. Ces 3 méthodes annoncées
comme l'API publique du store sont un piège : un nouvel appelant réintroduit la double-indirection
que la migration a supprimée. À supprimer.

---

## E — Démos livrées en forme périmée · CONFIRMÉS

### F17 — `dual-actors-audio.bps` en forme v0.7 (`alphabet:western transport:webaudio`)
`packages/library/bundled/demos/dual-actors-audio.bps:8` (et `:9`) · commit e8a20dc.
Démo créée DANS l'arc de migration avec la forme v0.7 périmée (`:` au lieu de `.`) pour les deux
acteurs. Canon v0.8 = le point (`alphabet.western transport.webaudio`). L'oracle mécanique classe
ces 4 occurrences « PÉRIMÉ » : ne compile QUE par rétrocompat. Incohérence directe avec la démo
sœur du même arc (`midi-channel-override.bps:22`, commit 0a70d11) qui utilise la forme point canon.
**Scénario** : quand bpscript retire la rétrocompat `:`→`.`, les deux acteurs perdent
alphabet/transport (routage par défaut, scène potentiellement muette) ; en attendant la démo enseigne
la graphie périmée et contredit sa voisine.

### F18 — `cv-adsr.bps` en `@mm:138` périmé (et c'est la forme que l'hôte honore)
`packages/library/bundled/demos/cv-adsr.bps:4` · commit f837197.
`@mm:138` = directive tempo périmée (canon `@tempo:`). Fichier modifié dans l'arc sans migrer la
directive. **Couplage pervers avec F12** : c'est cette forme périmée que Kanopi honore réellement
(`mmFromAst` ne matche que `mm`), tandis que le `@tempo:120` canon de la démo sœur est ignoré par
l'hôte — les démos et l'hôte migrent en sens **opposé**.
**Scénario** : quand bpscript retire la rétrocompat `@mm`, cv-adsr perd ses 138 bpm ; et tant
qu'elle vit, c'est l'unique démo dont le tempo « marche » seulement parce qu'elle est restée périmée.

---

## F — Performance · CONFIRMÉS

### F19 — Boucle rAF du curseur jamais annulée (~60fps à vide, à vie)
`packages/ui/src/stores/kronos-cursor.svelte.ts:75`.
`requestAnimationFrame(this.#loop)` est lancé dans le constructeur et la boucle se ré-arme
inconditionnellement (l.170) ; jamais `cancelAnimationFrame`. Avec `active===null` (boot, workspace
vide, onglet en arrière-plan) la boucle tourne quand même chaque frame en faisant la comptabilité
de la branche else — réveil permanent ~60Hz qui ne fait rien (CPU/batterie sur éditeur au repos).
**Forme** : démarrer le rAF dans `set(handle)`, `cancelAnimationFrame` dans `set(null)` / quand
l'état quitte « running ».

### F20 — rAF réassigne `beat` à chaque frame même à l'arrêt
`packages/ui/src/stores/kronos-cursor.svelte.ts:166`.
Après un Stop-in-place le handle persiste (`active` non-null, state='stopped' — repos normal Model C),
donc la branche else exécute `this.beat = kc.beatPosition()` à chaque frame. `beatPosition()` rend
un **nouvel objet** à chaque appel (valeurs identiques), donc `$state` voit toujours un changement
et relance les chaînes `$derived` (TransportCluster + Statusbar : barre/temps/phase, 4 LED) ~60×/s
alors que le transport ne bouge même pas. Une scène arrêtée-mais-chargée épingle un cœur ; le churn
réactif concurrence le thread audio sous charge.
**Forme** : n'assigner que si `beatsTotal` a changé, ou poser `beat` une fois à la transition.

### F21 — `$effect` re-projette toute la production à chaque geste transport
`packages/ui/src/components/bottom-panel/ProductionViewHost.svelte:13`.
L'effet dépend de `kronosCursor.state` (+ `.active`) et, dans le même corps, appelle
`productionFeed.structure()` et `.plat()` (arbre Kairos + projection plate) puis `view.update()`.
Donc chaque play/pause/stop **re-lit et re-pousse toute la production** à la vue runtime-ui alors
que l'arbre est inchangé (il ne change que sur `generation`). Sur grande scène, chaque geste
transport re-parcourt/re-pousse toute la production → à-coup visible.
**Forme** : conditionner la re-lecture structure/plat à `generation` seul, passer le mode transport
sans re-projeter.

### F22 — `publishProduction` mappe la liste de tokens 2× par éval
`packages/ui/src/lib/runtimes/bpx-adapter.ts:874`.
`prodTokens` (l.874, secondes) et `rawTokens` (l.899, ms + type/actor) font chacun un
`tokens.map(...)` complet — deux passes O(n) et deux allocations sur toute la séquence dérivée.
`publishProduction` tourne aussi à chaque frontière de boucle quand la re-randomisation est active,
donc sur une scène re-random en boucle avec une grande dérivation (dizaines de milliers de feuilles)
ça double le marshalling de tokens par cycle.
**Forme** : bâtir les deux tableaux en une seule passe.

---

## G — Duplication / maintenabilité · CONFIRMÉS

### F23 — Trois méthodes broadcast quasi identiques
`packages/ui/src/lib/core-real/real-core.ts:320`.
`silenceRuntimes` (l.320), `stopInPlace` (l.340), `replayActiveScene` (l.362) ne diffèrent que par
la sentinelle (`__hush__`/`__stop_in_place__`/`__replay__`) et l'état final des LED ; chacune recopie
une déduplication par Set `seen` qu'un appelant ne peut pas déclencher (`listRuntimes()` rend des
clés de Map, uniques par construction → garde mort répété 3×).
**Coût** : toute évolution du balayage doit être éditée à 3 endroits ; une 4ᵉ commande engendrera une
4ᵉ copie. Forme : un seul `broadcast(sentinel, ledsActive)` privé.

### F24 — Double bornage du BPM (400 puis 300)
`packages/ui/src/components/topbar/TransportCluster.svelte:101`.
`applyEdit` borne à [20,400] (`Math.min(400, Math.max(20, n))`) puis `clock.setBpm` re-borne à
[20,300] (`clampBpm`). La borne haute 400 ne s'applique jamais ; logique de clamp dupliquée
composant + store.
**Scénario** : saisir 350 paraît accepté (sous le plafond 400 affiché) mais est silencieusement
ramené à 300 par le store — incohérent. Forme : laisser `setBpm` seul propriétaire du bornage.

### F25 — `fmt2`/`fmt3` triplicés
`packages/ui/src/components/statusbar/Statusbar.svelte:8` (+ `TransportCluster.svelte:41`,
`InspectorPanel.svelte:7`) · arc transport-projection ae942fc.
Les formateurs de zéro-padding barre/temps (2/3 chiffres) sont définis identiques 3×, tous formatant
le même affichage barre·temps Kronos.
**Scénario** : un changement de format (barres 4 chiffres, séparateur différent) appliqué à un
panneau laisse les deux autres sur l'ancien format. Forme : un module formateur partagé.

---

## H — Hygiène · CONFIRMÉ

### F26 — Octet NUL dans `compile-cache.ts` → git classe le fichier binaire
`packages/ui/src/lib/runtimes/compile-cache.ts:23`.
Le séparateur de clé de cache qui s'affiche comme un espace dans le diff est un **vrai octet NUL**
(U+0000) : les octets commités sont `${source}` 0x00 `${environnement?.tempo ?? ''}`. esbuild
échappe le NUL en `\0` donc la clé Map fonctionne au runtime, mais le NUL brut fait classer tout le
`.ts` comme binaire (« Binary files differ »).
**Coût** : git et ripgrep traitent le fichier comme binaire — le changement de clé de cache est
invisible en revue/diff et ignoré par la recherche de code (`grep -n` ne trouve rien dedans) ; un
futur merge textuel corrompt ; un formateur/bundler CI plus strict peut rejeter le NUL. Runtime non
affecté.

---

## I — PLAUSIBLES (mécanisme réel, déclencheur incertain)

### F27 — Tap-tempo : division par zéro → saut à 300 BPM
`packages/ui/src/stores/clock.svelte.ts:93`.
`setBpm(60000 / avg)` sans garde contre `avg === 0` ; si les horodatages de tap retenus sont égaux
(`performance.now()` grossi par le clamp de précision hors contexte cross-origin-isolated, ou deux
événements dans une même fenêtre de clamp), les deltas valent tous 0 → avg 0 → `60000/0 = Infinity`.
**Scénario** : deux taps sur le même horodatage clampé → `setBpm(Infinity)`, ramené à 300 par
`clampBpm` → le geste tap devient un saut silencieux à 300 BPM (re-essaimé à tous les runtimes) au
lieu d'être ignoré.

### F28 — `isControlTerminal` copié de `head-sections-ast.ts:44`
`packages/ui/src/lib/runtimes/bpx-adapter.ts:382` · module extrait commit f6140ae.
Copie octet-pour-octet du même prédicat dans le module créé précisément pour héberger la logique
section-depuis-AST. Le chemin texte `headSectionNames` pourrait appeler le partagé.
**Scénario** : la règle de terminal de contrôle BP3 change → mettre à jour `head-sections-ast.ts`
(chemin AST `.bps`) laisse la copie de `bpx-adapter.ts` (chemin texte `.gr`) périmée → un `.gr` et
un `.bps` de même structure classent le même terminal différemment, sections divergentes entre formats.

### F29 — `state.playing`/`paused` = 2ᵉ projection de `kronosCursor.state`
`packages/ui/src/stores/clock.svelte.ts:49`.
`state.playing`/`state.paused` (l.49-50) sont une 2ᵉ projection de `kronosCursor.state` déjà exprimée
par `playback.mode` ; les deux mappent indépendamment running→playing / paused→paused avec le même
garde `kronosCursor.active`.
**Scénario** : deux dérivations parallèles de la même autorité, consommées par des UI différentes
(le point d'état Statusbar lit `clock.state.playing`, la lueur du bouton Play lit `playback.mode`).
Un futur changement de règle édité d'un seul côté fera diverger les deux affichages. `clock.state.playing`
pourrait simplement dériver de `playback.mode`.

### F30 — Teardown des voix de code sortantes séquentiel
`packages/ui/src/lib/runtimes/bpx-adapter.ts:1711`.
La boucle `for (const slot of outgoingCodeSlots) { await getAdapter(slot.runtime)?.stop(...) }`
attend chaque hush l'un après l'autre. Les stops sont indépendants et un stop Hydra attend un frame
de noircissement de canvas → un orchestrateur sortant à plusieurs voix retarde le 1er paint de la
scène entrante de la SOMME des hushes au lieu du max.
**Forme** : collecter les promesses et `await Promise.all(...)`, comme le fait déjà
`tearDownOutgoingVoices`.

### F31 — Scrub défensif des descripteurs CV (peut masquer une fuite amont)
`packages/ui/src/lib/runtimes/kronos-audio.ts:355`.
Après `coerceControlValues`, une boucle supprime tout contrôle resté objet (« drop leftover CV
descriptor OBJECTS ») — un nettoyage hôte de la facette `controls` au lieu de faire confiance au
découpage modulations/controls amont.
**Scénario** : compense une fuite possible de descripteurs CV dans `content.controls`. Si KAI-10/KRO-24
séparent déjà proprement, la boucle est du code défensif mort ; si l'amont y place un jour un contrôle
légitimement structuré, il est silencieusement supprimé avant toute sortie — symptôme (contrôle qui
ne s'applique jamais) loin de ce scrub, sans log.

---

## Réfutés (4 — examinés et écartés, NE PAS traiter)

- `kronos-cursor.svelte.ts:38` — variante de la déclaration `BEATS_PER_BAR=4` (la cause racine
  confirmée est F10 ; cette occurrence précise réfutée comme doublon de candidat).
- `bpx-adapter.ts:650` — `bpsFrontend` contournant le mémoizer `compileBps` : réfuté.
- `bpx-adapter.ts:1770` — boucle de gate device séquentielle : réfuté (non bloquant prouvé).
- `kronos-audio.ts:638` — override STEP de la position Kronos : réfuté (compensation légitime de
  `step(1)`, c'est le contrat).

---

## Triage proposé (routage)

**Gains nets sans ambiguïté, 100 % hôte, à corriger tout de suite** :
- F10 (lire `result.meter`, déjà spécifié dans la note mémoire `project_meter_from_derive_result`).
- F14, F15, F16 (code mort + commentaires trompeurs post-extraction).
- F26 (octet NUL).
- F23, F24, F25 (duplication mécanique).

**Régressions de transport — arbitrage de séquence avant d'y toucher** (chemin magnétophone /
voix de code) : F01, F02, F03, F04, F05, F06, F07, F08.

**À coordonner avec l'amont** :
- F12 (`@tempo` non routé côté bpscript) → BPx.
- F18 + F17 (démos en forme périmée — migrer `@mm`→`@tempo` et `:`→`.`) → cohérent avec la décision
  Romain 2026-06-26 ; F13 (writeMmDirective) est 100 % hôte, à faire en même temps.
- F31 (scrub CV) → confirmer le contrat de séparation modulations/controls avec Kairos avant de
  supprimer.

**Perf, à planifier** : F19, F20, F21, F22 (rAF + projections + passes).

**PLAUSIBLES à confirmer/déprioriser** : F27, F28, F29, F30.
