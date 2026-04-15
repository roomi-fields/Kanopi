# Integration audit — TidalCycles / Strudel

**Status:** v0.2 · audience: existing Tidal/Strudel live coders considering Kanopi.

**Goal:** when a Tidal/Strudel user opens Kanopi, **nothing should feel like a
regression** versus their current workflow. This document audits every
dominant editor in the ecosystem, maps each affordance to Kanopi's current
implementation, and sets a tiered roadmap.

Legend: ✅ shipped · 🟡 partial · ❌ missing · `unverified` = could not be
cross-checked in sources.

---

## 1. Reference editors

| Editor | Pop. | Backend | Stack | Status | License |
|---|---|---|---|---|---|
| **atom-tidalcycles** | historic largest | GHCi + SuperDirt (OSC) | Atom (EOL) / Pulsar fork | maintained on Pulsar fork only (`pulsar-tidalcycles`). Atom itself EOL'd Dec 2022. | GPL-3.0 |
| **pulsar-tidalcycles** | migrating users | GHCi + SuperDirt | Pulsar (Atom fork) | active, drop-in for `atom-tidalcycles` | GPL-3.0 |
| **vscode-tidalcycles** | growing fast | GHCi + SuperDirt | VS Code extension | active, de-facto successor | MIT |
| **vim-tidal** / **tidal.nvim** | niche power users | GHCi via tmux / native terminal | Vim/Neovim plugin | active | MIT |
| **strudel.cc REPL** (`@strudel/codemirror`) | largest *browser* pop. | browser-native (WebAudio) | CM6 + Vite + Astro | active (moved to codeberg.org/uzu/strudel, June 2025) | AGPL-3.0 |
| **Flok** (`@flok-editor/*`) | online collab | browser + node relay | CM6 + Yjs + WebRTC | active on codeberg | MIT |
| **Estuary** | online multiplayer | Haskell client + Haskell server | PureScript/Reflex | active, McMaster-hosted | GPL-3.0 |

For Phase 1 (browser-only) Kanopi is in the **strudel.cc / Flok** arena.
Native Tidal parity (GHCi + SuperDirt + `BootTidal.hs`) is out of scope until
the Tauri + osc-bridge Phase 2.

Sources — all keymap/config claims are from raw repo files:
- atom/pulsar: `pulsar-tidalcycles/keymaps/tidal.json`, `atom-tidalcycles/menus/tidalcycles.json`.
- vscode: the extension's `package.json` (21 commands / 21 keybindings).
- vim-tidal: README in `tidalcycles/vim-tidal`.
- Strudel: `@strudel/codemirror@1.3.0` on unpkg (keybindings.mjs, highlight.mjs, codemirror.mjs, autocomplete.mjs).
- Flok: `@flok-editor/cm-eval/lib/eval.ts` and `packages/web/src/settings.json`.

---

## 2. Feature matrix (12 scope rows × editors)

Columns left→right: `atom/pulsar-tidalcycles` · `vscode-tidalcycles` · `vim-tidal` · `strudel.cc` · `Flok` · `Estuary` · **Kanopi today**.

### 2.1 Keybindings — evaluation & transport

