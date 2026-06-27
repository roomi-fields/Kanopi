# Revue Kanopi 2026-06-27 — Suivi des corrections

Index de traçabilité de la revue. Détail de chaque défaut : `2026-06-27-revue-code-kanopi.md`.
Source de vérité du statut : backlog `kanopi` (`tour bl list --projet kanopi`).

**Bilan : 18 faits / 14 ouverts** (sur 31 défauts + 1 cas-bord `F03b`).
Chaque « fait » a été vérifié sur pièces par l'architecte (commit poussé sur `origin/main`, gate
vert) avant d'être marqué. Tous les correctifs sont **host-pur** (Kanopi ne résout/compose/rend rien).

---

## ✅ Faits (18)

| ID | Défaut | Commit | Comment (nature du correctif) |
|----|--------|--------|-------------------------------|
| F03 | STEP saute un temps sur deux | `6aeea6e` | Lit le `beatPosition` **compensé** du handle, plus le brut. |
| F04 | Espace traite « pause » comme stop | `a07789b` | Ternaire `playing?stop:play` ; `paused` reprend en place. |
| F05 | Unmute-all laisse une voix muette | `d1997d1` | `unmuteAll` passe par `setMuted` → `onMute` réarme la voix. |
| F06 | Fuite de tempo inter-scène | `b2dd251` | Canal `setSceneTempo` séparé ; ne sème plus `userTempo` (seed compile). |
| F07 | Tempo de scène écrêté [20,300] | `b2dd251` | `setSceneTempo` n'écrête pas (clamp = saisie user seule). |
| F08 | Socket OSC ouverte en phase produce | `b8ec113` | Montage OSC gardé derrière `!buildOnly`, comme `driver.start`. |
| F09 | `1e400`→Infinity→RangeError audio | `6a1663f` | `Number.isFinite` : le non-fini reste une chaîne, plus d'Infinity. |
| F10 | Mesure `BEATS_PER_BAR=4` inventée | `8634ec1` | Lit la facette `result.meter` (autorité BPx) ; défaut 4/4 si absent. |
| F11 | Sections `.gr` re-parsées du texte | `b9ce746` | Lecteur **AST unifié** `.gr`/`.bps` ; scan-texte (buggé) supprimé ; test verrou. |
| F13 | `writeMmDirective` ignore `@tempo` | `b66f0c7` | Réécrit `@tempo` **et** `@mm`, mot-clé préservé (zéro conversion). |
| F14 | Code mort post-KAI-10 + commentaires | `f939d8f` | `scaleSystemFromAst` + champs scène morts supprimés ; commentaires corrigés. |
| F15 | Carte acteur→transport morte (Dispatcher) | `4e499da` | ~30 lignes mortes supprimées + en-têtes trompeurs corrigés. |
| F16 | Relais `play/stop/toggle` morts (clock) | `0809935` | 3 relais sans appelant supprimés. |
| F23 | 3 méthodes broadcast quasi identiques | `04cfdea` | Factorisées en `broadcast()` — refactor **pur** (sentinelles/LED inchangées). |
| F24 | Double bornage du BPM (400 puis 300) | `1a8ee9d` | Clamp [20,400] retiré ; `setBpm` seul propriétaire du bornage. |
| F25 | `fmt2`/`fmt3` triplicés | `ee0fa0c` | Extraits dans un module partagé, sortie octet-identique. |
| F26 | Octet NUL dans `compile-cache.ts` | `29f17ac` | Séparateur échappé ; le fichier redevient du texte (diff/grep). |
| F28 | Copie `isControlTerminal` (doublon) | `b9ce746` | Supprimée avec le scan-texte mort (bundlé avec F11). |

**Connexes faits dans le chantier (hors liste des 31) :**
- Test visuel flaky du gate → `3bd6ae8` (masque le panneau console non-déterministe ; portée serrée).
- Re-baseline `starter-02` → `b342eb4` (BPM `60.0`→`—`, conséquence assumée de F06+F07, cf. ci-dessous).

---

## ⛔ Ouverts (14) — pourquoi pas fait

| ID | Défaut | Raison du non-fait |
|----|--------|--------------------|
| F01 | Stop/Pause inertes sur voix de code autonomes | **Gelé — décision Romain.** Sémantique transport + cross-repo (runtime-codevoices/kronos). Voie B recommandée : voix-code exposent un handle Kronos. |
| F02 | Éval voix-code = transport affiché « STOPPED » | **Gelé — décision Romain.** Même cause que F01 (pas de handle Kronos). Le `—` de `starter-02` EST ce symptôme. Voie B résout F01+F02 d'un coup. |
| F12 | `@tempo` non lu (`mmFromAst`) | **Amont à router.** Cause racine partielle = BPx ne route pas encore `@tempo`. Aval Romain avant de réveiller BPx. |
| F17 | Démo `dual-actors-audio.bps` en forme v0.7 (`:`) | **Amont/langage à router.** Migration `:`→`.` — touche le langage, aval Romain. |
| F18 | Démo `cv-adsr.bps` en `@mm` périmé | **Amont/langage à router.** Migration `@mm`→`@tempo` — touche le langage, aval Romain. |
| F19 | Boucle rAF du curseur jamais annulée | **Backlog perf (P3).** Host-pur, basse valeur, non lancé (budget). |
| F20 | rAF réassigne `beat` à chaque frame à l'arrêt | **Backlog perf (P3).** Idem F19. |
| F21 | `$effect` re-projette toute la production | **Backlog perf (P3).** Idem F19. |
| F22 | `publishProduction` mappe les tokens 2× | **Backlog perf (P3).** Idem F19. |
| F27 | PLAUSIBLE tap-tempo division par zéro | **À confirmer (P4).** Déclencheur incertain, non vérifié. |
| F29 | PLAUSIBLE `state.playing` = 2ᵉ projection | **À confirmer (P4).** Doublon d'autorité d'affichage, non urgent. |
| F30 | PLAUSIBLE teardown voix-code séquentiel | **À confirmer (P4).** Perf de transition, `Promise.all` à évaluer. |
| F31 | PLAUSIBLE scrub défensif CV | **Coordination Kairos.** Confirmer le contrat modulations/controls avant de toucher. |
| F03b | LED en pas-à-pas **pausé** lit K+1 | **Backlog (P4).** Cas-bord d'affichage distinct de F03, signalé honnêtement par Kanopi. |

---

## Réfutés en revue (4 — non traités, écartés volontairement)

- `kronos-cursor.svelte.ts:38` — variante de `BEATS_PER_BAR` (la vraie cause = F10).
- `bpx-adapter.ts:650` — contournement du mémoizer `compileBps` : réfuté.
- `bpx-adapter.ts:1770` — boucle de gate device séquentielle : réfuté (non bloquant).
- `kronos-audio.ts:638` — override STEP de la position Kronos : réfuté (compensation légitime).
