# Phase 0 — Audit Csound

Canonique au 2026-04-24. Pré-requis à l'implémentation `.csd` en phase 2.7.
Procédure : cf `feedback_language_integration_procedure` (Phase 0 audit →
Phase 1 gap → Phase 2 plan → Phase 3 implementation).

Csound est le **premier langage Kanopi Niveau 2 avec CM6 upstream
intégrable** — case (a) d'ADAPTER_SPEC §B, à l'inverse de Mercury. Le
principe 7 « intégration max, pas de réécriture » se vérifie ici aussi
côté éditeur, pas seulement côté moteur.

---

## Contexte : qu'est-ce que Csound exprime

Csound est un environnement de synthèse et composition audio créé par
Barry Vercoe au MIT (1986). Orienté **DSP académique** : granulaire,
additif, physical modeling, spectral, FOF, waveguides — tout
l'éventail classique de la synthèse numérique est codable directement.

Deux dialectes s'entrelacent dans un fichier `.csd` :

- **orchestra (`<CsInstruments>`)** — définit les **instruments** comme
  des graphes DSP. Chaque `instr N` déclare signaux, opcodes, enveloppes,
  routing vers la sortie.
- **score (`<CsScore>`)** — liste les **événements temporels** :
  `i 1 0 2 440` joue l'instrument 1, à `t=0`, durée 2 sec, p4=440.

Le `.csd` packaged ensemble l'orchestra + le score + options (`<CsOptions>`).

Cible d'audience : musique expérimentale, recherche académique, éducation
DSP, sound design cinéma, installations génératives. La surface
opcodes est massive (~1700 opcodes) — aucun langage live-coding n'a
cette profondeur DSP.

**Positionnement Kanopi** : différenciation sérieuse vs Flok (qui ne
ship pas Csound). Audience teaching + recherche DSP non-couverte par
Strudel/Hydra/Mercury/p5.

---

## Écosystème upstream Csound

| Asset                       | État upstream                           | Cas ADAPTER_SPEC |
| --------------------------- | --------------------------------------- | ---------------- |
| Runtime WASM (`@csound/browser` 7.0.0-beta31) | 🟢 actif, async API propre | —                |
| CM6 editor pkg (`@hlolli/codemirror-lang-csound` 1.0.0-alpha10) | 🟢 existe | **(a)**          |
| Web-IDE officiel (`csound/web-ide` → ide.csound.com) | 🟢 utilise CM6 + le pkg ci-dessus | —   |
| Live coding user-code lib (`kunstmusik/csound-live-code`) | 🟢 actif  | —                |
| Opcode docs                 | Canoniques sur `csound.com/docs/manual` | —                |

Distinction majeure avec Mercury : le mainteneur a fait l'effort de
publier un package CM6 autonome. Cela ramène Csound en **zone (a)** :
intégration directe, pas de vendoring, pas d'effort Lezer custom.

---

## Audit par zone

### A. Runtime engine — 🟢 câblage propre

API `@csound/browser` (instance-mode async) :

```ts
const cs = await Csound({
  audioContext,   // optionnel — partage possible
  useWorker,      // true par défaut (SharedArrayBuffer)
  autoConnect     // true par défaut → connects to ctx.destination
});

await cs.compileCsdText(csdString);   // compile un .csd complet
await cs.compileOrc(orcString);       // compile une orchestra string
await cs.evalCode(orcString);         // live eval (incrémental)
await cs.readScore(scoreString);      // inject score events
await cs.start();                     // démarre le rendering
await cs.setControlChannel('bpm', 120);

cs.on('message', (log) => { ... });   // runtime events
cs.on('play' | 'stop' | 'renderStarted' | ...);

await cs.stop();
await cs.destroy();
```

**Observations** :

- Tout est **async** (promesses). L'adapter `evaluate()` sera `await`-heavy.
- Le *live coding* canonique (cf `csound-live-code`) = **boot once +
  evalCode incrémental**, pas recompile-tout-à-chaque-fois.
- `useWorker` true utilise un Worker + SharedArrayBuffer → Vite doit
  exposer COOP/COEP headers en dev. À vérifier au test.

**Décision A** : adapter instance-mode avec lazy `ensure()` (pattern
Mercury/Hydra). `useWorker: true` par défaut (pré-régle upstream).
Premier Ctrl+Enter → `compileCsdText + start`. Subsequents → recompile
complet du fichier (`compileCsdText` ré-exécutée fonctionne ; Csound
redéfinit les instruments).