| Action | atom/pulsar | vscode | vim-tidal | strudel.cc | Flok | Estuary | **Kanopi** |
|---|---|---|---|---|---|---|---|
| Eval block / paragraph | `Ctrl+Enter` / `Cmd+Enter` ✅ | `Ctrl+Enter` (`tidal.evalMulti`) ✅ | `<c-e>` / `<ll>ss` (send inner paragraph) ✅ | `Ctrl+Enter` (via @strudel/codemirror default keymap; also Alt+Enter) ✅ | `Ctrl-Enter` / `Cmd-Enter` (configurable; default `defaultEvalKeys`) ✅ | unverified | `Ctrl+Enter` ✅ (`CMEditor.svelte:48-62`, uses `extractBlock`) |
| Eval single line | `Shift+Enter` (`tidalcycles:eval`) ✅ | `Shift+Enter` (`tidal.eval`) ✅ | `<ll>s` (line or visual) ✅ | `Shift+Enter` (depends on keymap preset; `codemirror` preset inherits; Vim `:w` dispatches eval) 🟡 | `Shift-Enter` (`lineEvalKeys`) ✅ | unverified | `Shift+Enter` ✅ (`CMEditor.svelte:64-76`) |
| Eval whole editor / file | `Ctrl+Shift+Alt+Enter` (`eval-whole-editor`) ✅ | ❌ no dedicated command | `:TidalSend` over full buffer ✅ | Strudel evaluates the entire document by convention (one pattern per file) ✅ | `Alt-Enter` / `Ctrl+Shift+Enter` (`documentEvalKeys`) ✅ | unverified | ❌ not bound |
| Eval with copy (visual flash preserved to clipboard) | `Alt+Shift+Enter` / `Alt+Ctrl+Enter` (`eval-copy`, `eval-multi-line-copy`) ✅ | ❌ | ❌ | ❌ | ❌ | — | ❌ |
| Hush all (panic) | `Ctrl+.` / `Cmd+.` / `Shift+Ctrl+H` / `Shift+Cmd+H` ✅ | `Ctrl+Alt+H` (`tidal.hush`) ✅ | `<ll>h` / `<c-h>` (`:TidalHush`) ✅ | `Ctrl+.` (convention) + on-screen stop button ✅ | Per-language `panicCodes` from `settings.json` (e.g. strudel→`silence`, tidal→`hush`, hydra→`hush()`) ✅ | unverified | ✅ `Mod+.` in editor (`CMEditor.svelte:46`) + global (`bindings.ts:29-33`) |
| Per-orbit silence `d1`…`d16` | `Ctrl+1`…`Ctrl+9`, `Ctrl+Alt+0`…`Ctrl+Alt+6` (`toggle-mute-N`) ✅ | `Ctrl+1`…`Ctrl+16` (`tidal.toggleMute1..16`) ✅ | `<ll>s[N]` play / `<ll>[N]` silence (`TidalPlay`/`TidalSilence`) ✅ | ❌ (Strudel uses `$: …` channel syntax, no global mute keys) | via per-pane eval; no stream mute keymap | unverified | ❌ (Kanopi slots per *actor*, not per orbit; see `strudel.ts:50-63`) |
| Unmute all | `Ctrl+0` (`unmuteAll`) ✅ | ❌ (only per-channel toggles) | ❌ | — | — | — | ❌ |
| Play / pause transport | n/a (GHCi-driven) | n/a | n/a | on-screen play button; `Space` in some builds | play/stop button | unverified | ✅ `Space` global (`bindings.ts:35-38`) |
| BPM up/down | n/a (code-driven via `setcps`) | n/a | n/a | slider in UI | per-pane | unverified | ✅ topbar `TransportCluster` drives `setcps` (`strudel.ts:67-77`) |

### 2.2 Keybindings — editor hygiene

| Action | atom/pulsar | vscode | vim-tidal | strudel.cc | Flok | **Kanopi** |
|---|---|---|---|---|---|---|
| Toggle line comment | Atom default `Ctrl+/` ✅ | VS Code default `Ctrl+/` ✅ | Vim `gc` / commentary ✅ | `Ctrl+/` + Vim `gc` remapped to dispatch `repl-toggle-comment` (`keybindings.mjs`) ✅ | CM6 default ✅ | 🟡 no explicit binding; `defaultKeymap` provides `Ctrl+/` |
| Duplicate line | Atom default | VS Code default | Vim `yyp` | via keymap preset | CM6 default | 🟡 inherits `defaultKeymap` |
| Command palette | `Ctrl+Shift+P` (Pulsar core) | `Ctrl+Shift+P` | n/a | ❌ | ❌ | ✅ `Mod+K` / `Mod+Shift+P` (`CMEditor.svelte:44-45`) |
| Boot / reboot runtime | menu `Boot TidalCycles` / `Reboot Tidalcycles` | — (auto-boot on first eval) | Vim `:TidalConfig` | auto-init on first eval | auto via session | ✅ auto (`strudel.ts:27-46`, lazy `initStrudel`) |

### 2.3 Syntax highlighting

