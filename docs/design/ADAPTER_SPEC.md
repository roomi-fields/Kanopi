# Kanopi — RuntimeAdapter spec

Contrat qu'un langage/runtime doit implémenter pour vivre dans Kanopi.
Chaque adapter est **une couche de glue** entre trois composants upstream
(moteur d'exécution, module éditeur, ressources) et le hub Kanopi (transport,
bus d'événements, bridge).

> **Principe fondateur** : un adapter *n'implémente* rien. Il compose. Si
> vous écrivez plus de 100 lignes de logique métier dans un adapter, c'est
> probablement que vous réimplémentez ce qui existe déjà upstream. Voir
> `KANOPI_PRINCIPLES.md §7`.

## 0 · Périmètre : adapter de langage ≠ transport de sortie

Deux familles d'extension coexistent dans Kanopi, et elles ne suivent **pas**
le même contrat :

| Famille | Contrat | Où ça vit | Exemples |
| --- | --- | --- | --- |
| **Adapter de langage** | `RuntimeAdapter` (cette spec) | `packages/ui/src/lib/runtimes/` (in-repo) | Strudel, Hydra, Mercury, p5, Csound |
| **Transport de sortie** | transport du dispatcher | `packages/core/src/dispatcher/transports/` | WebAudio, MIDI, OSC, DMX |

Un adapter de langage est de la **glue vers un moteur amont** : il n'est
vérifiable qu'en lançant Kanopi entier (éditeur + transport + e2e), n'a
qu'un seul consommateur (cette app) et pas d'oracle externe. Il vit donc
dans ce dépôt, et s'ajoute via la procédure du §5.

Un transport de sortie consomme les événements résolus du dispatcher
(contrôles déjà interprétés — vel, chan, transpose, etc.) et les émet vers
une cible matérielle ou logicielle. Il a sa propre méthode de validation et
peut être maintenu comme un chantier séparé. **Il n'implémente pas
`RuntimeAdapter`** ; sa frontière est la signature des transports du
dispatcher. Règle commune aux deux familles : le dispatcher est le seul
interpréteur des contrôles — un transport ne relit jamais la charge brute.

---

## 1 · Interface TypeScript

Source : `packages/ui/src/lib/runtimes/adapter.ts`

```ts
export interface RuntimeAdapter {
  readonly id: Runtime;
  readonly extensions: readonly string[];     // ['.hydra'], ['.p5'], …
  readonly outputType: VoiceOutputType;        // OBLIGATOIRE — voir §1bis (b)
  evaluate(code: string, src: EvalSource, log: LogPush): Promise<void>;
  stop(src: EvalSource, log: LogPush): Promise<void>;
  setBpm?(bpm: number, log: LogPush): void;
  onBeat?(count: number, log: LogPush): void;
  onBar?(count: number, log: LogPush): void;
  readonly events?: EventBus;
  dispose(): Promise<void>;
}

// Ce que la voix PRODUIT (≠ DeviceType, ce que l'appareil ACCEPTE — DEVICES_SPEC).
export type VoiceOutputType =
  | 'notes'   // événements de hauteur (→ midi / audio)
  | 'signal'  // signal audio brut, sans hauteur discrète (→ audio)
  | 'visual'  // pixels / canvas / vidéo (→ video)
  | 'control' // CC / messages de contrôle (→ osc)
  | 'light'   // intensités / couleurs (→ dmx)
  | 'text';   // symboles à lire (→ text / console)

export type EvalSource = {
  actorId?: string;
  fileId: string;
  docOffset?: number;
};

export type LogPush = (e: {
  runtime: Runtime;
  level: 'info' | 'warn' | 'error';
  msg: string;
}) => void;
```

Un adapter minimal implémente `id`, `extensions`, `evaluate`, `stop`,
`dispose`. Tout le reste est optionnel mais recommandé.

**`extensions`** est la source de vérité pour les formats de fichier
revendiqués par l'adapter. Le registry dérive automatiquement la liste
globale (`knownExtensions()`) et le lookup `extension → runtime`. Ajouter
un nouveau langage signifie : (1) déclarer `extensions: ['.<ext>']` sur
l'adapter, (2) l'inscrire dans le registry. Rien d'autre à toucher — la
boîte de dialogue « + New file », `runtimeFromExt`, le tab icon, etc.
consomment la liste dérivée.

---

## 1bis · Contrat de sortie (OBLIGATOIRE)

> Cadrage 2 (architecte/Romain, 2026-06-15). Prérequis du lot 4 cross-runtime
> (migration `.kanopi → .bps`). Tout langage encapsulé DOIT honorer ces deux
> clauses. Référence amont : `BPscript/docs/design/ACTOR.md §2-3`.

Un langage encapsulé (Strudel, Hydra, Tidal, …) n'est PAS rendu « en place » de
façon opaque par son moteur natif : sa sortie est **captée à l'interprétation**,
puis **placée dans le temps par le dispatcher** vers le `transport` (appareil) de
la voix. « Le code est toujours transporté. » Deux clauses en découlent.

### (a) Comment j'expose ma sortie pour transport (capture)

L'adapter DOIT exposer un point de capture de sa sortie — il ne se contente pas de
faire jouer son moteur. Selon la nature du moteur :

- **Sortie événementielle** (notes/contrôles datés) : l'adapter fournit les
  événements résolus au dispatcher (comme bp3 : tokens horodatés), qui les place
  vers le transport. C'est la voie « native Kanopi ».
- **Sortie continue / moteur autonome** (Strudel cyclist, Hydra rAF, canvas) :
  l'adapter expose un **hook de capture** (callback / flux) que le dispatcher lit
  — pas un rendu direct au matériel. Le moteur ne s'adresse JAMAIS directement à
  l'appareil : il passe par la capture → dispatcher → transport.

Cette clause est la contrepartie adapter du mécanisme **capture-pour-retransport**
(backlog B4). Tant qu'un moteur ne sait que se rendre lui-même de façon opaque,
il n'est **pas** routable vers un `transport` arbitraire (limite à documenter dans
sa fiche d'adapter, pas à masquer).

### (b) Le type de ma sortie (compatibilité voix ↔ appareil)

L'adapter DÉCLARE son `outputType: VoiceOutputType` (§1). C'est ce que la **voix
produit** — distinct du `DeviceType` que l'**appareil accepte** (`DEVICES_SPEC.md`).
Le dispatcher **vérifie la compatibilité avant de router** : une voix dont
l'`outputType` n'est pas accepté par l'appareil ciblé est **refusée** à l'éval
(erreur claire), jamais silencieusement ignorée.

Exemple : une voix Tidal (`outputType: 'notes'`) routée vers `transport.lumieres`
(appareil `type: 'dmx'`, accepte `light`) → **refus** (`notes` ∉ `{light}`). La
table de compatibilité fait foi côté `DEVICES_SPEC.md §3`.

> Pour la bêta, les adapters existants déclarent : Strudel/Tidal/Mercury/Csound →
> `notes` ou `signal` ; Hydra/p5 → `visual` ; bp3/bpscript → `notes` (et `text`
> pour les grammaires non-sonnantes, cf. routage par-symbole).

---

## 2 · Les six zones d'intégration

Historiquement, « intégrer un langage » était réduit à « intégrer son
moteur audio ». Retour d'expérience phase 2.1 (Strudel) : c'est insuffisant.
Un adapter couvre **six surfaces** distinctes. Un audit Phase 0 doit
inventorier les six pour chaque langage avant implémentation.

### A. Runtime engine

Le moteur d'exécution audio du langage. Entrée : code source. Sortie :
son. Consommé par `evaluate(code, src, log)`.

Responsabilités de l'adapter :

- Charger dynamiquement le moteur au premier `evaluate` (import paresseux,
  pas au boot).
- Router `src.actorId` / `src.fileId` vers le mécanisme de multi-pattern
  du moteur (ex: Strudel `$: p1; $: p2;`, Tidal `d1 $ ...; d2 $ ...`).
- Convertir les erreurs runtime du moteur en `throw` — le hub attend une
  Promise qui reject, pas un log silencieux.
- Respecter `src.docOffset` pour que les coordonnées de visualisation
  remappent vers la position dans le buffer source.

Exemples :

| Langage      | Moteur upstream                         | Import                            |
| ------------ | --------------------------------------- | --------------------------------- |
| Strudel      | `@strudel/web` (inlined full stack)     | `await import('@strudel/web')`    |
| Tidal (nav)  | Strudel avec préfixe TidalCycles (mini) | reuse `strudelAdapter`            |
| Tidal (GHCi) | `osc-bridge` → SuperDirt                | WebSocket (plus tard, Tauri v2)   |
| Hydra        | `hydra-synth`                           | `await import('hydra-synth')`     |
| Mercury      | `mercury-engine` (Tone.js inside)       | `await import('mercury-engine')`  |
| p5           | `p5` (instance mode)                    | `await import('p5')`              |
| Csound       | `@csound/browser` (Csound 7 WASM)       | `await import('@csound/browser')` |
| SC           | `scsynth` WASM ou osc-bridge            | à déterminer                      |
| JS           | `AudioContext` natif                    | `new AudioContext()`              |

### B. Native editor UX

**zone a ne pas oubliée.** Le module éditeur officiel du
langage, qui fournit : syntax highlight, autocomplete, widgets inline,
tooltips, mini-notation, shortcuts, squiggles.

Ne vit **pas** dans l'interface `RuntimeAdapter` — vit dans les
extensions CodeMirror 6 appliquées au buffer selon son runtime
(cf `packages/ui/src/components/editor/CMEditor.svelte`).

Responsabilités :

- Installer les extensions CM6 upstream au mount de l'éditeur
  (`widgetPlugin`, `highlightExtension`, `autocompleteExtension`, …).
- Router les sorties de ces extensions vers le runtime adapter quand
  nécessaire (ex: widget inline Strudel → canvas enregistré côté `He`
  via le bridge `_X` function-reference).
- Respecter la colorimétrie uniformisée du hub (`kanopiHighlight`,
  `KANOPI_PRINCIPLES §5`) plutôt que le thème du module upstream.

Checklist UX native à auditer avant intégration (Phase 0) :

- [ ] Syntax highlight contextuel
- [ ] Autocomplete + tooltips (signatures, docs, exemples)
- [ ] Squiggles erreurs inline
- [ ] Widgets inline (si le langage en a : Strudel `._pianoroll()`, …)
- [ ] Mini-notation / syntaxe DSL interne (si applicable)
- [ ] Shortcuts éditeur spécifiques (Tab, Alt-slider, Shift-Enter, …)
- [ ] Format on save (si un formatter officiel existe)

Pour chaque case cochée, l'adapter utilise **le module upstream**, pas
une réécriture.

#### Politique d'intégration par cas (2026-04-23)

Upstream n'expose pas toujours un module CM6 prêt à installer. Deux cas :

| Cas                                                                 | Exemple        | Action                                                              |
| ------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------- |
| **(a) Un module CM6 upstream existe** (packagé npm, extensions prêtes) | Strudel → `@strudel/codemirror` | L'intégrer tel quel dans phase 2.4 (glue minimale, cohérent principe 7). |
| **(b) Pas de module CM6 upstream**, seulement données brutes (JSON / JS de ref) | Hydra → `hydra-functions`, SC → `scdoc` | **Backlog.** La phase 2.4 se limite alors à A/C/D/E/F + highlight JS générique. Les extensions CM6 custom (autocomplete, tooltips, squiggles langue-spécifiques) attendent une itération séparée. |

Raison : construire nous-mêmes une extension CM6 par langage casse le
budget phase 2.4 (2-4j par langage) et retarde la cible validation du
concept (4 langages tournent). Mieux vaut **matcher l'état de l'art**
(Flok se contente aussi du highlight JS générique pour Hydra/SC) puis
ajouter le bonus Kanopi en phase ultérieure.

À chaque nouveau langage, le Phase 0 audit doit expliciter dans quel cas
on est (a/b) dès la zone B.

### C. Event surface

L'adapter peut exposer un `EventBus` optionnel (`adapter.events`). Le hub
relaie `onAny` dans `core.events` au registre, pour que les
visualiseurs consomment un stream unifié.

Événements canoniques (voir `EVENTS.md` pour la spec complète) :

| Type        | Émis quand                                      |
| ----------- | ----------------------------------------------- |
| `trigger`   | événement lifecycle ponctuel (eval, stop)       |
| `token`     | note jouée / événement musical                  |
| `beat`      | tick de mesure (hub-émis, pas par les adapters) |
| `transport` | play/stop global (hub-émis)                     |
| `flag`      | valeur scalaire nommée (cf contrôleurs MIDI)    |

Les adapters émettent surtout `trigger` (à l'`evaluate`, au `stop`, aux
erreurs) et `token` (à chaque note jouée, si le runtime expose un hook
d'onset — Strudel via `logHap`, Hydra via `.out()` callback).

Un adapter sans `events` fonctionne — le hub ne reçoit simplement rien
du runtime, donc pas de mini-notation highlight, pas de viz onset-driven.

### D. Library integration

Consommation d'assets (samples audio, images, presets) fournis par la
Library Kanopi (cf `LIBRARY_SPEC.md`).

Conventions actuelles :

- Strudel : `samples()` configuré au prebake, respecte la directive
  `@library <banque>` émise par le parser `.kanopi`.
- Hydra : les images passent via `s0.initImage(url)` puis `src(s0)`.
- JS/WebAudio : `fetch` + `decodeAudioData`.

Un adapter peut exposer une fonction `configureLibrary(catalog)` optionnelle
si son runtime a besoin d'un prebake asynchrone. À formaliser si plus d'un
adapter en a besoin.

### E. Error handling

Les erreurs du runtime doivent remonter au hub via deux canaux :

1. `throw` depuis `evaluate()` — déclenche le flash rouge sur le bloc
   évalué (cf `CMEditor.svelte:runEval`).
2. `log({ level: 'error', msg })` — affiche dans le Console panel.

Pour les erreurs asynchrones (post-eval, pendant la lecture), l'adapter
maintient un état interne de « last error » et le consulte à chaque
`evaluate` suivant pour décider si le flash rouge doit persister.

Exemple Strudel : le wrapper IIFE par slot attrape les ReferenceError et
les stocke dans `slotErrors` keyed par `slotId`, ce qui permet au panel
Actors d'allumer un LED rouge par bloc sans masquer les autres patterns
actifs.

### F. Lifecycle

- `evaluate` : peut être appelé N fois pour le même `src` (re-eval).
  L'adapter remplace l'exécution précédente, n'accumule pas.
- `stop(src)` : arrête uniquement ce `src`. Si `src.actorId === undefined`
  et `src.fileId === '__hush__'`, arrête tout (Ctrl+. global).
- `dispose()` : tear-down complet, libère les AudioContexts, les
  animations rAF, les listeners. Appelé une seule fois à la fin de vie
  de l'adapter (rare en pratique, sauf HMR).

Le hub appelle `registerAdapter(adapter)` au boot. L'adapter n'a pas à
connaître le hub — il reçoit `log` et son propre `events`, et c'est tout.

---

## 3 · Modèle de slots

Kanopi exécute plusieurs blocs simultanément via un système de slots
identifiés par la paire `(actorId, fileId)` :

- `actorId` présent → Ctrl+Enter sur un bloc nommé dans `.kanopi`.
- `actorId` absent, `fileId` présent → Ctrl+Enter sur un bloc positionnel
  d'un fichier langage.
- `fileId === '__hush__'` → signal de hush global (tous slots).

Le slot key recommandé (utilisé par Strudel) : `src.actorId ?? src.fileId`.

Les runtimes qui ne supportent pas nativement le multi-slot (cas rare) :
l'adapter maintient un `Map<slotId, state>` interne et recombine à chaque
eval (cf `strudel.ts:buildComposite()` qui concatène les slots en IIFEs
préfixés `$:`).

`docOffset` indique la position du bloc évalué dans le buffer source. Si
le runtime émet des coordonnées (pour viz / highlight), l'adapter les
remappe en les décalant de `docOffset`. Sans ça, les visualisations
pointent vers le début du doc au lieu du bloc armé.

---

## 4 · Exemples d'implémentation

### Minimal (JS/WebAudio, 67 lignes)

Exécute du JS brut dans un `new Function()` avec `audio` et `helpers`
comme paramètres. Pas d'UX native (JS n'a pas de module éditeur
spécifique). Pas d'events de notes, juste `trigger eval/stop`. Voir
`packages/ui/src/lib/runtimes/webaudio.ts`.

### Moyen (Hydra, 81 lignes)

Lazy-load `hydra-synth`, monte un canvas, expose les globals
(`osc`, `out`, …) via `makeGlobal: true`, exécute le code dans un
`new Function()`. `stop` rappelle `solid(0,0,0,0).out()` pour éteindre
le visuel. Voir `packages/ui/src/lib/runtimes/hydra.ts`.

### Moyens-bis (Mercury 124 lignes, Csound 177, p5 247)

Trois variations du même squelette : lazy-load du moteur amont, instance
unique, eval whole-file, événements `trigger`. Spécificités :

- **Mercury** : l'amont expose `code()/silence()/setBPM()` — l'adapter ne
  fait que router. Les hooks visuels cross-runtime de l'amont (`visual()`)
  sont volontairement non câblés (no-op + log one-shot), cf
  `KANOPI_PRINCIPLES §3`.
- **Csound** : boot `{ useSAB: false }`, `compileCSD` pour un document
  complet, `compileOrc` pour la redéfinition live d'instruments, reset
  complet de l'engine au hush (un stop Csound ne survit pas proprement).
- **p5** : instance mode strict (pas de `makeGlobal`), les callbacks
  (`setup`, `draw`, …) sont capturés depuis la closure d'eval puis montés
  sur l'instance — le user garde le style p5 Web Editor.

### Complexe (Strudel, 879 lignes)

Le cas le plus chargé à ce jour, car Strudel cumule :

- Multi-slot composite (wrap IIFE par slot pour isolation d'erreurs)
- Remap d'offsets composite ↔ source pour visualisations
- Bridge des méthodes `._X` de `@strudel/codemirror` vers `@strudel/web`
  (function-reference, pas de réimpl)
- Drawer `@strudel/draw` pour les viz `onPaint`
- Hook `highlightMiniLocations` pour le pattern highlight
- Event bus interne relayant `logHap` en `token`
- Tidal adapter = Strudel adapter avec `id: 'tidal'`

Voir `packages/ui/src/lib/runtimes/strudel.ts`. Malgré les 879 lignes,
aucune logique métier du parser Strudel n'est dupliquée — tout est glue.

---

## 5 · Checklist pour un nouveau langage

### 5.1 · Phases (avant d'écrire une seule ligne de code)

- [ ] **Phase 0 audit** : `docs/integrations/<LANG>.md` — inventorier les
      6 zones d'intégration. Identifier les composants upstream
      (moteur, module éditeur, samples, docs autocomplete). Lister les
      features UX natives du langage que l'user doit retrouver (cf
      principe 2).
- [ ] **Phase 1 gap** : pour chaque case de la checklist B, valider qu'un
      module upstream couvre le besoin. Si aucun module ne couvre : PR
      upstream pour ajouter, ou feature différée (jamais réécrite).
- [ ] **Phase 2 plan** : doc de plan d'implémentation, revu avant code.
- [ ] **Phase 3 implementation** : l'adapter, puis visual verify
      (`live-coding-verify`), puis commit.

Cette procédure est explicitée dans
`~/.claude/projects/-home-romi-dev-music-kanopi/memory/feedback_language_integration_procedure.md`.

### 5.1bis · Obligations de test (un langage sans ça n'est pas « intégré »)

Retour d'expérience phase 2-5 (mai-juin 2026) : un adapter sans suite de
tests régresse silencieusement au premier refactor voisin. Tout nouveau
langage livre, dans le même jalon que l'adapter :

1. **Un spec e2e** `packages/ui/tests/e2e/<lang>.spec.ts` qui, sur une
   fixture minimale : évalue un bloc, asserte l'effet détectable (énergie
   audio RMS > seuil via `setupAudioCapture`/`getMaxRMS`, ou pixels allumés
   via `readCanvasLitPixels`), et vérifie zéro `console.error`
   (`expectNoConsoleErrors`). Helpers existants :
   `packages/ui/tests/helpers.ts` — ne pas en réécrire.