*Live eval incrémental bloc-par-bloc parqué en v2* — demande extraction
`<CsInstruments>` vs `<CsScore>` et un state flag "déjà started".
Trade-off v1 : re-compile complet a quelques ms de latence, mais reste
en temps réel grâce au worker. Zero complexité.

### B. Native editor UX — 🟢 case (a) d'ADAPTER_SPEC §B

`@hlolli/codemirror-lang-csound` 1.0.0-alpha10 ship :

- Lezer grammar pour la syntaxe Csound orchestra + score
- Autocomplete sur les opcodes (les ~1700 builtins)
- Syntax highlight via tags Lezer standards (`t.keyword`, `t.function`,
  `t.number`, `t.comment`) → **colorimétrie Kanopi uniforme** (principe 5)

**Décision B** : intégrer `csound()` de `@hlolli/codemirror-lang-csound`
dans `lang-resolver.ts`. Même pattern que `javascript()` pour Hydra/p5/js.
Alpha package, mais endossée par le web-IDE officiel — risque faible.

### C. Event surface — 🟢 philosophie 2 trivialement OK

Csound n'a **pas de hook cross-runtime upstream** (pas de `visual()` à
la Mercury, pas de hydra/p5canvas option au constructor). Philosophie 2
(KANOPI_PRINCIPLES §3 corollaire) est respectée sans effort d'adapter.

Events utilisables :

- `on('message', (m) => ...)` — logs runtime + erreurs au fil de l'eau
- `on('play' | 'stop' | ...)` — lifecycle pour `KanopiEvent` bus
- `setControlChannel(name, value)` — rail pour le transport BPM plus
  tard (si un .csd déclare `gkBpm = chnget "bpm"`, on peut piloter
  depuis le transport central). **Parké en v2.**

**Décision C** : adapter émet `KanopiEvent` `eval` / `stop` sur le bus
local. Pas de setBpm en v1 — Csound n'a pas de BPM natif, la convention
`chnget "bpm"` est user-side. Le backlog : documenter la convention
dans un snippet « csound transport-synced ».

### D. Library integration — 🟡 à définir

Deux sources upstream intéressantes :

- `kunstmusik/csound-live-code` — `livecode.orc` ~30 instruments prêts
  (Sub1-5, BD/SD/HH, FM1, Plk, Bass…). Licensed MIT. Natural fit pour
  un starter « csound live-coding ».
- `csound-samples` / `csound-haskell` user-land patch collections.

**Décision D** : v1 minimal — 2-3 snippets dans la catégorie `visuals`
actuelle (sera renommée `patches` quand un 3e langage non-visuel y
atterrit — cf ADAPTER_SPEC §LIBRARY_SPEC futur). Sample banks Csound →
v2+.

### E. Error handling — 🟢 via event + return code

```ts
const result = await cs.compileCsdText(csd);  // number (0 = ok, <0 = err)
cs.on('message', (msg) => { /* runtime messages */ });
```

