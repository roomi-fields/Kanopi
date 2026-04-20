# Event Bus — `KanopiEvent`

## Motivation

Kanopi cible ~20 runtimes (Strudel, Hydra, JS/WebAudio, SC, Csound, Faust, BPscript, BP3, Tidal, Sardine, Sonic Pi, Chuck, Pd, p5, ORCA, Gibber, Mercury…). Chacun produit des événements sonores ou visuels pendant l'exécution. Les visualizers utiles (pattern highlight animé, pianoroll, scope, spectrogramme, VU, overlay structurel) se répètent d'un langage à l'autre.

Recoder un visualizer par runtime est intenable. Cette spec définit :

1. un **type `KanopiEvent`** qui normalise ce que produit un runtime au runtime,
2. un **bus unique** (`core.events`) que tout consomme,
3. un **contrat adapter** : chaque runtime a la responsabilité de publier des `KanopiEvent` wall-clock.

Les visualizers sont **écrits une fois**, agnostiques du runtime, paramétrés par `{ runtime, source }` seulement si nécessaire.

Cette spec s'aligne sur le namespace OSC `/bps/*` déjà décrit dans [`docs/plan/UI_WEB.md`](../plan/UI_WEB.md) §6.2 pour faciliter le pont OSC externe plus tard (Phase 6).

## Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Strudel      │    │ Hydra        │    │ SC / Csound  │   (runtimes futurs)
│ adapter      │    │ adapter      │    │ adapter      │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │ KanopiEvent       │ KanopiEvent       │ KanopiEvent
       ▼                   ▼                   ▼
       └──────────┬────────┴───────────────────┘
                  ▼
        ┌─────────────────────┐
        │  core.events        │   EventBus unique (topic-addressable)
        │                     │
        │  on(type, cb)       │
        │  onAny(cb)          │
        │  emit(ev)           │
        └──────────┬──────────┘
                   ▼
       ┌───────────┴────────────┬─────────────┬──────────────┐
       ▼                        ▼             ▼              ▼
  PatternHighlight        Pianoroll         Scope       EventsOverlay
  (CM6 decoration)        (Canvas)        (Canvas)      (devtools)
