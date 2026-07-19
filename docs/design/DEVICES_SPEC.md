# Kanopi — Device library (`@devices`) format spec

> Cadrage 1 (architecte/Romain, 2026-06-15). Prérequis du lot 4 cross-runtime
> (migration `.kanopi → .bps`). Côté bpscript la référence est `docs/design/ACTOR.md`
> (`transport` = appareil typé requis). Cette spec définit le **format** de la
> librairie d'appareils ; l'implémentation (l'appareil `midi` par défaut câblé)
> vient avec le lot 4. Backlog : `hub/projets/backlog-langage-bps.md §B2`.

## 0 · Pourquoi

Une voix (`@actor`) déclare **où** elle sort via `transport.<appareil>`. Le
`transport` pointe **toujours un appareil typé** d'une librairie `@devices` — pas
un type de sortie nu. Cette indirection permet :

- de router plusieurs voix vers le **même appareil physique** (deux voix MIDI sur
  le port « clavier ») ;
- de **vérifier la compatibilité** voix↔appareil sur le **type** (refuser une voix
  Tidal — sortie audio/notes — routée vers `transport.lumieres` — type DMX) ;
- de re-cibler une session sur un autre appareil **sans toucher les voix** (changer
  l'appareil `defaut` de `midi` vers `osc`).

C'est l'équivalent BPScript du `@actor <fichier> <runtime>` cross-runtime des
anciens `.kanopi`, mais **paramétré et typé**.

## 1 · L'enregistrement d'appareil

Un appareil = **nom** + **type** + **params de connexion**.

```ts
type DeviceType = 'midi' | 'audio' | 'osc' | 'dmx' | 'video' | 'text';

interface Device {
  /** nom unique référencé par `transport.<name>` (kebab/lower, ex. 'midi', 'clavier', 'lumieres') */
  name: string;
  /** classe de l'appareil — fixe les sorties de voix compatibles (voir §3) */
  type: DeviceType;
  /** params de connexion, dépendants du type (voir §2). Optionnels = défauts du type. */
  params?: Record<string, unknown>;
  /** libellé lisible pour l'UI (sinon = name) */
  label?: string;
}
```

Règles :

- `name` est la clé de référence : `transport.clavier` → l'appareil `name: 'clavier'`.
- `type` est **immuable** par appareil et **non déductible du nom** (un appareil
  nommé `midi` pourrait théoriquement être de type `osc` — le `type` fait foi).
- Un appareil **`midi` basique existe TOUJOURS par défaut** (voir §4) : une voix sans
  `transport` explicite, ou `transport.midi`, le cible.

## 2 · Params de connexion par type

Le `type` détermine les params attendus. Tous optionnels (un défaut sain par type) ;
le **runtime de sortie** correspondant les consomme — plus de dispatcher/`transports/`
intermédiaire (`packages/core/src/dispatcher/`, husk éliminé [842] ; le répertoire
`transports/` n'existe plus). Kronos route directement sur `event.output.runtime`
vers le runtime enregistré. Forme **minimale bêta** ci-dessous
(extensible — un type peut gagner des params sans casser le format) :

| type    | params (clés)                         | défaut             | runtime de sortie          |
| ------- | ------------------------------------- | ------------------ | -------------------------- |
| `midi`  | `port` (nom\|index), `ch` (1-16)      | 1er port, ch 1     | `runtime-midi`              |
| `audio` | `out` (sortie), `gain`                | sortie par défaut  | `runtime-audio`             |
| `osc`   | `host`, `port`, `addr` (préfixe)      | 127.0.0.1:57120    | `runtime-osc`                |
| `dmx`   | `universe`, `channel`                 | univers 0          | (greffe runtime-dmx)       |
| `video` | `target` (canvas/sortie)              | canvas principal   | (greffe runtime-video)     |
| `text`  | —                                     | —                  | pas de sink câblé (compatibilité seule, `devices/registry.ts:39`) |

Les params `runtime` d'une voix (`transport.midi(ch:10)`) **surchargent** ceux de
l'appareil pour cette voix (cascade de sortie, cf. ACTOR.md §4) — l'appareil porte
le **défaut partagé**, la voix l'**affine**.

## 3 · Type d'appareil ↔ type de sortie de voix (compatibilité)

Chaque appareil accepte un ensemble de **types de sortie de voix** (le type qu'un
adaptateur de langage déclare — voir `ADAPTER_SPEC.md §1`, clause `outputType`). La
compatibilité se vérifie **avant de router** ; une voix incompatible est **refusée**
(erreur d'éval claire, pas un silence).

| appareil (`type`) | types de sortie de voix acceptés      |
| ----------------- | ------------------------------------- |
| `midi`            | `notes`                               |
| `audio`           | `notes`, `signal`                     |
| `osc`             | `control`, `notes`                    |
| `dmx`             | `light`                               |
| `video`           | `visual`                              |
| `text`            | `text` (+ tout : repli console lisible) |

Exemple refusé : une voix Tidal (`outputType: 'notes'`/`'signal'`) routée vers
`transport.lumieres` (`type: 'dmx'`) → incompatible (`notes`/`signal` ∉ `{light}`).

## 4 · Où ça vit + l'appareil par défaut

- **Librairie par défaut (bundled)** : `packages/library/devices.json` — au minimum
  l'appareil `midi` par défaut :

  ```json
  { "devices": [{ "name": "midi", "type": "midi", "label": "MIDI (default)" }] }
  ```

- **Appareils utilisateur** : surcouche persistée (localStorage / config workspace),
  fusionnée par-dessus les bundled (mêmes `name` → l'utilisateur gagne). Réutilise le
  modèle « défaut non-modifiable + perso » prévu pour les sets de librairies.
- **Résolution** : `transport.<name>` → cherche l'appareil dans (perso ∪ bundled) ;
  introuvable → erreur d'éval (« appareil inconnu : `<name>` »), **jamais** un silence.
- La librairie d'appareils est **chargée par Kanopi** ; bpscript ne fait que
  **référencer** un `name` (la résolution + la connexion physique sont à Kanopi).

## 5 · Coordination bpscript (référence `transport.<appareil>`)

Aligné avec `BPscript/docs/design/ACTOR.md` + l'EBNF v0.8 :

- Forme de référence : `transport.<name>` avec params runtime optionnels
  `transport.<name>(k:v, …)` (mêmes `()` héritables que `Sa(vel:80)`).
- `name` est un **identifiant libre** (le nom d'appareil), pas une liste fermée de
  mots-clés. Les anciens mots `transport.midi`/`transport.webaudio` deviennent des
  **noms d'appareils par défaut** (midi bundled ; `webaudio` = alias de l'appareil
  `audio` par défaut pour rétro-compat des `.bps` existants).
- bpscript **valide la syntaxe** de la référence ; **Kanopi valide l'existence +
  la compatibilité de type** (§3) à l'éval. Frontière : bpscript ne connaît pas la
  librairie d'appareils, il porte le `name` opaque.

## 6 · Hors scope (cette spec)

- Le câblage des transports `dmx`/`video` (greffes runtime-dmx / runtime-video) —
  l'appareil est déclarable, le transport arrive avec ces projets.
- Le mécanisme de **capture-pour-retransport** (backlog B4) — comment la sortie d'un
  `eval.<runtime>` est captée puis placée : couvert par la clause d'exposition de
  sortie de `ADAPTER_SPEC.md §1` (cadrage 2).
- L'UI de gestion des appareils (panneau Hardware) — post-bêta.