**Décision E** : l'adapter check le code retour ; si `< 0`, throw une
erreur lisible. Messages runtime bridged dans la Console panel via
`log({ runtime: 'csound', ... })`. Pas de flood à craindre (Csound
n'émet pas en rAF).

### F. Lifecycle — 🟡 plus riche que les autres

Contrairement à Strudel/Hydra (une instance mutable), Csound a un
lifecycle :

| Étape   | Appel                               | Kanopi projeté                    |
| ------- | ----------------------------------- | --------------------------------- |
| Init    | `await Csound({...})`               | dans `ensure()` lazy              |
| Compile | `await cs.compileCsdText(csd)`      | dans `evaluate()`                 |
| Start   | `await cs.start()`                  | dans `evaluate()` (idempotent)    |
| Re-eval | `cs.compileCsdText(...)` à nouveau  | dans `evaluate()` — stateless     |
| Stop    | `await cs.stop()`                   | dans `stop()`                     |
| Dispose | `await cs.destroy()`                | dans `dispose()`                  |

**Décision F** : un flag `started: boolean` dans le module scope.
Première evaluate → start(). Suivantes → juste recompile. `stop()` ne
détruit pas l'instance — `silence`-style, `dispose()` fait le cleanup
complet.

---

## Résumé gaps (priorisé)

| # | Gap                                                    | Zone | Effort | Impact UX          |
| - | ------------------------------------------------------ | ---- | ------ | ------------------ |
| 1 | Adapter `.csd` minimal (ensure + compileCsdText + start + stop) | A    | 1j     | Base               |
| 2 | CM6 language via `@hlolli/codemirror-lang-csound`     | B    | 30min  | Highlight + opcode autocomplete |
| 3 | Extension recognition `.csd` + whole-file block extract | A    | 30min  | Ctrl+Enter         |
| 4 | Session parser allowlist ajoute `csound`              | —    | 15min  | `@actor foo foo.csd csound` valide |
| 5 | Error handling return code + message event bridge     | E    | 1h     | Cohérence UX       |
| 6 | Starter workspace « csound intro »                    | —    | 1h     | Discoverability    |
| 7 | 2-3 snippets Library (kunstmusik instruments)         | D    | 1h     | Onboarding         |
| 8 | Dev server COOP/COEP pour SharedArrayBuffer (si useWorker) | A | 30min  | Runtime actif      |
| 9 | setBpm via `setControlChannel('bpm', ...)` + doc convention | C | parké  | v2+                |
| 10 | AudioContext partagé Strudel↔Csound                  | A    | parké  | même racine Mercury #7, Hydra #3 |
| 11 | Live eval incrémental (block-by-block)                | A    | 0.5j   | **phase 2.7 étape B** — re-compile tout en étape A d'abord |
| 12 | `.orc` + `.sco` séparés (en plus de `.csd`)           | —    | parké  | v2                |
| 13 | Sample banks Csound (ftable from JSON)                | D    | parké  | v2                |

**Phase 2.7 scope en deux étapes** :

- **Étape A (commit 1)** : items #1-8 avec re-compile complet (adapter idempotent, base éprouvée). ~1j.
- **Étape B (commit 2, immédiatement après A)** : item #11 — extension vers eval incrémental (boot once + evalCode pour orc / readScore pour score events). Détection heuristique du type de bloc. ~0.5j.

**Rationale du découpage** : l'étape A garantit un adapter fonctionnel avant de toucher au live coding idiomatique Csound. Si l'étape B introduit un bug subtil (parsing, state), l'étape A reste un fallback commit-distant. Le user a dit : « incremental est indispensable pour un véritable usage, on peut passer par une première phase de recompile complet si ça permet de sécuriser un dev par étapes ».

Items #9, #10, #12, #13 parqués.

---

## Décision de scope (2026-04-24)

Csound est **cas (a)** d'ADAPTER_SPEC §B (CM6 upstream existe →
intégrer directement, zéro effort custom). Contrairement à Mercury qui
démontrait la philosophie 2 en context réduit, Csound démontre l'autre
moitié du principe 7 : **l'éditeur entier peut venir d'upstream**
quand il est disponible. Colorimétrie uniforme (principe 5) vient
gratuitement via les tags Lezer.

**Philosophie 2** : trivialement OK, Csound n'a pas de hook
cross-runtime upstream à désactiver.

**Risques techniques** :

- Bundle WASM ~3-4 MB → lazy load dans `ensure()`, pas de poids au
  boot Kanopi. À mesurer une fois installé.
- SharedArrayBuffer requiert COOP/COEP → fallback `useWorker: false`
  si headers absents. À tester.
- Package `@hlolli/codemirror-lang-csound` en alpha → suivre
  `package.json` peer-deps attentivement.

**Cas de démonstration** : Csound est le premier langage avec CM6
upstream. Intégrer Csound valide que le pattern « fallback generic JS
highlighting » de Mercury (case b) est bien une **dégradation assumée**
et non la règle.

En phase 2.7 : livrer items #1-8. Tout le reste au backlog v2.

---

## Livrables Phase 2 (plan 2.7 Csound)

- Adapter `csound.ts` (instance mode async, compileCsdText, start flag,
  message event bridge)
- Extension `.csd` (déclarée dans `extensions: ['.csd']` — registry
  dérive le reste)
- CM6 intégration dans `lang-resolver.ts` (`case 'csound'` →
  `csound()` de `@hlolli/codemirror-lang-csound`)
- Session parser allowlist : +`csound`
- COOP/COEP headers dans `vite.config.ts` (si nécessaire pour Worker)
- Starter workspace « csound intro » (beep sur Ctrl+Enter)
- 2-3 snippets Library (un kick drum, un FM lead, une nappe)
- Procédure de test manuelle pour Phase 3