| Editor | Grammar engine | Target | Mini-notation | Function emphasis | Notes |
|---|---|---|---|---|---|
| atom-tidalcycles | TextMate (`grammars/tidal.cson`) | `.tidal` Haskell-like | dedicated scopes inside double-quoted strings (event scope; grammar defines `mini-notation` nested pattern) ✅ | yes | also ships `sound-browser` UI |
| pulsar-tidalcycles | same grammar as atom fork | idem | idem | yes | drop-in |
| vscode-tidalcycles | TextMate (`syntaxes/tidal.tmLanguage.json`) + files associated to `haskell` for fallback | `.tidal` | partial — mini-notation tokens inside strings (single-pattern overlay) 🟡 | yes | README recommends adding `"files.associations": {"*.tidal":"haskell"}` for users who want Haskell fallback |
| vim-tidal | Vim runtime syntax `tidal.vim` (regex) | `.tidal` | basic string highlighting, no nested mini-notation 🟡 | yes | relies on haskell.vim base |
| strudel.cc | **Lezer via `@codemirror/lang-javascript`** (standard JS grammar — NOT a mini-notation grammar). Mini-notation highlighting is **runtime-driven**: on eval the Strudel transpiler returns source *locations* per mini-expression, and `highlight.mjs` installs CM `Decoration.mark()` ranges that pulse in time with the scheduler (via `highlightMiniLocations(view, atTime, haps)`). So "mini-notation coloring" is actually **event-timed outlines**, not static syntactic coloring. ✅ | `.js/.mjs` | ✅ runtime-animated (unique feature) | function names = standard JS identifier tag | `highlight.mjs:1-100`, `codemirror.mjs:1-60` |
| Flok | CM6 language packs per-target (`langByTarget` in `settings.json`: `tidal`→Tidal lang, `strudel`→JS, `hydra`→JS, `foxdot`/`renardo`/`sardine`→python, etc.) | multi | depends on lang plug-in | standard | uses `@flok-editor/lang-tidal` (Lezer-ish for `.tidal`) |
| Estuary | client-side textual, mostly homemade regex per mini-language (TidalCycles, CineCer0, Punctual, MiniTidal…) | multi | partial | partial | unverified per-mode |
| **Kanopi** | `@codemirror/lang-javascript` for `strudel`/`tidal`/`hydra`/`js`/`sc`, `@codemirror/lang-python` for `python`, custom `kanopiLanguage` for `.kanopi` session files. Highlight tags mapped in `highlight-styles.ts:23-37`. 🟡 | multi | ❌ no mini-notation decorator (neither static nor event-timed) | `t.function(variableName)` tag reaches all JS calls; no registry-aware pass | `lang-resolver.ts`, `highlight-styles.ts` |

### 2.4 Autocomplete / IntelliSense

| Editor | Source | Trigger | Docs / hover | Signature help | Mini-notation |
|---|---|---|---|---|---|
| atom-tidalcycles | Atom autocomplete provider service — static registry from `lib/autocomplete-provider.js`; also dirt-sample names harvested from SuperDirt folder | on identifier prefix | minimal | ❌ | ❌ |
| pulsar-tidalcycles | idem, `autocomplete.provider 4.0.0` | idem | idem | ❌ | ❌ |
| vscode-tidalcycles | "CodeHelp" feature: hover + completion with configurable detail (`tidalcycles.codehelp.hover.level`, `tidalcycles.codehelp.completion.level` ∈ {OFF, FULL, NO_EXAMPLES_NO_LINKS, MINIMUM}; reloadable via `tidal.codehelp.reload`); extra user commands via `tidalcycles.codehelp.commands.extra` ✅ | identifier | hover ✅ | ❌ (no Haskell LSP) | ❌ |
| vim-tidal | `:TidalGenerateCompletions {path}` builds a Dirt-Samples dictionary, consumed by any omnicomplete-capable completion plugin 🟡 | `<c-x><c-o>` | ❌ | ❌ | ❌ |
| strudel.cc | **`autocompletion()` from `@codemirror/autocomplete`** fed by **JSDoc extracted from the Strudel source** (`doc.json`) — see `autocomplete.mjs:1-30`. Each suggestion carries name, params, description, examples rendered as HTML. Also pulls sound names from `soundMap` (webaudio samples) and scale names (`@strudel/tonal`). Disabled by default (`isAutoCompletionEnabled: false` in `defaultSettings`) ✅ | identifier prefix | **rich HTML tooltip with params, types, examples** ✅ | ❌ | ❌ |
| Flok | per-target, via `@flok-editor/lang-*` packages (where provided); no IntelliSense for most | — | ❌ | ❌ | ❌ |
| Estuary | unverified | — | tutorials pane | ❌ | ❌ |
| **Kanopi** | **❌ no `autocompletion()` extension installed**. Kanopi ships `@codemirror/lang-javascript` which provides *syntactic* completion (locally-declared idents) but no registry of Strudel functions, sound names, or docs. | — | ❌ | ❌ | ❌ |

### 2.5 Linting / error reporting

| Editor | Strategy |
|---|---|
| atom/pulsar-tidalcycles | GHCi compile errors streamed into dedicated "GHCi output" bottom panel (opt-in via `showGhciOutput`); no inline squiggles. Errors reference line numbers from GHCi `<interactive>:N:M` format. |
| vscode-tidalcycles | `tidalcycles.showGhciOutput` + `tidalcycles.showOutputInConsoleChannel`. No diagnostic squiggles (Haskell LSP integration is user-configured separately). |
| vim-tidal | Errors visible in the tmux pane or Vim terminal buffer. No quickfix integration by default. |
| strudel.cc | Evaluation errors caught → Console pane + inline flash (red `flash.mjs`) over the evaluated block. No squiggles. |
| Flok | Errors surface in per-pane "messages" area; multiplayer. |
| **Kanopi** | 🟡 Strudel errors logged to Console (`strudel.ts:85-87`); block-level red flash via `eval-flash.ts`; no CM6 linter decorations for parser diagnostics. Session AST already produces `Diagnostic[]` with precise ranges (`resolver.ts:29`, `ast.ts`) — ready to wire into `@codemirror/lint`. |