```

Clock et transport publient aussi sur `core.events`. Les consommateurs externes (OSC bridge) peuvent mapper 1-pour-1 sur `/bps/*`.

## Type `KanopiEvent`

Discriminated union. Tous les variants partagent :

```ts
interface KanopiEventBase {
  readonly schemaVersion: 1;
  readonly t: number;           // wall-clock ms, via performance.now()
  readonly runtime: Runtime | 'clock' | 'system';
  readonly source?: string;      // actor name ou autre identifiant source
}
```

**Règle `t`** : toujours wall-clock ms basé sur `performance.now()`. L'adapter a la responsabilité de convertir une éventuelle horloge native (audio-clock Strudel, frame Hydra, time SC) en wall-clock à l'émission. Les visualizers consomment uniformément des ms réelles.

### Variants v1

```ts
type KanopiEvent =
  | BeatEvent
  | BarEvent
  | TransportEvent
  | TriggerEvent
  | TokenEvent
  | FlagEvent
  | AudioAttachEvent
  | AudioDetachEvent;
```

#### `beat`

Battement logique du clock partagé. Émis **une fois par tick de beat**, jamais à chaque frame.

```ts
interface BeatEvent extends KanopiEventBase {
  type: 'beat';
  runtime: 'clock';
  count: number;       // n° de beat depuis play (0-indexed)
  bpm: number;
  phase: number;       // 0..1 à l'instant t
}
```

Correspondance OSC : `/bps/beat count`.

#### `bar`

Mesure (bar) du clock. Émis à chaque franchissement de mesure.

```ts
interface BarEvent extends KanopiEventBase {
  type: 'bar';
  runtime: 'clock';
  count: number;       // n° de bar depuis play
}
```

Correspondance OSC : `/bps/bar count`.

#### `transport`

Changement d'état play/stop du clock master.

```ts
interface TransportEvent extends KanopiEventBase {
  type: 'transport';
  runtime: 'clock';
  playing: boolean;
  bpm: number;
}
```

#### `trigger`

Événement nommé, discret (sans durée). Équivalent `<!name` BPscript.

```ts
interface TriggerEvent extends KanopiEventBase {
  type: 'trigger';
  name: string;        // UTF-8 NFC normalisé par l'émetteur
}
```

Correspondance OSC : `/bps/trigger/<name>`.

#### `token`

Note / événement sonore avec durée. **C'est l'événement principal consommé par PatternHighlight et Pianoroll.**

```ts
interface TokenEvent extends KanopiEventBase {
  type: 'token';
  name: string;                                            // sample/note name (UTF-8 NFC)
  pitch?: number;                                          // midi note number si applicable
  gain?: number;                                           // 0..1 si applicable
  duration: number;                                        // ms
  locations?: Array<[from: number, to: number, fileId: string]>;
}
```

`locations` : offsets source dans le fichier actif du runtime. Optionnel — tous les runtimes ne peuvent pas le fournir (Tidal/GHCi, SC via OSC…). Si absent, PatternHighlight ne dessine rien mais Pianoroll/Scope marchent.

Correspondance OSC : `/bps/token name time dur`.

#### `flag`

Changement de valeur d'un flag.

```ts
interface FlagEvent extends KanopiEventBase {
  type: 'flag';
  name: string;
  value: number | string | boolean;   // strict, jamais unknown
}
```

Correspondance OSC : `/bps/flag/<name> value`.

#### `audio-attach` / `audio-detach`

Signalent qu'un runtime offre un flux audio analysable. Pas de données dans le payload audio-frame : les visualizers **pullent** l'AnalyserNode à leur cadence (rAF).

```ts
interface AudioAttachEvent extends KanopiEventBase {
  type: 'audio-attach';
  analyser: AnalyserNode;
  channels?: number;
}

interface AudioDetachEvent extends KanopiEventBase {
  type: 'audio-detach';
}
```

**Pas de variant `audio-frame`**. Le push d'un AnalyserNode 60 Hz × N visualizers est un anti-pattern : pull côté viz.

### Normalisation

- `name` (trigger, token, flag) : UTF-8 NFC imposé par l'émetteur (`String.prototype.normalize('NFC')`).
- `t` : wall-clock ms, `performance.now()`.
- `duration` : ms.
- `runtime` : valeur de l'enum `Runtime` (`'strudel' | 'hydra' | 'js' | …`) ou `'clock'` pour les events globaux, `'system'` pour l'app.

### Évolution

`schemaVersion: 1` dès le v1. L'ajout de variants (ex: `cue`, `scene-change`, `control`) est rétro-compatible tant que `schemaVersion` reste `1`. Un breaking change bumpe à `2`.

## Contrat `EventBus`

Un seul bus global, exposé par `CoreApi` :

```ts
interface CoreApi {
  // … autres managers
  events: EventBus;
}

type EventType = KanopiEvent['type'];
type EventOf<T extends EventType> = Extract<KanopiEvent, { type: T }>;
type Listener<T extends EventType> = (e: EventOf<T>) => void;
type AnyListener = (e: KanopiEvent) => void;
type Unsubscribe = () => void;

interface EventBus {
  on<T extends EventType>(type: T, cb: Listener<T>): Unsubscribe;
  onAny(cb: AnyListener): Unsubscribe;
  emit(e: KanopiEvent): void;
}
```

Implémentation de référence : `Map<EventType, Set<Listener>>` + `Set<AnyListener>`. Cf. `packages/ui/src/lib/events/bus.ts`.

### Conventions Svelte 5

Abonnement dans un composant :

```ts
$effect(() => {
  const off = core.events.on('token', (e) => {
    // … UI update
  });
  return off;
});
```

**Jamais** `onMount(() => core.events.on(...))` sans `onDestroy(off)` : fuite au HMR. `$effect` garantit le cleanup.

## Contrat adapter runtime

```ts
interface RuntimeAdapter {
  readonly id: Runtime;
  readonly events?: EventBus;   // optionnel ; relayé par real-core si présent
  evaluate(code, src, log): Promise<void>;
  stop(src, log): Promise<void>;
  setBpm?(bpm, log): void;
  dispose(): Promise<void>;
}
```

Si `adapter.events` existe, `real-core` branche un bridge `adapter.events.onAny((e) => core.events.emit(e))` à l'init. L'adapter n'a qu'à publier sur son bus local ; les détails de tag/runtime sont respectés.

### Responsabilités de l'adapter

1. **Convertir les horloges natives en wall-clock ms** à chaque émission.
   - Strudel : `t = performance.now() + (hap.deadline - audioCtx.currentTime) * 1000`.
   - Hydra : rAF callback → `t = performance.now()` directement.
   - WebAudio : `t = performance.now() + (audioEvent.when - audioCtx.currentTime) * 1000`.
2. **Normaliser les `name` en UTF-8 NFC**.
3. **Enrichir avec `locations` quand possible** (Strudel : `hap.context.locations` → `[from, to, fileId]` avec fileId = source actif).
4. **Garde anti-post-hush** : un adapter ne doit pas emit après `stop()` pour des events scheduled avant le stop. Flag `stopped` local + durée de grâce ≤ 1 cycle.
5. **Ne jamais bloquer sur `emit`** : `emit` est synchrone mais les consommateurs lourds (CM6) batchent via rAF de leur côté.

## Correspondance `/bps/*` ↔ `KanopiEvent`

| OSC (externe)                   | `KanopiEvent` (interne)                  |
|---------------------------------|------------------------------------------|
| `/bps/beat count`               | `{ type: 'beat', count, bpm, phase }`    |
| `/bps/bar count`                | `{ type: 'bar', count }`                 |
| `/bps/trigger/<name>`           | `{ type: 'trigger', name }`              |
| `/bps/flag/<name> value`        | `{ type: 'flag', name, value }`          |
| `/bps/token name time dur`      | `{ type: 'token', name, t, duration }`   |
| `/bps/tempo bpm`                | (via `transport` ou `clock.setBpm`)      |
| `/bps/control/<key> value`      | `{ type: 'flag', name: key, value }`     |

Un futur pont OSC (Phase 6 UI_WEB) s'abonne à `core.events.onAny(...)` et sérialise chaque event vers son adresse OSC. Un pont OSC inverse publie via `core.events.emit(...)` en décodant l'adresse.

## Visualizers v1 et events consommés

| Visualizer             | Events consommés                          | Runtimes couverts                          |
|------------------------|-------------------------------------------|--------------------------------------------|
| `EventsOverlay` (dev)  | `onAny`                                   | tous                                       |
| `PatternHighlight`     | `token` (avec `locations`)                | Strudel aujourd'hui ; tout runtime qui fournit `locations` |
| `Pianoroll`            | `token` (pitch/duration)                  | Strudel ; tout runtime qui fournit `pitch/duration` |
| `Scope`                | `audio-attach`/`audio-detach` + pull rAF  | Strudel, WebAudio, Hydra (si audio) |
| `Spectrum`             | idem                                      | idem                                       |
| `TransportPill` (existant) | `beat`, `bar`, `transport`            | global                                     |
| `ScenesPanel` (futur)  | `trigger`, `flag`                         | global + runtimes                          |

Dégradation propre : un runtime qui n'émet pas `token.locations` perd PatternHighlight mais garde Pianoroll. Un runtime sans `audio-attach` perd Scope/Spectrum.

## Back-pressure et perf

- **Events discrets** (`token`, `trigger`, `beat`, `bar`, `transport`, `flag`) : emit synchrone, pas de queue.
- **Consommateurs coûteux** (CM6 decorations, Canvas) : batch via rAF **côté consommateur**, pas côté bus. Un viz lent ne doit pas ralentir un autre viz ni l'adapter émetteur.
- **Audio** : `audio-attach` envoie l'`AnalyserNode` une fois ; les viz pullent à leur cadence. Helper `getAnalyser(fftSize)` recommandé si fftSize partagé pose conflit.
- **Tokens haute densité** (Strudel 60+ tokens/sec) : PatternHighlight batche via rAF, décorations additives dans un `StateField` avec timer de dismiss.

## Exemple end-to-end

### Émission (adapter Strudel)

```ts
await initStrudel({
  onTrigger: (hap, deadline) => {
    if (stopped) return;
    const t = performance.now() + (deadline - getAudioContext().currentTime) * 1000;
    adapterEvents.emit({
      schemaVersion: 1,
      type: 'token',
      runtime: 'strudel',
      source: currentActor,
      t,
      name: String(hap.value.s ?? 'token').normalize('NFC'),
      pitch: hap.value.note,
      gain: hap.value.gain,
      duration: (hap.whole.end - hap.whole.begin) * 1000,  // cycles → ms via bpm
      locations: extractLocations(hap, currentFileId)
    });
  }
});
```

### Consommation (PatternHighlight)

```ts
// pattern-highlight.ts — extension CM6
const listener = core.events.on('token', (e) => {
  if (!e.locations) return;
  queueDecoration(e);     // batch rAF
});
// cleanup sur destroy / doc swap : listener()
```

## Références

- Implémentation bus : `packages/ui/src/lib/events/bus.ts`
- Types : `packages/ui/src/lib/events/types.ts`
- Adapter Strudel : `packages/ui/src/lib/runtimes/strudel.ts`
- Visualizer générique : `packages/ui/src/components/viz/pattern-highlight.ts`
- DevTools : `packages/ui/src/components/devtools/EventsOverlay.svelte`
- Bus OSC externe (futur) : [`../plan/UI_WEB.md`](../plan/UI_WEB.md) §6.2
- Tick bus et dispatcher : [`ARCHITECTURE.md`](ARCHITECTURE.md) §Data flow runtime
- `sys.beat` / `sys.bar` / triggers scène : [`SCENES.md`](SCENES.md)
- Haps Strudel : [`../integrations/TIDAL.md`](../integrations/TIDAL.md) §3.3 et §8.2
