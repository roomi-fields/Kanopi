# Revue Kanopi 2026-06-27 — Suivi des corrections

Index de traçabilité de la revue. Détail de chaque défaut : `2026-06-27-revue-code-kanopi.md`.
Source de vérité du statut : backlog `kanopi` (`tour bl list --projet kanopi`).

**Bilan : 16 faits / 7 bloqués (2 chantiers différés) / 9 backlog basse valeur** (31 défauts + 1 cas-bord).

> **« Fait » = conforme, pas seulement « tests verts ».** F03 et F13 avaient passé le gate mais
> violaient un principe d'architecture (Kronos possède la position ; `@mm` est obsolète et doit
> disparaître). Repérés par Romain → rouverts et rattachés à leur chantier.

---

## ✅ Faits (16)

| ID | Défaut | Commit | Comment (nature du correctif) |
|----|--------|--------|-------------------------------|
| F04 | Espace traite « pause » comme stop | `a07789b` | Route Espace vers la bonne commande ; `paused` reprend (position gardée par Kronos). |
| F05 | Unmute-all laisse une voix muette | `d1997d1` | `unmuteAll` passe par `setMuted` → `onMute` réarme la voix. |
| F06 | Fuite de tempo inter-scène | `b2dd251` | Canal `setSceneTempo` séparé ; ne sème plus la graine de compile de la scène suivante. |
| F07 | Tempo de scène écrêté [20,300] | `b2dd251` | `setSceneTempo` n'écrête pas (l'écrêtage = saisie utilisateur seule). |
| F08 | Socket OSC ouverte en phase produce | `b8ec113` | Montage OSC gardé derrière `!buildOnly`. |
| F09 | `1e400`→Infinity→RangeError audio | `6a1663f` | `Number.isFinite` : le non-fini reste une chaîne. |
| F10 | Mesure `BEATS_PER_BAR=4` inventée | `8634ec1` | Lit la facette `result.meter` (autorité BPx) ; défaut 4/4 si absent. |
| F11 | Sections `.gr` re-parsées du texte | `b9ce746` | Lecteur AST unifié `.gr`/`.bps` ; scan-texte (buggé) supprimé ; test verrou. |
| F14 | Code mort post-KAI-10 + commentaires | `f939d8f` | Champs/fonction morts supprimés ; commentaires corrigés. |
| F15 | Carte acteur→transport morte (Dispatcher) | `4e499da` | ~30 lignes mortes + en-têtes trompeurs corrigés. |
| F16 | Relais `play/stop/toggle` morts (clock) | `0809935` | 3 relais sans appelant supprimés. |
| F23 | 3 méthodes broadcast quasi identiques | `04cfdea` | Factorisées en `broadcast()` — refactor pur. |
| F24 | Double bornage du BPM (400 puis 300) | `1a8ee9d` | `setBpm` seul propriétaire du bornage. |
| F25 | `fmt2`/`fmt3` triplicés | `ee0fa0c` | Module partagé, sortie octet-identique. |
| F26 | Octet NUL dans `compile-cache.ts` | `29f17ac` | Séparateur échappé ; le fichier redevient du texte. |
| F28 | Copie `isControlTerminal` (doublon) | `b9ce746` | Supprimée avec le scan-texte (bundlé F11). |

Connexes : test visuel flaky → `3bd6ae8` ; re-baseline `starter-02` (60.0→—) → `b342eb4`.

---

## 🏗️ Chantiers différés — 7 défauts bloqués par dépendance (« on verra plus tard »)

### Chantier A — Kronos propriétaire du transport (F01, F02, F03)
**Modèle (Romain) :** Kronos POSSÈDE la machine d'état + la position (contrat `kronos-transport.md`).
Kanopi ne transmet que les boutons et ne comprend rien. Kairos n'entre pas (= écriture de l'arbre).

| ID | Défaut | Dépend de | Action conforme |
|----|--------|-----------|-----------------|
| F01 | Stop/Pause inertes sur voix de code autonomes | `KR-13` (voie B) | Voix-code exposent un handle Kronos. |
| F02 | Éval voix-code = transport « STOPPED » | `KR-13` (voie B) | Idem ; le `—` BPM de `starter-02` est ce symptôme. |
| F03 | STEP saute un temps (l'hôte calcule la position) | `KR-17` (déjà fait) | Kanopi appelle la commande `step()`, supprime l'arithmétique `+1 % n`. |

### Chantier B — Élimination de `@mm` (F12, F13, F17, F18)
**Décision (Romain, 2026-06-26 + reconfirmée) :** `@mm` obsolète → `@tempo` (`@tempo:N`, BPM absolu).
**Verrou amont :** `LAN-3` — BPScript route encore `@mm`→`_mm` (`libs.js:172`), pas `@tempo`.
**Ordre :** LAN-3 (BPScript) → hôte F12/F13 (`@tempo` seul) → démos F17/F18.

| ID | Défaut | Dépend de | Action conforme |
|----|--------|-----------|-----------------|
| F12 | `@tempo` non lu (`mmFromAst`) | `LAN-3` | Lire `@tempo` seul. |
| F13 | Réécriture directive de tempo | `LAN-3` | `@tempo` seul (retirer `@mm`) ; but UI confirmé OK. |
| F17 | Démo `dual-actors-audio.bps` en `:` | `LAN-3` | `alphabet.western transport.webaudio`. |
| F18 | Démo `cv-adsr.bps` en `@mm:138` | `LAN-3` | `@tempo:138`. |

---

## 📋 Backlog basse valeur — 9 (sans dépendance, non priorisés)

| ID | Défaut | Note |
|----|--------|------|
| F19–F22 | Perf (rAF jamais annulé, churn réactif, re-projection, double mapping) | P3, host-pur, basse valeur. |
| F27, F29, F30 | Plausibles (tap-tempo /0, double projection state, teardown séquentiel) | P4, à confirmer. |
| F31 | Scrub défensif CV | Coordination Kairos. |
| F03b | LED en pas-à-pas **pausé** lit K+1 | P4, cas-bord distinct de F03. |

---

## Réfutés en revue (4 — écartés volontairement)

- `kronos-cursor.svelte.ts:38` — variante de `BEATS_PER_BAR` (vraie cause = F10).
- `bpx-adapter.ts:650` — contournement du mémoizer `compileBps` : réfuté.
- `bpx-adapter.ts:1770` — boucle de gate device séquentielle : réfuté (non bloquant).
- `kronos-audio.ts:638` — override STEP de la position Kronos : réfuté (compensation légitime).