2. **Une fixture** `packages/ui/tests/fixtures/` avec un bloc connu qui
   produit un événement détectable.
3. **Une procédure de validation manuelle** numérotée, clic-par-clic,
   exécutable dans un vrai Chrome par un humain (le spec Playwright vert ne
   suffit pas — il ne juge ni la qualité sonore ni le ressenti).
4. **(Si le langage est mis en vitrine)** une session starter dans
   `packages/library/bundled/` + son spec dans `tests/e2e/sessions/`.

Le tout passe dans `npm run verify` (types + lint + unit + e2e), qui est
bloquant au pre-push.

### 5.2 · Points de touchement code pour un langage niveau 2

Une fois Phase 0–2 validées, **ajouter un langage c'est toucher 3
fichiers** grâce à la structure dérivée du registry d'adapters :

1. **`packages/ui/src/lib/core-mock/types.ts`** — ajouter la valeur au
   type union `Runtime` :
   ```ts
   export type Runtime =
     | 'kanopi' | 'strudel' | 'hydra' | 'p5' | 'mercury'   // ← new
     | …;
   ```

2. **`packages/ui/src/lib/runtimes/<lang>.ts`** — l'adapter lui-même, qui
   implémente `RuntimeAdapter` et déclare en particulier :
   ```ts
   export const mercuryAdapter: RuntimeAdapter = {
     id: 'mercury',
     extensions: ['.mercury'],
     async evaluate(code, src, log) { … },
     async stop(src, log) { … },
     async dispose() { … }
   };
   ```