### 2.6 Snippets · 2.7 Formatting / folding / outline

- atom/pulsar: starter `BootTidal.hs` + ships a `sound-browser` folder view; no snippet pack inside the plugin itself. No formatting.
- vscode: no snippets in `package.json`. No formatter. No outline (Haskell outline only if LSP installed separately).
- strudel.cc: no snippets; docs are the "Learn" pages — not in-editor. No formatter. Folding via CM6 default (braces).
- Flok: no snippets; no formatter.
- **Kanopi:** ❌ no snippets registry; `bracketMatching()` + `indentOnInput()` only; no symbol outline. We *do* have a session outline (actors/scenes/maps) from `resolver.ts` — not exposed as an "Outline" panel yet.

### 2.8 Visualizers

| Editor | Pattern viz | Piano-roll | Waveform | Scope/VU | Clock |
|---|---|---|---|---|---|
| atom-tidalcycles | event highlighting inside quoted mini-notation (pulses the sub-range of the string as events fire) ✅ | ❌ | ❌ | ❌ | ❌ |
| pulsar | idem | ❌ | ❌ | ❌ | ❌ |
| vscode-tidalcycles | ❌ | ❌ | ❌ | ❌ | "eval counter" status bar (`showEvalCount`) |
| vim-tidal | ❌ | ❌ | ❌ | ❌ | ❌ |
| strudel.cc | ✅ pulsing mini-notation outlines (`highlight.mjs`), ✅ `@strudel/draw` canvas (piano-roll, spiral, pitchwheel, `scope`, `spectrum`) used via `drawPiano()` etc. invoked from patterns | via `@strudel/draw` | via `scope()` | via `spectrum()` | animated cursor |
| Flok | per-language | ❌ | ❌ | ❌ | ❌ |
| Estuary | per-language ensemble view | ❌ | ❌ | ❌ | ❌ |
| **Kanopi** | ❌ | ❌ | ❌ | ❌ | ✅ transport pill |

### 2.9 Transport / BPM UI

- atom/pulsar: code-only (`setcps`). No UI slider.
- vscode: idem.
- strudel.cc: code-driven `setcps` + UI "cps" control on the REPL; visible BPM metronome.
- Flok: per-pane; UI varies per language.
- **Kanopi:** ✅ topbar BPM slider → `strudelAdapter.setBpm` (`strudel.ts:67-77`), good parity.

### 2.10 Sample library / in-editor docs

- atom-tidalcycles: ✅ `sound-browser` tree listing SuperDirt sample folders, click-to-insert.
- vscode-tidalcycles: ❌ (user browses SuperDirt folder manually).
- vim-tidal: 🟡 `:TidalGenerateCompletions` yields a sample name dictionary.
- strudel.cc: 🟡 **Sounds** tab on the REPL site listing sample banks; "Learn" pages open in a side pane on `strudel.cc` (not inside the editor extension itself). Autocomplete shows sample names from `soundMap` once samples are loaded.
- Flok: ❌.
- **Kanopi:** ❌ (Library activity in the sidebar is a placeholder).

### 2.11 Boot / session management

- atom-tidalcycles / pulsar: `BootTidal.hs` resolution: user-setting → cwd → Tidal install → plugin fallback (`tidal.cabal` config). Commands `tidalcycles:boot`, `tidalcycles:reboot`.
- vscode-tidalcycles: `tidalcycles.bootTidalPath`, `tidalcycles.useBootFileInCurrentDirectory`, plus `tidalcycles.ghciPath` and `tidalcycles.useStackGhci`. Auto-boot on first eval.
- vim-tidal: `g:tidal_boot` > cwd ancestor `BootTidal.hs` / `Tidal.ghci` / `boot.tidal` > `g:tidal_boot_fallback`.
- strudel.cc: no boot file; Strudel auto-imports `@strudel/web`.
- Flok: per-pane lang setting in `settings.json` (`defaultTarget`, `knownTargets`, `panicCodes`, `noAutoIndent`, `webTargets`, `targetsWithDocumentEvalMode`).
- **Kanopi:** ✅ status pill (`StrudelStatusPill.svelte`), auto-init (`strudel.ts:27-46`). ❌ no `BootTidal`-style per-project prelude file.

### 2.12 Multiplayer / sharing

- atom/pulsar/vscode/vim: ❌ local only (Teletype was Atom-only and dead).
- strudel.cc: 🟡 shareable URL (code → hash), no live cursors.
- Flok: ✅ Yjs CRDT + WebRTC sync, multiple panes with independent languages, username per cursor.
- Estuary: ✅ "networked ensemble" model, server-side replay.
- **Kanopi:** ❌ (not in Phase 1 scope).

