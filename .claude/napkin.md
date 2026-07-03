# Napkin — REPRISE : fix (a) same-file = mise-à-jour-vivante (voix-de-code Phase 2)

## État (commit local 30f5a31, NON poussé)
- Frontière hôte↔runtimes : thermomètre FRONTIÈRE = **0** (§Garde1-5 tous à 0). MIDI+OSC+audio+code migrées.
- Les 6 retraits voix-de-code FAITS + cliquet §1/§5 (backtickSink/attachCodeVoiceLifecycle verrouillés).
- tsc 0 err. 223/224 unitaires. **1 test rouge** : `actor-replacement.test.ts` « does NOT tear down a
  hydra voice when the SAME orchestrator re-evaluates » — hydra.stop appelé 1× (attendu 0).

## CAUSE (discriminée)
Re-éval same-file → `bpx-adapter.ts:1563-1567` `prev.kronosAudio.stop()`+`prev.dispatcher.stop()`
→ `transport.stop()` → bus émet 'stopped' → runtime-codevoices coupe la voix Hydra. Le S2 gérait ça par
« détacher le relais AVANT le stop » ; le bus (le runtime s'abonne à `bindClock`) n'a pas d'équivalent,
et Kronos n'a pas de removeAdapter.

## DÉCISION ARCHITECTE (556) — fix (a), greenlit
Une re-éval du MÊME fichier = MISE À JOUR VIVANTE (live-coding), pas une fin de scène. L'hôte NE fait PAS
transport.stop()+teardown ; il RÉUTILISE le transport + Kairos + codeVoicesRuntime et RE-CHARGE Kairos
avec la nouvelle dérivation (voix natives re-dérivent sur le transport qui TOURNE). Pas de 'stopped' émis
→ Hydra continue. Réutiliser la MACHINERIE re-random EXISTANTE (kairos.charger + bump generation + Kronos
swap, `bpx-adapter.ts:1706-1762`), pas du neuf.

## PLAN (1 fichier : bpx-adapter.ts evaluateBlock)
1. BP3Voice (694-715) : +stocker `kairos` (handle Kairos) + `codeVoicesRuntime` sur l'entrée voices.
2. Détecter same-file re-eval EARLY : `prev = voices.get(key)` ET `prev.file === src.fileId` ET orchestré
   ET prev vivant (kronosAudio running) → VOIE « mise à jour vivante ».
3. Voie vivante : NE PAS `prev.kronosAudio.stop()`/`dispatcher.stop()`. Re-charger `prev.kairos.charger(
   derived.tree, ctx)` + bump generation (comme reDeriveKairos 1732-1744) → Kronos swap les notes sur le
   transport vivant. Re-évaluer les voix de code : `prev.codeVoicesRuntime` reçoit le nouveau contenu
   (send/evaluate) — sans stop. Mettre à jour orchestration/mutedActors si besoin.
4. Sinon (fichier différent / 1re éval / mono) : chemin actuel teardown+build inchangé.
5. `kronosCursor.set(prev handle)` (réutilisé).

## GARDE DE PREUVE OBLIGATOIRE avant push (archi review par exception) — LES 5 VERTS + MONTRÉS :
1. notes natives inchangées (e2e bp3/bpscript sonnent, position calée).
2. re-random OK (rerandom.spec e2e vert).
3. arm/désarm OK (live-mute équivalent / arm e2e).
4. voix de code OK (strudel sonne via nouveau chemin).
5. continuité Hydra same-file (le test actor-replacement PASSE) + banc muet [529] CLAVIER-SEUL
   (éval .strudel autonome au clavier ⇒ son ; Stop coupe ; Pause gèle) sur contexte suspendu.
La réutilisation du handle Kairos NE DOIT PAS régresser arm/désarm/re-random/notes — c'est LE risque.
Si le périmètre explose au-delà d'1 fichier → ré-escalader.

## Puis : push + les 2 preuves écran (voix de code sonne + muet [529] clavier-seul). Clôture du chantier.
