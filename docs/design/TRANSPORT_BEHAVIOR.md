# Comportements du transport — cahier de référence (NON RÉGRESSABLE)

> **But : la liste AUTORITAIRE de tout ce que le transport DOIT faire.** Chaque
> modification touchant lecture/pause/step/curseur/CV **DOIT être vérifiée contre
> CETTE liste** (pas seulement contre le bug du jour) — c'est le garde-fou contre
> les régressions en cascade (Romain, 2026-06-22 : « c'est si dur de retenir toutes
> les caractéristiques et de les maintenir en même temps ? »). Statut test : ✅ test
> Node, 👁 vérif perceptuelle (œil/oreille), ⚠️ à protéger.

## Lecture (Play / boucle)
- **B1** Le son sort par **Kronos** quand `audio-engine=kronos` (défaut) ; `legacy` = filet. ✅
- **B2** Boucle : la scène se répète au bord de cycle. ✅
- **B3** Pas de **note muette** (ni en tête de boucle, ni ailleurs). 👁 ✅(repro)
- **B4** **CV** : 4 niveaux de sujet — signal (`cutoff:X`), par-note (`*:cutoff:X`),
  terminal (`C2:cutoff:X`) — + **voix sœur** suivie (env1/env2/env3) + pan. Signal =
  horloge de phrase, par-note = relance. ✅ 👁
- **B5** **Re-random** : le toggle **en cours de lecture** re-tire au tour suivant ; off = rejoue. ✅
- **B6** **Tempo warp live** : changer le BPM en lecture warpe son+curseur, **sans** re-dériver, **sans saut**. ✅

## Pause
- **B7** ⚠️ **Pause N'EST PAS nette : elle s'applique à la FIN du temps en cours.** On
  appuie sur Pause au milieu du temps B → le temps B **finit de jouer**, puis ça gèle au
  bord (fin de B). `lastBeat = B`. (Décision Romain, antérieure ; régressée par le flip
  kronos = pause immédiate → À PROTÉGER.) 👁 ✅ (transition événementielle déterministe :
  `scheduler.playWindow(from, boundary, onEnd)`, `from` ancré à l'horizon `now+lookahead` ;
  aucun poll. Test : `kronos-pause-beat-end.test.ts`.)
- **B8** **Play après Pause** : reprend **en place** (pas de re-éval, pas de saut). 👁

## Step
- **B9** Step = joue **exactement UN temps**, **à sa vraie position**, **sans modifier la
  production** (la CV est celle de la production complète à ce temps, pas re-fenêtrée). Un
  temps peut contenir plusieurs onsets (≠ plusieurs temps). Borné par `scheduler.playWindow`
  (pas de stop murale racy, pas de débordement lookahead). ✅
- **B10** **Step→Play** : reprend au **temps suivant non joué** (jamais en arrière). ✅
- **B11** Step n'est jamais **muet** (filtre s'ouvre). ✅

## Curseur / afficheurs
- **B12** Curseur en lecture : **fluide (60 fps, rAF dédié, pas le tick 25ms)** + **calé sur
  le son ENTENDU** (latence de sortie compensée) + **monotone depuis 0** (pas de saut arrière
  au lancement) ; repli sur boucle uniquement. ✅ 👁
- **B13** Curseur en **pause/step** : figé à la bonne position (`(lastBeat+1)·beat`). 👁
- **B14** **Compteur de position** (machine à états) = **même playhead** que le son
  (`liveBeat` lit kronos, pas l'ancienne horloge). ✅
- **B15** Afficheur **bar·beat** + LEDs = même playhead (alignés). 👁 (note : ~50ms numérique
  non compensé sur le readout, imperceptible — toléré.)
- **B16** **Stop** : remet à zéro (lastBeat=-1, curseur effacé, audio coupé), depuis tout mode. ✅

## Règle d'or
Avant de committer un changement transport : **relire B1–B16** et confirmer qu'aucun n'a
régressé (les ✅ par les tests Node ; les 👁 par un smoke court si touché). Ajouter un test
pour tout comportement 👁-seul qui se fait casser une 2ᵉ fois.

Réf : `kronos/docs/CHARTER.md`, `docs/design/TEMPORAL_INTERPRETER.md`, `BACKLOG.md`.