3. **`packages/ui/src/lib/runtimes/registry.ts`** — inscrire l'adapter
   dans la Map :
   ```ts
   import { mercuryAdapter } from './mercury';
   const adapters = new Map<Runtime, RuntimeAdapter>([
     …,
     ['mercury', mercuryAdapter]
   ]);
   ```

**Tout le reste est automatiquement dérivé** :

| Derivation                               | Source                       |
| ---------------------------------------- | ---------------------------- |
| `+ New file` accepte `.mercury`          | `knownExtensions()` du registry (lit `adapter.extensions`) |
| `runtimeFromExt('x.mercury')` → `'mercury'` | `runtimeFromExtension()` du registry |
| Les tabs affichent le bon runtime        | `VirtualFile.runtime` mis via `runtimeFromExt` |
| Core dispatcher route `Ctrl+Enter`       | `getAdapter(file.runtime)`   |
| Extraction de blocs                      | `extractBlocks(code, runtime)` dans `lib/blocks/extract-blocks.ts` (à étendre si le langage a une sémantique de bloc propre, sinon la fallback `extractPositional` s'applique) |

Si le langage a besoin d'un canvas visuel (comme Hydra, p5), ajouter un
composant `<Lang>Canvas.svelte` monté dans `App.svelte` et une fonction
`attach<Lang>Canvas(el)` côté adapter.

Si le langage a une extension CM6 upstream
(`@<lang>/codemirror` ou équivalent), la câbler dans
`packages/ui/src/components/editor/CMEditor.svelte` selon le même
pattern que Strudel. Sinon, cas (b) d'ADAPTER_SPEC §B → highlight JS /
équivalent générique + items backlog PROGRESS §5.4.

**C'est tout.** La logique métier du langage reste upstream.

---

## 5.3 · Block extraction policy

Chaque adapter doit décider **comment découper le fichier en blocs
évaluables**. Cette décision affecte directement le workflow Ctrl+Enter
et le panneau Actors. Deux facteurs pèsent dans le choix :

1. **Non-régression** : regex = pattern custom, source d'erreurs
   silencieuses dès que la syntaxe devient tordue (commentaires,
   strings, multi-lignes, macros…). Chaque regex ajoutée est du
   code que Kanopi maintient hors du langage.
2. **Live coding** : pas d'usine à gaz. Un reparse AST qui coûte
   50-100KB bundle + 5ms par Ctrl+Enter n'est justifié que si le
   regex sous-jacent serait fragile.

### Matrice de décision

| Situation                                                      | Méthode          |
| -------------------------------------------------------------- | ---------------- |
| Slot 1-ligne détectable par motif simple (`$:`, `d1`, `.out()`) | **regex**        |
| Bloc structurel multi-ligne imbriqué + CM6 upstream dispo      | **AST upstream** |
| Bloc structurel multi-ligne sans CM6 upstream (case b §B)      | regex fragile documenté + backlog CM6 |
| Sketch cohérent sans blocs naturels (p5, Mercury)              | **whole-file**   |

### Règle opérationnelle

- Si tu ajoutes une détection **1-ligne triviale**, regex est
  acceptable. Documente le motif dans la doc d'intégration.
- Si la grammaire de ton langage a des **blocs structurels
  multi-ligne** (instrument Csound, synthDef SC, `defn` Clojure…) :
  **AST upstream obligatoire** quand le package CM6 l'expose
  publiquement (via `LRLanguage.parser`). Jamais de regex qui essaie
  d'attraper `open … close` : c'est une mini-implémentation du parser.
- Si le langage n'a pas de CM6 upstream (case b) et a un besoin de
  blocs structurels, **regex fragile documenté + backlog** un CM6
  custom. Ne pas vendoriser une grammaire.

### Documentation obligatoire

Chaque `docs/integrations/<LANG>.md` doit déclarer :

1. **Quelle méthode** est utilisée (regex / AST / whole-file).
2. **Le motif exact** si regex, ou le nom des nœuds Lezer traversés
   si AST.
3. **Les limites connues** (faux positifs possibles, cas non couverts).
4. **Le critère de migration** si le choix actuel est un compromis.

---

## 5bis · Isolation par scope (contrat)

Chaque langage vit dans **sa propre bulle de noms**. Le user code d'un
bloc Hydra ne voit pas les globals d'un bloc Strudel ni de p5. Les
échanges cross-runtime passent **exclusivement** par le bus
`KanopiEvent` (cf `§C`), jamais par variables partagées sur
`globalThis`.

Ce principe n'existait pas formellement dans la v1 de cette spec et a
été violé implicitement par Hydra (`makeGlobal: true`) : une collision
silencieuse sur `window.speed` entre hydra-synth et `@strudel/web` a
corrompu `synth.time` à `NaN` et rendu tous les shaders Hydra noirs
après un premier Play Strudel. Cf `project_hydra_adapter_quirks` +
commits `d404a2b..504310e`.

### Contrat

Un `RuntimeAdapter` doit :

1. **Ne pas polluer `globalThis`** avec les primitives de son langage.
   Les libs upstream qui proposent un flag `makeGlobal` (hydra-synth,
   p5, Strudel dans une certaine mesure) doivent être construites en
   instance mode.
2. **Exposer son scope** sous la forme d'un objet
   `Record<string, unknown>` qui liste toutes les primitives
   disponibles au user code — typiquement la surface publique de la
   lib (`{ osc, solid, noise, out, o0, … }` pour Hydra).
3. **Évaluer le user code dans ce scope** via
   `new Function(...names, userCode)(...values)`. Le user écrit la
   syntaxe canonique du langage (`osc(10).out()`,
   `ellipse(50, 50, 20)`) et ces identifiants résolvent vers le scope
   injecté, pas vers `globalThis`.
4. **Synchroniser avec les autres runtimes uniquement via événements**
   — clock (`onBeat`/`onBar`), events adapter, ou
   `KanopiEvent` bus. Les valeurs dérivées de l'horloge (ex :
   `beat`, `bar`, `bpm` exposés à un patch Hydra) vont dans le scope
   de l'adapter concerné, pas sur `globalThis`.