---

## 3. Syntax-highlighting architecture — deep dive

### 3.1 vscode-tidalcycles
- TextMate grammar file under `syntaxes/` (JSON variant) with scopes like
  `source.tidal`, `keyword.operator.tidal`, `entity.name.function.tidal`,
  `meta.mini-notation.tidal`, nested `string.quoted.double.tidal`.
- Submodule `submodules/tidal.pegjs` ships a **PEG.js grammar** for Tidal/mini
  used by the CodeHelp feature (function-level parsing for hover docs), not
  for tokenization in the editor itself.

### 3.2 atom / pulsar-tidalcycles
- CSON TextMate grammar `grammars/tidal.cson`. Defines a `string.quoted.double`
  scope that *embeds* a `meta.mini-notation` pattern, giving distinct scopes
  for `*`, `/`, `|`, `~`, `<>`, `[]`, `!`, `?`, `@`, `:`, numbers, rests.
- Shipped "event highlighting" decorator in `lib/editor.js` that animates the
  sub-range of the quoted string as events fire.

### 3.3 strudel.cc
- **Primary grammar = plain JavaScript** via `@codemirror/lang-javascript`
  (Lezer). Mini-notation lives in ordinary JS double-quoted strings and is
  *not* statically highlighted inside them.
- Instead, after `evaluate()`, the Strudel transpiler (`@strudel/transpiler`)
  returns an array of `[from, to]` source-offset pairs for every mini-notation
  sub-expression. The CM extension in `highlight.mjs` (`setMiniLocations`
  effect) records them as `Decoration.mark({...})` with an invisible style,
  then per animation frame `highlightMiniLocations(view, atTime, haps)` finds
  which decorations overlap the currently-playing `hap.context.locations` and
  renders a 2 px outline in the hap's `color`. This is the animated "lit-up
  mini-notation" visual strudel.cc is famous for.
- No Lezer/Tree-sitter grammar for mini-notation itself. This is a deliberate
  trade: the pattern parser already runs at eval time, so re-parsing in the
  editor is redundant.

### 3.4 Flok
- Uses `@flok-editor/lang-tidal` for `.tidal`, regular `@codemirror/lang-*`
  for JS/Python/etc. Highlighting depth therefore varies per language pack.

### 3.5 Existing Tree-sitter / Lezer grammars
- **`tree-sitter-haskell`** is widely deployed and works for `.tidal` files
  because Tidal code is Haskell. No mini-notation support inside strings.
- **`tree-sitter-tidal`**: `unverified` — no canonical repo found; a few
  community forks exist but none adopted upstream.
- **Lezer + DSL-in-JS-string pattern**: the CodeMirror team's reference for
  this is the *mixed-language parser* tutorial (`@lezer/common` `parseMixed`
  + an overlay grammar on tagged templates or heuristic string detection).
  No published "lezer-strudel-mini" exists today — would be a Kanopi
  contribution.

---

## 4. Autocomplete — deep dive

### 4.1 strudel.cc (reference implementation)
`autocomplete.mjs` imports `doc.json` — a build-time artifact produced by
`jsdoc` walking `@strudel/core`, `@strudel/tonal`, `@strudel/webaudio` etc.
Each doc entry has `{name, longname, description, params:[{name,type,description}], examples, synonyms_text, kind, tags}`.
The completion source:
1. Filters `isValidDoc` (drops names starting with `_` and `kind === 'package'`).
2. Maps each doc → `{ label, apply, info: Autocomplete(doc) }` where `info`
   is an HTML node rendered via tagged-template `h\`…\`` helper.
3. Adds `soundMap` keys (loaded sample names) and `Scale.*` (Tonal scales).

Disabled by default (`isAutoCompletionEnabled: false`) but a one-click toggle.

### 4.2 vscode-tidalcycles (CodeHelp)
Configurable detail level; hover and completion share the same data store. No
Haskell LSP; it's a static registry shipped with the extension, generated
from Tidal's Haddocks in `submodules/tidal.pegjs` and Haddock output.

### 4.3 Atom / Pulsar
`lib/autocomplete-provider.js` exposes an `autocomplete.provider@4.0.0`
service; the data is a static JSON of Tidal functions + dirt-sample names
crawled from the SuperDirt path.

### 4.4 Vim / Neovim
No plugin-specific completion engine; users rely on
`coc-tidal` / `haskell-language-server` + the `:TidalGenerateCompletions`
Dirt dictionary.

### 4.5 Type-aware completion
- **Haskell LSP** (`haskell-language-server`): users of `vscode-tidalcycles`
  sometimes pair HLS with the extension for type-aware Tidal completion.
  Neither Atom/Pulsar nor vim-tidal ship it by default.
