# Kanopi — RuntimeAdapter spec

Contrat qu'un langage/runtime doit implémenter pour vivre dans Kanopi.
Chaque adapter est **une couche de glue** entre trois composants upstream
(moteur d'exécution, module éditeur, ressources) et le hub Kanopi (transport,
bus d'événements, bridge).

> **Principe fondateur** : un adapter *n'implémente* rien. Il compose. Si
> vous écrivez plus de 100 lignes de logique métier dans un adapter, c'est
> probablement que vous réimplémentez ce qui existe déjà upstream. Voir
> `KANOPI_PRINCIPLES.md §7`.

---

## 1 · Interface TypeScript

Source : `packages/ui/src/lib/runtimes/adapter.ts`

```ts
export interface RuntimeAdapter {
  readonly id: Runtime;
  evaluate(code: string, src: EvalSource, log: LogPush): Promise<void>;
  stop(src: EvalSource, log: LogPush): Promise<void>;
  setBpm?(bpm: number, log: LogPush): void;
  readonly events?: EventBus;
  dispose(): Promise<void>;
}

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

Un adapter minimal implémente uniquement `id`, `evaluate`, `stop`,
`dispose`. Tout le reste est optionnel mais recommandé.

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

| Langage      | Moteur upstream                         | Import                          |
| ------------ | --------------------------------------- | ------------------------------- |
| Strudel      | `@strudel/web` (inlined full stack)     | `await import('@strudel/web')`  |
| Tidal (nav)  | Strudel avec préfixe TidalCycles (mini) | reuse `strudelAdapter`          |
| Tidal (GHCi) | `osc-bridge` → SuperDirt                | WebSocket (plus tard, Tauri v2) |
| Hydra        | `hydra-synth`                           | `await import('hydra-synth')`   |
| SC           | `scsynth` WASM ou osc-bridge            | à déterminer                    |
| JS           | `AudioContext` natif                    | `new AudioContext()`            |

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

### Complexe (Strudel, 778 lignes)

Le cas le plus chargé à ce jour, car Strudel cumule :

- Multi-slot composite (wrap IIFE par slot pour isolation d'erreurs)
- Remap d'offsets composite ↔ source pour visualisations
- Bridge des méthodes `._X` de `@strudel/codemirror` vers `@strudel/web`
  (function-reference, pas de réimpl)
- Drawer `@strudel/draw` pour les viz `onPaint`
- Hook `highlightMiniLocations` pour le pattern highlight
- Event bus interne relayant `logHap` en `token`
- Tidal adapter = Strudel adapter avec `id: 'tidal'`

Voir `packages/ui/src/lib/runtimes/strudel.ts`. Malgré les 778 lignes,
aucune logique métier du parser Strudel n'est dupliquée — tout est glue.

---

## 5 · Checklist pour un nouveau langage

Avant d'écrire une seule ligne de code :

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
| `RuntimeAdapter`                | interface | `lib/runtimes/adapter.ts:18`             | Contrat implémenté par chaque adapter        |
| `EvalSource`                    | type      | `lib/runtimes/adapter.ts:4`              | `{ actorId?, fileId, docOffset? }`           |
| `LogPush`                       | type      | `lib/runtimes/adapter.ts:16`             | Callback vers Console panel                  |
| `EventBus`                      | interface | `lib/events/types.ts:72`                 | Bus d'événements optionnel par adapter       |
| `getAdapter(runtime)`           | fn        | `lib/runtimes/registry.ts:14`            | Résolution `Runtime → RuntimeAdapter`        |
| `listRuntimes()`                | fn        | `lib/runtimes/registry.ts:18`            | Liste des runtimes enregistrés               |
| `strudelAdapter` / `tidalAdapter` | const   | `lib/runtimes/strudel.ts:673,774`         | Adapter Strudel + Tidal (port JS)             |
| `hydraAdapter`                  | const     | `lib/runtimes/hydra.ts:45`               | Adapter Hydra (hydra-synth)                  |
| `jsAdapter`                     | const     | `lib/runtimes/webaudio.ts:30`            | Adapter JS/WebAudio brut                     |
| `attachHydraCanvas(el)`         | fn        | `lib/runtimes/hydra.ts:40`               | Monte le canvas au boot                      |
| `registerStrudelEditorView(fileId, view)` | fn | `lib/runtimes/strudel.ts:633`         | Déclare l'EditorView pour highlight + viz    |

Seuls `strudel*`, `hydra*`, `js*` sont des adapters listés. Les helpers
(`attachHydraCanvas`, `registerStrudelEditorView`, …) sont des APIs
spécifiques à un adapter, consommées par les composants UI dédiés.

---

## Historique de révision

- **2026-04-23** : rédaction initiale (phase 2.3 task 2). Structure en
  6 zones d'intégration extraite du retour d'expérience phase 2.1 — le
  brouillon PROGRESS.md §2.3 ne prévoyait que 3 zones (moteur, events,
  lifecycle), ce qui a causé le chaos des widgets inline et du highlight
  custom réécrit pour rien. L'ajout explicite de « B. Native editor UX »
  vise à éviter le même piège pour Tidal, Hydra, SC.