### Plan A : scope injection via `new Function` (retenu)

Implémenté par enrichissement du scope et exécution dans une closure
non-strict. Le user code écrit la syntaxe canonique, les identifiants
résolvent aux params injectés.

```ts
function evalInScope(scope: Record<string, unknown>, code: string) {
  const names = Object.keys(scope);
  const values = Object.values(scope);
  // eslint-disable-next-line no-new-func
  return new Function(...names, code)(...values);
}
```

**Limite connue** : si le user code référence explicitement
`globalThis.X` ou `window.X`, il lit / écrit le vrai `globalThis`
du host et contourne l'isolation. Cas rare en live coding (aucun
tutoriel Hydra/p5/Strudel n'emploie cette syntaxe), accepté comme
compromis Plan A.

### Plan B : iframe par runtime (envisagé, non retenu v1)

Chaque adapter monte son propre iframe avec son propre `window` /
`globalThis`. Le user code s'exécute dans l'iframe, communication
avec Kanopi via `postMessage`. Isolation **réelle**, `globalThis`
effectivement différent par langage.

**Non retenu v1** :

- **Latence** : `postMessage` ajoute un saut asynchrone à chaque eval
  et à chaque tick de synchronisation (beat/bar). Incompatible avec le
  budget `Ctrl+Enter → prochain tick de beat < 50 ms` de `§6`.