- **TypeScript LSP**: not applicable to strudel.cc (plain `.mjs` files); no
  editor in this list does type-aware JS completion for Strudel.

---

## 5. Mini-notation — exhaustive token reference

| Token | Meaning | atom/pulsar highlight | vscode highlight | strudel.cc (runtime highlight) | **Kanopi today** |
|---|---|---|---|---|---|
| `bd sd` (space) | sequence | ✅ | ✅ | ✅ (each token outlined) | ❌ (plain string) |
| `[bd sd]` | sub-group | ✅ bracket scope | ✅ | ✅ | ❌ |
| `<a b c>` | alternation per cycle | ✅ | ✅ | ✅ | ❌ |
| `a*3` | repeat N times | ✅ op | ✅ | ✅ | ❌ |
| `a/3` | slow by N | ✅ op | ✅ | ✅ | ❌ |
| `a!3` | replicate | ✅ op | ✅ | ✅ | ❌ |
| `a?` | random drop | ✅ op | ✅ | ✅ | ❌ |
| `a?0.3` | weighted drop (strudel) | — | — | ✅ | ❌ |
| `a@3` | elongate | ✅ op | ✅ | ✅ | ❌ |
| `a:2` | sample index | ✅ op | ✅ | ✅ | ❌ |
| `a'min7` | chord (strudel) | — | — | ✅ | ❌ |
| `a . b` | dot = euclid concat (tidal) | ✅ | ✅ | partial | ❌ |
| `~` | rest | ✅ atom | ✅ | ✅ | ❌ |
| `a | b` | stack (tidal `$`) | ✅ | ✅ | ✅ | ❌ |
| `a,b` | inner-group stack | ✅ | ✅ | ✅ | ❌ |
| `0..7` | range | ✅ number | ✅ | ✅ | ❌ |
| `a(3,8)` | euclid | ✅ | ✅ | ✅ | ❌ |
| `a(3,8,1)` | euclid w/ rotate | ✅ | ✅ | ✅ | ❌ |
| `-1 0 1` | negative numbers | ✅ | ✅ | ✅ | ❌ |
| `c4 c#5` | note names | ✅ | ✅ | ✅ | ❌ |

None of these tokens are currently distinguished inside strings in Kanopi.

---

## 6. Kanopi gap analysis

Per-row verdict referencing current source.

| Row | Kanopi today | Source | Status | Action |
|---|---|---|---|---|
| Eval block `Ctrl+Enter` | `extractBlock` (blank-line paragraph) | `CMEditor.svelte:48-62` | ✅ | — |
| Eval line `Shift+Enter` | single-line eval + flash | `CMEditor.svelte:64-76` | ✅ | — |
| Eval whole file | not bound | — | ❌ | add `Ctrl+Shift+Enter` → evaluate entire doc (Flok-style `evaluateDocument`) |
| Hush all `Ctrl+.` | editor + global | `CMEditor.svelte:46`, `bindings.ts:29` | ✅ | also bind `Ctrl+Alt+H` (vscode) and `Shift+Ctrl+H` (atom) as aliases |
| Per-orbit `Ctrl+N` | per-actor exists, not per-orbit | `strudel.ts:50-63` (slot-per-actor) | ❌ | map `Ctrl+1…9` to `core.stopActor(n)` for the first N actors of the active scene |
| Unmute-all `Ctrl+0` | — | — | ❌ | re-activate all actors of the active scene |
| Eval with copy | — | — | ❌ | P3 (atom nostalgia only) |
| Block flash green/red | green flash on eval | `eval-flash.ts`, `CMEditor.svelte:59,73` | ✅ | extend with red flash on error (already has `ok` variant, add `err`) |
| Command palette | `Mod+K` / `Mod+Shift+P` | `CMEditor.svelte:44-45` | ✅ | — |
| Boot status pill | Strudel only | `StrudelStatusPill.svelte:1-25` | ✅ | add Hydra + future SC pills |
| `BootTidal.hs` equivalent | — | — | ❌ | accept a `_boot.js` / `_prelude.js` actor prepended to composite in `strudel.ts:53` |
| Syntax highlighting | JS grammar, no mini-notation | `lang-resolver.ts:7-24` | 🟡 | Lezer overlay for mini-notation inside JS strings (see §8) |
| Function-registry completion | — | — | ❌ | ship a Strudel doc registry + CM `autocompletion()` source (see §8) |
| Mini-notation event highlight | — | — | ❌ | integrate `@strudel/codemirror`'s `highlight.mjs` pipeline, fed from the adapter |
| Pattern viz / scope / piano-roll | — | — | ❌ | embed `@strudel/draw` canvas (`scope`, `spectrum`, `pianoroll`) |
| Sample browser | placeholder | — | ❌ | list `soundMap` keys in the Library activity |
| Inline error squiggles | none | — | ❌ | CM `@codemirror/lint` source from `ast.ts` diagnostics + runtime eval errors |
| Hover docs / signature help | — | — | ❌ | reuse doc.json via `hoverTooltip` |
| Snippets | — | — | ❌ | CM `snippetCompletion()` for top-20 Tidal/Strudel idioms |
| Session outline | resolver-level data only | `resolver.ts:29-122` | 🟡 | expose as "Outline" activity (actors / scenes / maps tree) |
| Multiplayer | — | — | ❌ | out of Phase 1 scope |

