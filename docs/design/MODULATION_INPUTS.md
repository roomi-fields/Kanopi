# Entrées de modulation (CV) du runtime webaudio

> **Kanopi est la source de vérité des noms d'entrées de modulation** exposés par
> sa sortie de synthèse webaudio. Le transpileur BPScript fige ce registre et
> valide les noms écrits dans un branchement contre lui. À tenir aligné avec
> `packages/core/src/dispatcher/transports/webaudio.js` (`MOD_SCALE` + `send()`).
>
> Côté langage (BPScript), la forme CV est : une **déclaration** du modulateur
> `cv env1 : mod.adsr(attack:5, …)` (lib `mod` = mod.json) et un **branchement** au
> point de paramètre d'une note `Bass -> C2 (cutoff: env1)`. Ici on documente ce
> que Kanopi **expose et fait** de la modulation.

## 1. Contrat de modulation (frontière) + flux

- Le modulateur (`mod.adsr` / `lfo` / `ramp`, défini en librairie) produit un **CV
  normalisé `0..1`**. BPx câble + aligne la source, **ne l'échantillonne pas**.
- **Kanopi échantillonne la courbe ET mappe `0..1` → la plage de l'entrée.** Chaque
  entrée connaît sa plage ; le modulateur reste générique.
- Flux : `cvInstances` (déclarations) → `modulatorsFromAst()` (bpx-adapter) = un
  **registre** `{ env1: {objectType, params, curve} }`, transmis aux transports
  (`dispatcher.setModulators` → `transport.setModulators`). Le **branchement**
  `(cutoff: env1)` arrive sur la note via `leaf.controls` (`{cutoff:'env1'}`) ;
  `send()` reconnaît qu'une valeur de contrôle est un **nom de modulateur** et
  applique sa courbe (`_applyMod` → `cv-curve.js`) au paramètre de la note.

## 2. Registre des entrées (5) — figé avec BPScript

| Nom (langage) | Paramètre interne        | Plage         | Mappage `0..1` → plage      |
|---------------|--------------------------|---------------|-----------------------------|
| `cutoff`      | `BiquadFilter.frequency` | 20–20000 Hz   | `20·1000^v` (**exponentiel** — perception log) |
| `amplitude`   | `GainNode.gain`          | 0–1 (ratio)   | `v`                         |
| `resonance`   | `BiquadFilter.Q`         | 0–30 (ratio)  | `v·30`                      |
| `pitch`       | `OscillatorNode.detune`  | -1200…1200 c  | `(v·2-1)·1200`              |
| `pan`         | `StereoPanner.pan`       | -1…1          | `v·2-1`                     |

## 3. Modèle PAR-NOTE (pas de bus)

Chaque note référençant un modulateur reçoit sa propre modulation, **retriggée par
note** (ADSR par note = comportement synthé). Dans `send()`, par entrée modulée :
- `cutoff`/`resonance` → un **filtre lowpass propre à la note** ; `cutoff` automate
  sa fréquence, `resonance` son Q (le **même** filtre — pas deux en série).
- `amplitude` → un **gain de modulation** dédié, après l'enveloppe de la note.
- `pitch` → `osc.detune` de la note (cents).
- `pan` → un `StereoPanner` propre à la note.

Une valeur de contrôle **littérale** (nombre) reste un contrôle simple ; une valeur
**= nom de modulateur** (présent au registre) est un branchement. Désambiguïsation
par le type de la valeur (string-nom-de-modulateur vs littéral).

## 4. Limites connues

- Recouvrement de noms avec les contrôles **par-note** littéraux : `cutoff`(mod) ↔
  `filter`(Hz littéral), `resonance`↔`filterQ`, `amplitude`↔`vel`, `pitch`↔`detune`,
  et `pan` (les deux). Désambiguïsé par le type de valeur (cf §3).
- `pitch` mappé linéairement `0..1 → -1200..1200` (validé Romain) : un ADSR montant
  balaie -1 → +1 octave. Pour un pitch centré au repos, il faudrait un autre mappage.
- La percussion (voix à échantillon) ne reçoit pas la modulation par-note (seules
  les voix à oscillateur de `send()` la portent).

## 5. Mapping depuis les anciens contrôles

Les anciens noms de contrôle par-note correspondants (pour mémoire) : `cutoff`←`filter`,
`amplitude`←`vel`, `resonance`←`filterQ`, `pitch`←`detune`, `pan`←`pan`. Le registre
de modulation utilise les **noms de synthèse** ci-dessus (pas de rétrocompat `amp`).

## 6. Vérification

Vérifié par instrumentation des `AudioParam` (scène `env1:Bass.ENTRÉE = filter.adsr(…)`,
PROD+Play) : valeurs automatisées dans la plage attendue, mappage exact (ex. `sustain:0.8`
→ pitch 720 c ; `sustain:0.9` → pan 0.8). Protocole : `live-coding-verify`.
