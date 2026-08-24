# Entrées de modulation (CV) du runtime webaudio

> ⛔ **LA COUCHE QUE CE DOCUMENT DÉCRIT EST ARCHIVÉE EN AMONT — mesuré le 2026-08-24.**
> `LIBS` ne porte plus de clé `mod`, un arbre de scène compilé n'a plus de champ
> `cvInstances`, et `@kronos/core` n'exporte plus `buildModulators` /
> `composeLeafModulations` / `renderToBreakpoints` / `evaluateCurve` — ni par sa source,
> ni par son paquet. Le catalogue `mod` a été archivé avec les modules chez BPscript
> (`885327d`, 2026-08-23) et les scènes qui déclaraient une instance de contrôle sont
> refusées à la compilation. **Aucune ligne de ce dépôt n'atteint plus la forme décrite
> ci-dessous** ; ce qui compose une courbe aujourd'hui est Kairos, à l'aplatissement.
> Le retrait de ce document appartient à l'architecte.

> ⚠️ **PÉRIMÉ (localisation code) — non réécrit dans cette passe.** Le fichier cité
> ci-dessous (`packages/core/src/dispatcher/transports/webaudio.js`, `MOD_SCALE` +
> `send()`) n'existe plus : `packages/core/src` ne contient plus que `index.js`, vide
> (husk Dispatcher éliminé [842] ; le répertoire `dispatcher/transports/` avait déjà
> disparu à une migration antérieure — la sortie audio a quitté l'hôte pour
> `runtime-audio`). `MOD_SCALE`/`_applyMod`/`setModulators` : zéro occurrence dans ce
> dépôt (`grep` négatif). Le rendu CV est aujourd'hui porté par `runtime-audio`
> (dépôt frère) via la factory `ctx.modulation.exprSource`, PASSÉE par l'hôte, jamais
> compilée par lui (`carte-reel.md` §A `setExprSource`). Le CONTENU technique
> ci-dessous (registre d'entrées §2, modèle par-note §3) n'a pas été revérifié contre
> `runtime-audio` — à confirmer avant de s'y fier ; seule la localisation/l'artefact
> `dispatcher` est corrigée ici.

> **Kanopi est la source de vérité des noms d'entrées de modulation** exposés par
> sa sortie de synthèse webaudio. Le transpileur BPScript fige ce registre et
> valide les noms écrits dans un branchement contre lui.
>
> Côté langage (BPScript), la forme CV est : une **déclaration** du modulateur
> `@cv env1 mod.adsr(attack:5, …)` (lib `mod` = mod.json — arobase obligatoire et PAS de
> deux-points, décision `hub/decisions/2026-07-29-les-formes-declaratives-de-bpscript.md`
> §2 et §8 : le deux-points poserait une propriété sur un nom existant au lieu de déclarer)
> et un **branchement** au
> point de paramètre d'une note `Bass -> C2 (cutoff: env1)`. Ici on documente ce
> que Kanopi **expose et fait** de la modulation.

## 1. Contrat de modulation (frontière) + flux

- Le modulateur (`mod.adsr` / `lfo` / `ramp`, défini en librairie) produit un **CV
  normalisé `0..1`**. BPx câble + aligne la source, **ne l'échantillonne pas**.
- **Kanopi échantillonne la courbe ET mappe `0..1` → la plage de l'entrée.** Chaque
  entrée connaît sa plage ; le modulateur reste générique.
- Flux : `cvInstances` (déclarations) → `modulatorsFromAst()` (bpx-adapter) = un
  **registre** `{ env1: {objectType, params, curve} }`, transmis au runtime de sortie
  (plus de dispatcher hôte intermédiaire, husk éliminé [842] — mécanisme de transport
  actuel non revérifié dans cette passe, cf. bandeau ci-dessus). Le **branchement**
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