---

## 7. Roadmap — tiered

### Tier 1 — zero-regression baseline (must-have before soft launch)

| # | Item | Effort | Rationale |
|---|---|---|---|
| T1.1 | Bind `Ctrl+Shift+Enter` = evaluate whole file (Flok semantics) | 0.5 h | vim-tidal, atom-tidalcycles, Flok all have it |
| T1.2 | Bind `Ctrl+1`…`Ctrl+9` to toggle mute of the N-th actor in the active scene; `Ctrl+0` = unmute all | 2 h | closest analogue to atom/vscode `dN` mute |
| T1.3 | Alias `Ctrl+Alt+H` and `Shift+Ctrl+H` to hush | 0.2 h | muscle memory from vscode + atom |
| T1.4 | Red flash variant on eval error (extend `eval-flash.ts` with `err` tone) | 1 h | already have green, parity with strudel flash |
| T1.5 | Mini-notation **static** highlight inside JS strings — Lezer overlay (see §8) | 6–8 h | single largest visible regression vs atom/vscode |
| T1.6 | Strudel function autocompletion — import `doc.json` from `@strudel/codemirror` and install `autocompletion()` source | 3–4 h | vscode "CodeHelp" + strudel.cc parity |
| T1.7 | Inline error squiggles via `@codemirror/lint` reading `ast.ts` diagnostics + Strudel eval errors | 3 h | vscode users expect this |
| T1.8 | `_prelude.js` per-session convention, prepended to Strudel composite | 1 h | `BootTidal.hs` analogue |

Tier 1 total: **~17–21 h**.

### Tier 2 — strudel.cc polish parity

| # | Item | Effort |
|---|---|---|
| T2.1 | Runtime mini-notation event highlighting — port `@strudel/codemirror/highlight.mjs` pipeline; surface `haps` stream from adapter | 4–6 h |
| T2.2 | `@strudel/draw` canvas (pianoroll, scope, spectrum) as a bottom panel auto-attached to active actor | 4 h |
| T2.3 | Hover tooltip with function docs from `doc.json` | 1.5 h |
| T2.4 | Sample browser in Library activity (lists loaded `soundMap`) | 2 h |
| T2.5 | Snippet pack (`bd sd`, euclid `(3,8)`, `stack`, `struct`, `every`, `jux rev`…) | 1.5 h |
| T2.6 | Outline activity — actors / scenes / maps from `resolver.ts` | 2 h |
| T2.7 | Vim/Emacs keymap presets (à la `@strudel/codemirror` `keybindings.mjs`) | 2 h |

Tier 2 total: **~17–21 h**.

### Tier 3 — Kanopi-specific wins

| # | Item | Effort |
|---|---|---|
| T3.1 | Per-actor scope mini-visualizer next to each actor tab | 3 h |
| T3.2 | Hardware-binding autocomplete: typing `@map cv1→` auto-suggests actor params from AST | 2 h |
| T3.3 | Scene-aware command palette: "solo scene X", "toggle actor Y" driven by AST | 2 h |
| T3.4 | `.tidal` mode routed to **BPx** (when the bpscript engine lands) — unique to Kanopi | 4–6 h |
| T3.5 | Shared-session mode via Yjs on top of the dispatcher (Flok parity, but AST-aware) | 8–12 h |
| T3.6 | MIDI-learn overlay triggered from `@map` line | 3 h |
| T3.7 | osc-bridge status pill next to `StrudelStatusPill` | 1 h |

---

## 8. Implementation notes — grammar + autocomplete

### 8.1 Grammar stack — recommendation

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Pure Lezer native | fast, incremental, best CM6 citizen; can use `parseMixed` to overlay a mini-notation sub-grammar inside JS string literals (and inside template literals on `\`…\``) | must write + maintain a Lezer grammar for mini-notation (new artifact) | **recommended** |
| Tree-sitter WASM | can reuse `tree-sitter-haskell` for real `.tidal`; large grammars exist | CM6 integration is awkward (no first-class support; `@codemirror/tree-sitter` is third-party and stale), WASM weight ~400 kB | only if we add real `.tidal`/Haskell support |
| Regex overlay on top of `lang-javascript` | dirt-simple, ~150 LoC | can't produce a real AST; fragile on nested `[<>]`; no downstream use | fallback Tier-1 stopgap |

