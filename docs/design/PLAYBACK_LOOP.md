# Boucle de production & de lecture — modèle, invariants, performance

> Aspect **clé** d'un outil utilisable : la lecture doit être propre, maîtrisée,
> optimisée. Ce document est la référence du **modèle temporel** de Kanopi : qui
> produit la position, qui la consomme, à quelle fréquence, et les optimisations
> en place. À tenir à jour avec le code.

## 1. Vue d'ensemble — une source de position, plusieurs consommateurs

```
AudioContext.currentTime               (la vérité physique : ce qu'on ENTEND)
        │
        ▼
Dispatcher.musicalBeatPosition()       (packages/core/dispatcher.js)
   = musicalNow(currentTime) · tempoDérivé / 60   → { beatsTotal, bar, beat, phase }
   ancré sur l'audio (même ancre que l'ordonnancement), suit le live-tempo
        │  getDispatcherBeat()  (bpx-adapter.ts, + `gen` de génération)
        ▼
MockClock  (UI, core-mock/mock-runtime.ts)   ── UNE seule boucle requestAnimationFrame
   par image : lit le beatSource, clamp monotone, écrit `state`, émet 1×
        │  core.clock.subscribe(...)
        ▼
clock.state  (stores/clock.svelte.ts : $state { bar, beat, phase, bpm, playing })
        │  (réactif)
        ├── TimelinePanel  → curseur du piano-roll
        ├── TransportCluster → pastilles de beat
        └── status bar     → bar.beat
```

**Invariant central** : la position vient de l'**audio** (`currentTime`), pas d'un
intégrateur libre. Le curseur ne peut donc pas dériver de ce qu'on entend.

## 2. La boucle d'horloge (MockClock) — 1 émission par image

- Le constructeur lance **une** `requestAnimationFrame(loop)` ; `loop` se
  re-planifie lui-même. Il y a donc **une seule chaîne rAF** → ~60–90 itérations/s.
- Par itération, si `state.playing` : lit `beatSource()`, calcule `totalBeats`
  (clamp monotone — voir §3), écrit `this.state = {…}` (nouvel objet) et **émet
  une fois** (`this.b.emit`). Donc **au plus 1 émission de `clock.state` par
  image**. Une sur-émission est structurellement impossible (une seule boucle,
  une seule émission gardée par `state.playing`).
- Sans dispatcher (`beatSource()` → null) : intégrateur rAF libre (`dt · bpm/60`),
  même contrat (1 émission/image).

> ⚠️ Piège de mesure : en pilotage navigateur **headless / onglet en arrière-plan**,
> rAF et les timers sont **throttlés** (un `setTimeout(0,6 s)` peut prendre 12 s).
> Les calculs « X par seconde » sur de courtes fenêtres sont alors **faux**
> (extrapolation gonflée). Mesurer en **ratio** (émissions/image, redessins/image),
> throttle-indépendant — ou profiler sur un onglet **au premier plan** (§7).

## 3. Clamp monotone & re-ancrage

`mock-runtime.ts loop()` : au démarrage, l'intégrateur rAF avance d'une image ou
deux AVANT que le dispatcher (éval async) ne tourne ; le dispatcher rapporte alors
~0, ce qui « tirerait » le curseur en arrière. On clampe donc
`totalBeats = max(absPhase, beatsTotal)` (jamais en arrière). Un **nouveau**
dispatcher (`gen` changé) qui rapporte une position nettement en arrière = vrai
**redémarrage** (Ctrl+Entrée pendant la lecture) → on ré-ancre (le curseur peut
revenir au début). `gen` est estampillé par `getDispatcherBeat` (bpx-adapter).

## 4. Continu (play) vs discret (step/pause) — modèle de position

Deux mondes, un seul compteur `playback.lastBeat` (stores/playback.svelte.ts) :

- **play** : position **continue**, lue sur `clock.state` (live audio).
- **step** : avance **discrète** d'un beat ; joue le beat `lastBeat+1`, curseur à
  la **fin** du beat joué `(lastBeat+1)·beat`.
- **pause** : fige sur le beat **entendu**, ramené dans `0..n-1` (le `liveBeat()`
  grandit en boucle ; on fait `% n`). Le curseur se pose à la **fin du step en
  cours** `(lastBeat+1)·beat` — **même formule que step** ⇒ pause→step ne saute
  plus de 2 pas. (Avant : pause se posait au DÉBUT du beat → écart d'un pas.)
- **stop** : remise à zéro, curseur effacé.

Reste ouvert (décision produit) : `play` après `pause` reprend **en place**
(continu) ; un modèle 100 % discret reprendrait au beat suivant. Tranché plus tard.

## 5. Optimisations en place

1. **Coalescing du curseur** (TimelinePanel.svelte). L'effet du curseur a beaucoup
   de dépendances réactives et peut se ré-exécuter plusieurs fois par image ; chaque
   `timeline.setCursor` **repeint le canvas**. On **coalesce à un repaint par image**
   (une `requestAnimationFrame` ; l'effet ne fait qu'enregistrer la position cible).
   Ratio mesuré : **≤ 1 redessin/image** (0,17 observé). Sans ça : repaints
   redondants = saccade.
2. **Analyse du texte mémoïsée** (lib/runtimes/compile-cache.ts). À chaque frappe,
   plusieurs vues ré-**analysent** le `.bps` (libs, pastille compile, barre de
   scènes, linter). `compileBps(source)` (LRU par source) ⇒ **une seule analyse par
   contenu** au lieu de 3–4. (Rappel vocabulaire : « analyser le texte » = texte →
   arbre de syntaxe ; ≠ « produire » = dériver.)

## 6. Invariants à préserver

- Une **seule** chaîne rAF pour l'horloge (ne jamais lancer une 2ᵉ boucle sans
  annuler la précédente).
- La position UI dérive de l'**audio** (`currentTime`), jamais d'un compteur libre
  pendant qu'un dispatcher joue.
- Le canvas du piano-roll se repeint **au plus une fois par image** (coalescing).
- L'analyse du texte par frappe passe par `compileBps` (jamais `compileToBPxAST`
  direct dans un chemin réactif d'édition).

## 7. Comment profiler (sur un onglet au PREMIER PLAN)

Le headless throttle ; pour des chiffres réels, profiler dans un Chrome visible :

1. DevTools → **Performance** → enregistrer ~3 s pendant la lecture d'une scène.
2. Regarder : nombre d'images, temps par image (< 16 ms pour 60 fps), et les
   fonctions chaudes (idéalement : 1 `loop` rAF, 1 repaint canvas par image).
3. Vérifs ratio (console, throttle-indépendant) :
   - émissions `clock.state` / images rAF ≈ **1** (sinon : boucle dupliquée).
   - `Timeline.setCursor` / images rAF ≤ **1** (sinon : coalescing cassé).
4. Coût du repaint : pour une grosse production, `setCursor` repeint tout le
   piano-roll — si c'est lourd, envisager un calque de curseur séparé (repeindre
   seulement la ligne, pas tous les jetons).

## 8. Limites connues / à surveiller

- Le repaint canvas du curseur redessine toute la timeline ; coût ∝ taille de la
  production. Optimisation possible : calque dédié au curseur.
- Republication de la production à chaque tour de boucle (re-dérivation) → relectures
  de la timeline ; à mesurer sur grosses scènes.
- Reprise après pause : voir §4 (décision discret/continu à trancher).