## Livrables Phase 3 (implementation)

Par ordre :

1. Install `@csound/browser` + `@hlolli/codemirror-lang-csound`
2. Adapter + registry wiring → commit
3. CM6 language + session parser + block extraction
4. Starter + snippets Library
5. Vite COOP/COEP si nécessaire
6. Test procedure live-coding-verify

---

## Block extraction (ADAPTER_SPEC §5.3)

- **Méthode** : **AST upstream** (premier cas Kanopi).
- **Parser utilisé** : `csdLanguage.parser` de
  `@hlolli/codemirror-lang-csound`, le même qui donne syntax highlight
  + autocomplete dans l'éditeur. Zéro duplication.
- **Nœuds Lezer traversés** :
  - `InstrumentDeclaration` → bloc `instr N … endin`, nommé
    `instr N` dans le panneau Actors (extraction triviale du numéro
    via `/instr\s+(\S+)/` — identifiant, pas grammaire).
  - `UdoDeclaration` → bloc `opcode name … endop`, nommé `opcode name`.
  - `XmlCsScoreOpen` / `XmlCsScoreClose` → délimitent la zone
    `<CsScore>`. Chaque ligne non-vide non-commentée à l'intérieur est
    un bloc isolé (un score event). Le split par ligne à l'intérieur
    de la zone AST-délimitée n'est pas du grammar-matching.
- **Limites connues** :
  - La grammaire Lezer upstream est en alpha (`1.0.0-alpha10`). Un
    fichier CSD syntaxiquement cassé peut produire un arbre avec des
    nœuds d'erreur qu'on ignore — l'user voit alors zéro bloc et
    Ctrl+Enter tombe sur le fallback paragraphe.
  - Le préambule (`sr = …`, `ksmps = …`) n'est pas un bloc isolable.
    Ctrl+Enter dessus retombe sur l'extraction paragraphe (comme pour
    tout autre langage non-structurel dans cette zone).
- **Critère de migration** : si la grammaire upstream casse ou
  régresse, on peut temporairement basculer en regex fragile comme SC,
  mais ce serait la dernière option.

---

## Dispatch d'eval (étape B)

Le texte extrait par l'AST est passé à `csound.ts`, qui décide quel
appel upstream utiliser selon un **switch simple** sur le premier
token :

| Premier token dans le bloc extrait   | Appel upstream                    |
| ------------------------------------ | --------------------------------- |
| `<CsoundSynthesizer>` (fichier entier) | `compileCSD(code, 1)` + `start()` si pas encore booté |
| `instr N` / `opcode name`            | `compileOrc(block)` — redéfinit à chaud dans la perf. running |
| `i N …`, `f N …`, `e`, `s`, etc.     | `readScore(line)` — événement de score |
| autre                                | `compileOrc(block)` fallback      |

Ce switch n'est **pas** un parser — c'est une redirection sur un
premier identifiant dont le rôle a déjà été garanti par l'extraction
AST. La grammaire Csound reste upstream, Kanopi ne la réimplémente à
aucun niveau.

### Note : `compileOrc` vs `evalCode`

Csound expose deux appels pour « compiler un fragment d'orchestra » :

- `compileOrc(str)` — parse + compile + **ajoute** à la performance
  en cours. C'est l'appel live-coding idiomatique (workflow
  `kunstmusik/csound-live-code`).
- `evalCode(str)` — parse + compile mais n'ajoute **pas** à la
  performance. Utile pour valider du code sans l'exécuter.

Kanopi utilise `compileOrc` pour l'étape B. `evalCode` avait été
utilisée en premier jet mais ne redéfinissait pas l'instrument en
pratique (le code passait la validation mais n'était pas appliqué).

---

## Historique de révision

- **2026-04-24** : audit initial. Csound est le 2ème langage audit
  formel (post-Mercury). Première démonstration d'un Niveau 2 en case
  (a) d'ADAPTER_SPEC §B — CM6 upstream intégrable. Décision de scope
  v1 = re-compile tout à chaque eval (vs incrémental en v2) pour
  simplicité maximale.
- **2026-04-24 (étape B)** : basculement en eval incrémental. Premier
  langage Kanopi utilisant l'AST Lezer upstream pour l'extraction des
  blocs — valide la policy `ADAPTER_SPEC §5.3`. Dispatch adapter
  (compileCSD / evalCode / readScore) par switch sur premier token
  après extraction AST, pas de grammar-matching secondaire.