**Recommended path**
1. **T1.5 stopgap**: regex `ViewPlugin.fromClass` that walks JS string literals (detect via `syntaxTree(view.state).iterate`, filter `node.name === 'String'`), tokenizes the content with a hand-written mini-notation lexer, emits `Decoration.mark` ranges with CSS classes `.mini-op`, `.mini-rest`, `.mini-bracket`, `.mini-number`, `.mini-chord`, `.mini-sample`. Ship within a day; visually identical to atom.
2. **T2.x upgrade**: author `@kanopi/lezer-mini` (Lezer grammar for mini-notation proper), wire with `parseMixed` so syntax tree of `lang-javascript` descends into strings that look like mini-notation (heuristic: string contains any of `[<>~*/:@!?|]` and no HTML). This gives real tokens to the highlighter *and* enables completion inside strings (sample names, chord names, numeric ranges).

### 8.2 How strudel.cc does it (counter-example)
It does **not** grammar-highlight mini-notation — only plays it back (§3.3).
The runtime approach is elegant *when you have a scheduler feeding `haps`*;
Kanopi's adapter already has access to Strudel's `haps` if we expose the
pattern handle per actor (today we `composite()` and throw away the handle —
need to keep it and forward `onTrigger` to a Kanopi bus). Combining **both**
approaches (Tier 1 static + Tier 2 event-timed) would make Kanopi strictly
better than any single reference editor.

### 8.3 Parsing mini-notation inside JS strings

- **Tagged template approach (not used by Strudel)**: `` mini`bd sd*2` `` would
  let Lezer `parseMixed` descend cleanly. Clean, but breaks compat with
  existing Strudel patterns that use plain `"…"`.
- **Heuristic string detection (recommended)**: after the Lezer JS parser
  produces a `String` node, run `parseMixed` with a predicate that returns
  the mini-notation nested parser only if the string content matches
  `/[~<>\[\]*/@!?:|]/` (quick filter) AND the string is the first positional
  arg to a known patterning call (`s`, `note`, `n`, `sound`, `scale`,
  `stack`…). The call context check avoids coloring unrelated strings.
- **Runtime sub-parser** (same pipeline strudel.cc uses for animation):
  `@strudel/mini` exports `mini(str)` that returns the pattern AST with
  source offsets; can be invoked from a CM `ViewPlugin` on doc change for
  static highlighting too. Extra dep, but ~10 kB and battle-tested.

### 8.4 Source for the Strudel function registry

- `@strudel/codemirror@1.3.0/autocomplete.mjs` imports `../../doc.json`, which
  is emitted by `pnpm run doc` at the monorepo root (runs `jsdoc` over
  `packages/core`, `packages/tonal`, `packages/webaudio`, `packages/xen`).
- Copy `doc.json` into `packages/ui/src/lib/runtimes/strudel-docs.json`
  (pin to the Strudel version we depend on), or fetch at build-time from a
  known release tag. Feed it into a CM `autocompletion()` source identical
  to `autocomplete.mjs`'s `Autocomplete(doc)` HTML renderer.
- For sample names, call `@strudel/webaudio`'s internal `getSoundMap()` after
  `samples()` resolves (`strudel.ts:37`) and merge the keys into the
  completion list — gives sample autocomplete that updates as the user
  `samples(...)` new banks.

### 8.5 Feeding actor / scene names into completion

- `resolver.ts:29` returns `{actors, scenes, mappings, diagnostics}`. Wire a
  store (`session.actors$`, `session.scenes$`) exposing them to any CM
  extension.
- Inside Kanopi session `.kanopi` files: the custom `kanopiLanguage`
  (`lang-kanopi.ts`) should install an `autocompletion()` source that, on
  contexts like `@scene Foo [` or `@map cv1 → @actor `, returns the current
  actor/scene names verbatim.
- Inside Strudel/Tidal actor files: completion source resolves `$:`, `hush()`,
  and—Kanopi-specific—actor cross-references (e.g. `@bass.note` proposals
  for our upcoming inter-actor modulation syntax).

---

## 9. Out of scope in Phase 1 (require osc-bridge / Tauri / BPx)

- Real **GHCi + SuperDirt** (Tidal proper).
- **Ableton Link** clock sync.
- **JACK / CoreAudio** audio routing beyond Web Audio.
- **MIDI clock out** to external gear.
- `BootTidal.hs` semantics — we approximate via `_prelude.js`.

Kanopi marketing copy should be explicit: *"Kanopi is the browser-native IDE
for Tidal/Strudel live coders. Runs Strudel today; native Tidal via the
Phase 2 osc-bridge."*