- **Partage d'AudioContext** entre iframes est contraint (cross-origin
  restrictions, lifecycle complexe).
- **Canvas Hydra/p5** dans l'iframe = contexte WebGL isolé, repositioning
  DOM complexe pour le z-index Kanopi.
- **Bundle + boot** : chaque iframe charge son propre runtime + ses
  dépendances. Multiplie la consommation mémoire.

Plan B reste une piste viable pour un v2 / v3 si (a) les user codes se
complexifient au point d'avoir besoin de sandboxing sécurité, ou (b) un
langage exotique requiert un `globalThis` vraiment séparé. Pas de besoin
aujourd'hui.

Alternative future à surveiller : **ShadowRealm** (proposition TC39,
stage 3) — isolation de realm sans iframe, overhead plus faible. Pas
encore stable côté browsers (Chrome flag only au 2026-04).

---

## 6 · Budget latence

Cibles par zone (de l'action user au retour audible/visible) :

| Action                             | Cible     | Mesuré Strudel |
| ---------------------------------- | --------- | -------------- |
| Ctrl+Enter → prochain tick de beat | < 50 ms   | ~20 ms         |
| Ctrl+. → silence total             | < 30 ms   | ~10 ms         |
| Note onset → highlight CM          | < 1 frame | ~1 frame (rAF) |
| Keystroke → autocomplete popup     | < 100 ms  | varie          |

Un adapter qui dépasse ces cibles doit justifier l'écart ou être refusé
(cf `KANOPI_PRINCIPLES §8`).

---

## 7 · Primitives exportées

Surface publique de l'adapter API. Les signatures précises vivent dans
les types TypeScript ; cette table est un index pour la découverte. Une
API reference générée (typedoc) est prévue post-2.4, cf `PROGRESS.md §2.7`.

| Primitive                       | Kind      | Source                                    | Rôle                                         |
| ------------------------------- | --------- | ----------------------------------------- | -------------------------------------------- |
| `RuntimeAdapter`                | interface | `lib/runtimes/adapter.ts:22`             | Contrat implémenté par chaque adapter        |
| `EvalSource`                    | type      | `lib/runtimes/adapter.ts:4`              | `{ actorId?, fileId, docOffset? }`           |
| `LogPush`                       | type      | `lib/runtimes/adapter.ts:16`             | Callback vers Console panel                  |
| `EventBus`                      | interface | `lib/events/types.ts:72`                 | Bus d'événements optionnel par adapter       |
| `getAdapter(runtime)`           | fn        | `lib/runtimes/registry.ts:37`            | Résolution `Runtime → RuntimeAdapter`        |
| `listRuntimes()`                | fn        | `lib/runtimes/registry.ts:41`            | Liste des runtimes enregistrés               |
| `knownExtensions()`             | fn        | `lib/runtimes/registry.ts:51`            | Extensions reconnues (adapters + placeholders) |
| `runtimeFromExtension(ext)`     | fn        | `lib/runtimes/registry.ts:68`            | Lookup `extension → Runtime`                 |
| `strudelAdapter` / `tidalAdapter` | const   | `lib/runtimes/strudel.ts:774,874`        | Adapter Strudel + Tidal (port JS)            |
| `hydraAdapter`                  | const     | `lib/runtimes/hydra.ts:143`              | Adapter Hydra (hydra-synth)                  |
| `mercuryAdapter`                | const     | `lib/runtimes/mercury.ts:64`             | Adapter Mercury (mercury-engine)             |
| `p5Adapter`                     | const     | `lib/runtimes/p5.ts:160`                 | Adapter p5 (instance mode)                   |
| `csoundAdapter`                 | const     | `lib/runtimes/csound.ts:83`              | Adapter Csound (@csound/browser)             |
| `jsAdapter`                     | const     | `lib/runtimes/webaudio.ts:30`            | Adapter JS/WebAudio brut                     |
| `attachHydraCanvas(el)`         | fn        | `lib/runtimes/hydra.ts:126`              | Monte le canvas Hydra au boot                |
| `attachP5Container(el)`         | fn        | `lib/runtimes/p5.ts:125`                 | Monte le conteneur p5 au boot                |
| `registerStrudelEditorView(fileId, view)` | fn | `lib/runtimes/strudel.ts:734`        | Déclare l'EditorView pour highlight + viz    |

Sept adapters sont enregistrés dans le registry : `strudel`, `tidal`,
`hydra`, `p5`, `mercury`, `csound`, `js`. Les extensions `.scd` / `.py` /
`.kanopi` / `.bps` sont routées par la table `PLACEHOLDER_EXTENSIONS` du
registry (runtimes reconnus sans adapter navigateur : niveau 3 osc-bridge,
ou orchestration session). Les helpers (`attach*`,
`registerStrudelEditorView`, …) sont des APIs spécifiques à un adapter,
consommées par les composants UI dédiés.

---

## Historique de révision

- **2026-06-15** : ajout §1bis « Contrat de sortie (obligatoire) » + champ
  `outputType` sur `RuntimeAdapter` (cadrage 2, migration `.kanopi → .bps`).
  Deux clauses obligatoires pour tout langage encapsulé : (a) exposer un point de
  capture de sa sortie (le moteur ne s'adresse jamais directement à l'appareil ;
  capture → dispatcher → transport) ; (b) déclarer le type de sa sortie pour la
  vérification de compatibilité voix↔appareil (cf. `DEVICES_SPEC.md`).
- **2026-04-23** : rédaction initiale (phase 2.3 task 2). Structure en
  6 zones d'intégration extraite du retour d'expérience phase 2.1 — le
  brouillon PROGRESS.md §2.3 ne prévoyait que 3 zones (moteur, events,
  lifecycle), ce qui a causé le chaos des widgets inline et du highlight
  custom réécrit pour rien. L'ajout explicite de « B. Native editor UX »
  vise à éviter le même piège pour Tidal, Hydra, SC.
- **2026-04-23 (soir)** : ajout §5bis « Isolation par scope ». Principe
  formalisé après la collision `speed` Strudel↔Hydra qui a rendu tous
  les shaders noirs pendant la phase 2.4. Plan A (scope injection via
  `new Function`) retenu ; Plan B (iframe par runtime) documenté mais
  non retenu v1 (coût latence incompatible budget `§6`). À appliquer en
  refactor sur Hydra avant d'implémenter p5, puis audit Strudel.
- **2026-04-23 (soir bis)** : ajout du champ `extensions: readonly
  string[]` à l'interface. Chaque adapter déclare désormais ses
  extensions (`['.hydra']`, `['.p5']`…) et `registry.ts` dérive le
  mapping global. Remplace la table `EXTENSION_TO_RUNTIME` standalone,
  ajouter un langage devient vraiment self-contained.
- **2026-06-10** : mise à niveau post-phases 2-5. (1) Nouveau §0 «
  Périmètre » : la frontière adapter de langage (in-repo, cette spec) vs
  transport de sortie (dispatcher, contrat séparé) est désormais explicite
  — les langages de live coding restent dans ce dépôt, les sorties
  matérielles (MIDI, OSC, DMX) se greffent au dispatcher. (2) §2.A et §4 :
  Mercury / p5 / Csound documentés (intégrés en avril, absents de la v1 de
  cette spec). (3) Nouveau §5.1bis : obligations de test par langage (spec
  e2e + fixture + procédure manuelle + session vitrine), bloquantes au
  pre-push via `npm run verify`. (4) §7 : table des primitives resynchronisée
  avec le code (7 adapters, lignes à jour, placeholders documentés).
