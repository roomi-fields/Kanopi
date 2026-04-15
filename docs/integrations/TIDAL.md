# Integration audit — TidalCycles / Strudel

**Status:** v0.1 draft · target audience: existing Tidal/Strudel live coders.

The goal: when a Tidal user opens Kanopi, **nothing should feel like a regression**
versus their current workflow. This doc audits the dominant editors and
maps each affordance to Kanopi today.

---

## 1. Reference editors

| Editor                       | Population (estim.) | Backend          | Notes                                 |
|------------------------------|---------------------|------------------|---------------------------------------|
| **atom-tidalcycles**         | historic largest    | GHCi + SuperDirt | Atom EOL → users migrating            |
| **vscode-tidalcycles**       | growing fast        | GHCi + SuperDirt | de-facto successor of atom plugin     |
| **pulsar-tidalcycles**       | small, Atom fork    | GHCi + SuperDirt | drop-in for atom-tidalcycles users    |
| **vim-tidal / nvim plugins** | niche power users   | GHCi + SuperDirt | tmux-based send-to-repl               |
| **Estuary**                  | online, multiplayer | server-side      | shared sessions, multi-language       |
| **strudel.cc / Strudel REPL**| growing fast        | browser only     | JS port, no Haskell                   |
| **Flok**                     | online              | browser + server | Estuary-like, multi-language          |

For Phase 1 (browser-only), Kanopi is in the same arena as **strudel.cc** and **Flok**.
Kanopi cannot match `atom-tidalcycles` until v2 (bridge to local GHCi).

---

## 2. Conventions Tidal users expect

### Evaluation
- **Ctrl+Enter** → evaluate current "block" (paragraph, lines separated by blank lines).
- **Shift+Enter** → evaluate current line (atom-tidalcycles convention).
- **Ctrl+. / Ctrl+Alt+H** → `hush` all (mute all orbits).
- **Ctrl+Alt+0..9** → silence orbit `dN` only.
- **Ctrl+Shift+Enter** → evaluate the WHOLE file (re-bootstrap).

### Output / feedback
- A **post window** showing GHCi stdout, errors, and "loaded" confirmations.
- Visible **"loaded"** flash/highlight on the evaluated block (atom-tidalcycles
  briefly highlights the block).
- **Boot status** indicator: GHCi running? SuperDirt loaded?

### Transport
- BPM/cps control (some plugins expose a BPM knob, others rely on inline code).
- Pattern visualizer (only in strudel.cc — animated mini-piano-roll above the editor).

### Snippets / library
- atom-tidalcycles ships starter `BootTidal.hs` + sample patterns.
- strudel.cc has built-in tutorials and a code library at `strudel.cc/learn`.

### Errors
- Compile errors should be **inline** in the post panel with line numbers
  pointing to the offending line in the editor.

---

## 3. What Kanopi has today

| Feature                          | Status   | Notes                                                       |
|----------------------------------|----------|-------------------------------------------------------------|
| Block evaluation (Ctrl+Enter)    | ✅        | extractBlock matches paragraph                              |
| Line evaluation (Shift+Enter)    | ❌        | not bound; defaultKeymap inserts newline                    |
| Hush all (Ctrl+.)                | partial  | Stop button in topbar = hush; no shortcut bound             |
| Per-orbit silence                | ❌        | Strudel pattern handles not tracked per actor               |
| Whole-file re-eval               | partial  | toggle actor off/on re-evaluates                            |
| Post window                      | ✅        | Console panel forwards `[strudel] eval ok`, errors          |
| "Loaded" highlight               | ❌        | no flash on the block after eval                            |
| Boot status                      | partial  | first eval loads samples (~1 MB); only logged in console    |
| BPM control                      | ✅        | topbar transport drives Strudel cps                         |
| Pattern visualizer               | ❌        | no piano-roll / mini-canvas of the pattern                  |
| Errors inline                    | partial  | Strudel errors logged in Console; not surfaced in editor    |
| Sample library / tutorials       | ❌        | only fixture files                                          |
| `BootTidal.hs` equivalent        | ❌        | no boot file convention yet                                 |

---

## 4. Gap analysis (no-regression list)

These are the **must-haves** so a Tidal/Strudel user doesn't feel they lost
something coming to Kanopi.

### P0 (critical for the audit)
- **Shift+Enter = eval current line** (single-line, no extractBlock).
- **Ctrl+. = hush all** (global stop, equivalent to `hush()` in Strudel).
- **Block-flash on eval** (briefly highlight the evaluated range in the editor
  for ~250 ms, color = green ok / red error).
- **Boot status pill** in topbar or status bar: shows "loading samples…",
  "ready", "error" for Strudel.

### P1 (matches strudel.cc polish)
- **Per-actor mute/solo** (Strudel `dN` orbit equivalent — needs tracking
  pattern handles per actor). Currently `hush()` is global.
- **Pattern visualizer** below or above the editor for the active actor
  (mini-piano-roll, ~120 px tall, shows N seconds ahead).
- **Inline error squiggles** in the editor pointing at the offending line/col
  (we already have ranges in the AST; needs CM6 linter integration).

### P2 (nice-to-have)
- **Tutorials / Library** view with curated patches (use existing Library
  activity placeholder).
- **Quick-help on functions**: hover on `s("bd")` → tooltip with mini-doc.
- **Re-bootstrap whole file** as an explicit command (Cmd+Shift+Enter).

---

## 5. Proposed integration steps

1. **Bind missing shortcuts** (Shift+Enter, Ctrl+.) — 30 min.
2. **Block-flash on eval** — green/red transient highlight via a CM6 decoration. ~1 h.
3. **Boot status pill** — Strudel adapter exposes a `status` event ('loading'|'ready'|'error'). Topbar component subscribes. ~1 h.
4. **Per-actor pattern handles** — Strudel adapter tracks `repl.evaluate` returned handles per `actorId`, allowing per-actor silence. ~2 h.
5. **Pattern visualizer** — embed `@strudel/draw` (the mini-canvas used on strudel.cc). ~3 h.
6. **Inline error squiggles** — wire AST diagnostics into a CM6 linter. ~2 h (parser side already done).

Total to no-regression P0: **~3-4 h**.

---

## 6. Out of scope (browser-only)

These cannot be addressed in Phase 1; they require the bridge (v2):
- Real **GHCi + SuperDirt** (Tidal proper). Strudel is the substitute.
- **Ableton Link** clock sync.
- Sending audio to **JACK / system audio** beyond Web Audio.
- **MIDI clock out** to drive external gear (P1 in our roadmap).

We should be explicit about this in marketing copy: "Kanopi is the Tidal IDE
for the browser, with the Strudel runtime. Your `atom-tidalcycles`
patterns will mostly work after the Haskell→JS port; for native Tidal use
the v2 bridge (coming Q4 2026)."
