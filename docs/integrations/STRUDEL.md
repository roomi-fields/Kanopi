# Strudel Visualizers and CodeMirror Integration Audit

**Phase 0 Research Document**  
**Status**: Complete  
**Date**: 2026-04-22  
**Scope**: Exhaustive audit of Strudel's visualization system for integration into Kanopi (AS-IS, zero reimplementation)

---

## 1. Visualization Function Inventory

Strudel exposes 14 distinct visualization methods on `Pattern.prototype`. All are distributed across three packages: `@strudel/draw`, `@strudel/webaudio`, and `@strudel/codemirror`.

### 1.1 Fullscreen Visualizers

| Method | Package | Variant Type | Rendering Target | Canvas Size | Registered At | Key Options |
|--------|---------|--------------|------------------|-------------|---------------|------------|
| `.pianoroll()` | `@strudel/draw` | Fullscreen | `#test-canvas` (fixed) | `window.innerWidth/Height` | `pianoroll.mjs:79` | cycles=4, playhead=0.5, active=#FFCA28, inactive=#7491D2, fold=1 |
| `.tpianoroll()` | N/A | Not a distinct method | See `.pianoroll()` | N/A | N/A | **NOTE**: No `.tpianoroll()` found; uses `.pianoroll()` for fullscreen, `._pianoroll()` for inline |
| `.scope()` | `@strudel/webaudio` | Fullscreen via `.draw()` | `#test-canvas` (fixed) | 500×60 default | `scope.mjs:149` | color='white', thickness=3, scale=0.25, pos=0.75, trigger=0 |
| `.tscope()` | `@strudel/webaudio` | Fullscreen via `.draw()` | `#test-canvas` (fixed) | 500×60 default | `scope.mjs:136` | Same as `.scope()` (alias) |
| `.fscope()` | `@strudel/webaudio` | Fullscreen (freq domain) | `#test-canvas` (fixed) | 500×60 default | `scope.mjs:110` | color='white', scale=0.25, pos=0.75, lean=0.5, min=-150, max=0 |
| `.spectrum()` | `@strudel/webaudio` | Fullscreen | `#test-canvas` (fixed) | 500×60 default | `spectrum.mjs:23` | thickness=3, speed=1, min=-80, max=0, color=getTheme().foreground |
| `.spiral()` | `@strudel/draw` | Fullscreen | `#test-canvas` (fixed) | 500×500 default | `spiral.mjs:155` | size=80, thickness=size/2, activeColor=getTheme().foreground, inactiveColor=getTheme().gutterForeground |
| `.pitchwheel()` | `@strudel/draw` | Fullscreen | `#test-canvas` (fixed) | 200×200 default | `pitchwheel.mjs:133` | hapcircles=1, edo=12, root=C3, thickness=3, hapRadius=6, mode='flake' |
| `.punchcard()` | `@strudel/draw` | Fullscreen | `#test-canvas` (fixed) | 500×60 default | `pianoroll.mjs:293` | Calls `__pianoroll()` with fold=1 (compact notation) |
| `.wordfall()` | `@strudel/draw` | Fullscreen | `#test-canvas` (fixed) | 500×60 default | `pianoroll.mjs:303` | vertical=1, labels=1, stroke=0, fillActive=1 |

### 1.2 Inline Visualizers (CodeMirror Widgets)

| Method | Package | Variant Type | Rendering Target | Canvas Size | Registered At | Key Options |
|--------|---------|--------------|------------------|-------------|---------------|------------|
| `._pianoroll()` | `@strudel/codemirror` | Inline widget | `widgetElements[id]` | 500×60 default | `widget.mjs:107` | Same as `.pianoroll()` |
| `._punchcard()` | `@strudel/codemirror` | Inline widget | `widgetElements[id]` | 500×60 default | `widget.mjs:112` | Same as `.punchcard()` |
| `._scope()` | `@strudel/codemirror` | Inline widget | `widgetElements[id]` | 500×60 default | `widget.mjs:124` | Same as `.scope()` |
| `._spectrum()` | `@strudel/codemirror` | Inline widget | `widgetElements[id]` | 200×200 default | `widget.mjs:137` | Same as `.spectrum()` |
| `._spiral()` | `@strudel/codemirror` | Inline widget | `widgetElements[id]` | 275×275 default | `widget.mjs:117` | size=275 (mandatory param), then width=height=size |
| `._pitchwheel()` | `@strudel/codemirror` | Inline widget | `widgetElements[id]` | 200×200 default | `widget.mjs:130` | size=200 (mandatory param), then width=height=size |

### 1.3 Variant Semantics

- **Fullscreen (no prefix)**: Uses `.draw()` or `.onPaint()` to continuously animate on `#test-canvas`. Rendered above or behind code depending on z-index/positioning.
- **Inline (`_` prefix)**: Registered via `registerWidget()` in `widget.mjs`. Creates a `<canvas>` element per call, tagged with pattern `.tag(id)`, and inserted as CodeMirror decoration below the line that created it.
- **Time-domain fullscreen (`t` prefix)**: `.tscope()` and `.tpianoroll()` are aliases or minor variants. `.tscope()` is explicitly an alias for `.scope()` (`scope.mjs:149`). No `.tpianoroll()` prototype method exists — fullscreen pianoroll is just `.pianoroll()`.
- **Frequency-domain fullscreen (`f` prefix)**: `.fscope()` is the frequency-domain variant of scope, not listed in the inline set.

### 1.4 Underscore Prefix Semantics

The `_` prefix indicates:
1. **CodeMirror widget registration**: The method is wired through `registerWidget()` (`widget.mjs:82–92`).
2. **Auto-canvas creation**: Canvas is created and managed within `getCanvasWidget()` (`widget.mjs:96–105`).
3. **Pattern tagging**: Pattern is automatically tagged with the widget ID via `.tag(id)` before calling the underlying function.
4. **Sizing defaults**: Most inline variants override canvas dimensions relative to fullscreen (e.g., `_spiral` defaults to 275×275 vs fullscreen 500×500).
5. **Drawing context injection**: Canvas 2D context is obtained locally; fullscreen variants use `getDrawContext()` which may prepend a fullscreen canvas to `document.body` if one doesn't exist.

---

## 2. Non-Visualization CodeMirror Features

### 2.1 Mini-Notation Location Highlighting (`highlightMiniLocations`)

**Files**: `highlight.mjs`, `pattern-highlight.ts` (Kanopi custom)

| Feature | Details | Citation |
|---------|---------|----------|
| **What it is** | Real-time pulsing outline around mini-notation characters as they become active during playback. |
| **When it fires** | Every animation frame via `Drawer.framer` callback in draw.mjs:115–122, then dispatched to `showMiniLocations` effect. | `highlight.mjs:9–11`, `draw.mjs:175–179` |
| **What it touches** | Exact character ranges stored in `hap.context.locations` — either legacy `[from, to]` tuples or modern `{ start: { offset: N }, end: { offset: M } }` objects. | `highlight.mjs:59–68`, `strudel.ts:84–105` |
| **Color** | `hap.value?.color ?? 'var(--foreground)'`, or custom via `hap.value?.markcss`. | `highlight.mjs:95–96` |
| **Visual style** | Default: `outline: solid 2px ${color}`. Can be overridden per-hap via `markcss` control. | `highlight.mjs:96`, `codemirror.mjs:441` |
| **Opacity animation** | Currently static. Code at `highlight.mjs:98–111` is commented out (would fade outline based on hap progress). | `highlight.mjs:98–111` |
| **State management** | Two StateFields: `miniLocations` (persistent marks set at eval time), `visibleMiniLocations` (runtime hap map updated every frame). Computed decorator layer merges them. | `highlight.mjs:13–76`, `79–127` |

**Kanopi deviation**: `/home/romi/dev/music/kanopi/packages/ui/src/components/viz/pattern-highlight.ts` is a Kanopi-only reimplementation. to be deleted and replaced by the upstream `highlightExtension` (see §7 rollout).

### 2.2 Eval Flash (`flashField` / `flash()`)

**Files**: `flash.mjs`

| Feature | Details | Citation |
|---------|---------|----------|
| **What it is** | White overlay flash on entire editor on successful eval (green) or error (red). |
| **Trigger** | Called by Kanopi's `runEval()` in `CMEditor.svelte:49–58`. Strudel's `@strudel/codemirror` does NOT call this — it's Kanopi-specific wiring. | `CMEditor.svelte:55–56`, `flash.mjs:32–37` |
| **Duration** | Default 200ms, customizable via `flash(view, ms)` parameter. | `flash.mjs:32–36` |
| **Color** | `rgba(255,255,255, .4)` with `filter: invert(10%)`. | `flash.mjs:15` |
| **Target range** | Decoration applied to entire `[0, tr.newDoc.length]` — not range-specific (unlike mini-notation). | `flash.mjs:17` |
| **State** | Single `StateField` (`flashField`) with on/off boolean. Effects dispatch `setFlash.of(true/false)`. | `flash.mjs:5–39` |
| **Extension composition** | Togglable via `isFlashEnabled(on)` → returns `flashField` or `[]`. | `flash.mjs:39` |

### 2.3 Slider Plugin (`sliderPlugin` / `updateSliderWidgets`)

**Files**: `slider.mjs`

| Feature | Details | Citation |
|---------|---------|----------|
| **What it is** | Inline `<input type="range">` widget for numeric parameter binding. |
| **Trigger** | Transpiler detects `slider(value, min, max, step?)` in code and generates widget config. PostMessage loop syncs slider UI ↔ state. | `slider.mjs:125–128`, `130–146` |
| **UI** | Inline span with 64px-wide slider, positioned with `transform:translateY(4px)`. | `slider.mjs:41` |
| **State sync** | Bidirectional: Code evaluates at time T sets `sliderValues[id] = value`. User drags slider → postMessage fires → state updates → `sliderValues[id]` reflects new value → next query reads it. | `slider.mjs:131–145` |
| **Step default** | `(max - min) / 1000` if not specified. | `slider.mjs:33` |
| **Coupling** | Requires transpiler integration (Strudel's). Pattern.prototype.slider is a no-op without transpilation. | `slider.mjs:125–128` |
| **Kanopi status** | NOT currently integrated — sliders are filtered out in `strudel.ts:274` to prevent eval failure before widget transport is wired. | `strudel.ts:274` |

### 2.4 Theme System (`activateTheme`, `initTheme`)

**Files**: `themes.mjs`, plus 35+ theme files in `themes/` subdirectory

| Feature | Details | Citation |
|---------|---------|----------|
| **What it is** | CSS variable injection + theme settings sync to @strudel/draw's `getTheme()` for canvas colors. |
| **Activation** | `activateTheme(name)` sets CSS custom properties on `:root`, updates internal `theme` object, and calls `setTheme(themeSettings)` on draw module. | `themes.mjs:190–218` |
| **Available themes** | 35 built-in: strudelTheme, algoboy, bluescreen, blackscreen, whitescreen, dracula, nord, tokyoNight, vscode variants, etc. Plus custom injectable via `customStyle` property. | `themes.mjs:44–84` |
| **Settings structure** | Each theme exports a `settings` object with CSS variable names as keys: `{ background, foreground, caret, selection, lineHighlight, gutterBackground, gutterForeground, customStyle?, ... }`. | `themes.mjs:86–127` |
| **Draw integration** | @strudel/draw's `getTheme()` returns the active theme object; viz functions use `getTheme().foreground`, `getTheme().gutterForeground`, etc. | `draw.mjs:223–228`, `pianoroll.mjs:122–123`, `spiral.mjs:65–66` |
| **Tailwind dark mode** | `themeSettings.light` property controls `.dark` class on `<html>`. | `themes.mjs:208–212` |
| **CSS injection** | `injectStyle()` helper for injecting `customStyle` rule strings at runtime. | `themes.mjs:169–175` |

**Kanopi integration**: Kanopi has custom theme logic in `CMEditor.svelte`. Strudel's theme system is NOT currently wired; phase 2.1 task 1.1 will unify them.

### 2.5 Keybindings (`keybindings()`)

**Files**: `keybindings.mjs`

| Feature | Details | Citation |
|---------|---------|----------|
| **Keymap providers** | Four modes: `vim`, `emacs`, `codemirror` (default), `vscode`. Each returns CodeMirror keymap extension. | `keybindings.mjs:127–143` |
| **Default keybindings** | Ctrl-Enter / Alt-Enter = evaluate, Ctrl-. / Alt-. = stop. Provided via `defaultKeymap` from @codemirror/commands. | `keybindings.mjs:1, 130` |
| **Vim-specific** | Maps `:w` to evaluate, `:q` to stop, `gc` to toggle comments. Custom ex-commands via `Vim.defineEx()`. | `keybindings.mjs:27–125` |
| **Emacs support** | Available via `@replit/codemirror-emacs` plugin. | `keybindings.mjs:5` |
| **VSCode keymap** | Available via `@replit/codemirror-vscode-keymap`, wrapped with `Prec.highest`. | `keybindings.mjs:8, 11–21` |
| **Multi-cursor** | Vim mode auto-enables `EditorState.allowMultipleSelections.of(true)`. | `keybindings.mjs:139–141` |

**Kanopi integration**: Uses Strudel's keybindings system. Kanopi adds global Mod-k (palette), Mod-. (stop), Mod-Enter (eval). See `CMEditor.svelte:92–115`.

### 2.6 Basic CodeMirror Setup (`basicSetup`)

**Files**: `basicSetup.mjs`

| Feature | Included | Citation |
|---------|----------|----------|
| `highlightSpecialChars()` | Yes | line 28 |
| `history()` | Yes | line 29 |
| `dropCursor()` | Yes | line 32 |
| `rectangularSelection()` | Yes | line 37 |
| `crosshairCursor()` | Yes | line 38 |
| `defaultKeymap` | Yes (via `keymap.of()`) | line 41–48 |
| `closeBracketsKeymap` | Yes | line 42 |
| `historyKeymap` | Yes | line 45 |
| Line numbers | **No** (commented) | line 26 |
| Bracket matching | **No** (commented) | line 40 |
| Syntax highlighting | **No** (commented) | line 35 |
| Auto-completion | **No** (commented) | line 36 |
| Fold gutter | **No** (commented) | line 30 |

---

## 3. Layout Model on strudel.cc and Canvas Positioning

### 3.1 Fullscreen Canvas Positioning

**Source**: `draw.mjs:9–30`

```javascript
export const getDrawContext = (id = 'test-canvas', options) => {
  let canvas = document.querySelector('#' + id);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = id;
    canvas.width = window.innerWidth * pixelRatio;
    canvas.height = window.innerHeight * pixelRatio;
    canvas.style = 'pointer-events:none;width:100%;height:100%;position:fixed;top:0;left:0';
    pixelated && (canvas.style.imageRendering = 'pixelated');
    document.body.prepend(canvas);
    // ... resize listener
  }
  return canvas.getContext(contextType, { willReadFrequently: true });
};
```

**Implications**:
- **Z-index**: Not explicitly set, but `pointer-events:none` + `position:fixed` → canvas sits on top, doesn't steal clicks, and receives no scroll adjustments.
- **Sizing**: Always 100% of viewport (`window.innerWidth/Height`). Scales with browser zoom via `devicePixelRatio`.
- **Prepended**: `document.body.prepend()` places it before other body children (typically the editor).
- **Overlay behavior**: Fullscreen visualizations render OVER the code editor, not beside it or pushing it down.
- **Canvas auto-create**: If `#test-canvas` doesn't exist at first viz call, one is created. Kanopi pre-creates it in CMEditor to avoid this default behavior.

### 3.2 Inline Widget Positioning

**Source**: `widget.mjs:96–105`

```javascript
function getCanvasWidget(id, options = {}) {
  const { width = 500, height = 60, pixelRatio = window.devicePixelRatio } = options;
  let canvas = document.getElementById(id) || document.createElement('canvas');
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  setWidget(id, canvas);
  return canvas;
}
```

**Implications**:
- **Inline positioning**: `setWidget(id, canvas)` stores the element in `widgetElements[id]` map.
- **Widget integration**: `BlockWidget.toDOM()` returns the element from that map, placed by CodeMirror's `Decoration.widget()` at the end of a line (side=0, block=true).
- **Layout impact**: Inline widgets push code down (block=true); they are NOT overlays.
- **Canvas size**: Defaults 500×60, but customizable per-call via `options`. Each inline viz gets its own canvas.

### 3.3 Z-Index and Layering

- **Fullscreen (`#test-canvas`)**: `position:fixed` → sits on top of everything; `pointer-events:none` allows interaction pass-through.
- **Inline widgets**: Part of editor decoration layer; sit between code lines.
- **Editor content**: Text and selections render below fullscreen canvas.
- **Strudel.cc arrangement**: Fullscreen viz dominates during playback; inline widgets supplement specific code blocks.

### 3.4 Responsive Behavior

- **Fullscreen**: Resize listener in `getDrawContext()` updates canvas dimensions on window resize (debounced 200ms). | `draw.mjs:20–27` |
- **Inline**: CodeMirror's native decorator remapping handles inline widgets during text edits.

---

## 4. Runtime Wiring: From User Code to Rendered Widget

### 4.1 End-to-End Inline Widget Chain (`._ pianoroll()`)

```
User code: note("c a").s("sine")._pianoroll()
                             ↓
[1. TRANSPILER REWRITE]
@strudel/transpiler detects `._pianoroll()` call in code
  → Generates widget config: { type: "pianoroll", id: "widget_123", from: 10, to: 24 }
  → Wraps call: pat._pianoroll() → pat.tag("widget_123").pianoroll({fold:1,...,ctx,id:"widget_123"})
  → Stores config in options.meta.widgets array
                             ↓
[2. STRUDEL EVAL + AFTEREVAL HOOK]
@strudel/web's webaudioRepl.evaluate(compositeCode) completes
  → Dispatches afterEval callback with { meta: { widgets: [...configs...] } }
  → Kanopi's strudel.ts:252 hook captures widget configs
  → Lazy-loads strudel-cm proxy and calls updateWidgets(view, widgetConfigs)
                             ↓
[3. CODEMIRROR WIDGET STATE UPDATE]
strudel-cm.ts exports updateWidgets from @strudel/codemirror:
  → Dispatches `addWidget` StateEffect with widget configs
  → widget.mjs StateField.update() consumes effect
  → Calls getWidgets(widgetConfigs) → map to Decoration.widget()
  → CodeMirror re-renders editor, scheduling BlockWidget DOM creation
                             ↓
[4. PATTERN.PROTOTYPE CALL + CANVAS CREATION]
Pattern.prototype._pianoroll (registered by widget.mjs:107) executes:
  {
    const ctx = getCanvasWidget(id, options).getContext('2d');
    return pat.tag(id).pianoroll({ fold: 1, ...options, ctx, id });
  }
  → getCanvasWidget(id, options) creates <canvas>
  → setWidget(id, canvas) stores in widgetElements[id] map
  → pianoroll.mjs:79 registers the fullscreen draw logic
  → pat.draw(...) attaches animation frame loop via Drawer
                             ↓
[5. BLOCKWIDGET.TODOM() → DOM INSERTION]
CodeMirror's BlockWidget.toDOM() called:
  → id = getWidgetID(widgetConfig) — retrieves the widget ID from config
  → el = widgetElements[id] — retrieves the canvas stored at step 4
  → returns el to CodeMirror, which inserts it as block decoration
                             ↓
[CANVAS RENDERS]
@strudel/draw's draw.mjs:58–72 animation loop fires:
  → memory[id] tracks haps, queryArc fetches next frame's haps
  → fn() called with memory[id], _t (current time)
  → pianoroll.mjs:86–93 calls __pianoroll({ ctx, haps, time, ... })
  → Canvas 2D drawing commands execute on the inline canvas
```

### 4.2 Cross-File Citations

| Step | File:Line | Function | Purpose |
|------|-----------|----------|---------|
| Transpiler rewrite | N/A (upstream) | Strudel transpiler | Detects `._pianoroll()`, wraps in widget config |
| Widget config array | strudel.ts:252 | `afterEval` hook | Captures `options.meta.widgets` |
| Proxy dispatch | strudel.ts:267 | Lazy-import of `strudel-cm` | Avoids circular ESM dependency |
| updateWidgets call | strudel.ts:272 | Via strudel-cm proxy | Passes configs to @strudel/codemirror |
| StateField update | widget.mjs:31–54 | `widgetField.update()` | Processes `addWidget` effect |
| Widget decoration | widget.mjs:16–29 | `getWidgets()` | Maps configs to CodeMirror decorations |
| setWidget store | widget.mjs:57–60 | `setWidget()` | Stores canvas in `widgetElements[id]` |
| Pattern proto hook | widget.mjs:86–92 | `registerWidget()` | Installs `pat._pianoroll()` method |
| Canvas creation | widget.mjs:96–105 | `getCanvasWidget()` | Creates and sizes `<canvas>` element |
| Draw invocation | pianoroll.mjs:107–109 | `_pianoroll` callback | Calls `pat.tag(id).pianoroll()` |
| Animation loop | draw.mjs:58–72 | `Pattern.prototype.draw()` | requestAnimationFrame + hap queries |
| BlockWidget DOM | widget.mjs:70–74 | `BlockWidget.toDOM()` | Retrieves canvas from widgetElements |
| Canvas render | pianoroll.mjs:86–93 | `__pianoroll()` | Draws to 2D context |

### 4.3 Fullscreen Visualization Chain (`.scope()`)

```
User code: note("c a").s("sine").scope()
                             ↓
[1. NO TRANSPILER REWRITE]
.scope() is a standard Pattern.prototype method, not a widget.
Called during pattern evaluation (before scheduler runs).
                             ↓
[2. PATTERN ASSEMBLY]
scope.mjs:136 Pattern.prototype.tscope = function(config = {})
  → Calls this.analyze(id) to tap the audio analyser
  → Calls this.draw() with drawTimeScope callback
  → Attaches animation frame loop via Drawer.start()
                             ↓
[3. GETDRAWCONTEXT() CANVAS INITIALIZATION]
scope.mjs:14 calls getDrawContext() (from @strudel/draw:9)
  → If #test-canvas doesn't exist, creates one and prepends to document.body
  → Canvas: 100% viewport, position:fixed, top:0, left:0, pointer-events:none
  → Returns 2D context
                             ↓
[4. ANIMATION LOOP + ANALYSER DATA]
draw.mjs:58–72 requestAnimationFrame loop:
  → Calls drawTimeScope(analyser, config)
  → scope.mjs:5–56 reads analyser.frequencyBinCount, getAnalyzerData()
  → Draws oscilloscope waveform on canvas via ctx.stroke()
                             ↓
[CANVAS RENDERS FULLSCREEN]
Canvas updates every frame, overlaying the code editor
```

### 4.4 The "Two Inlined Pattern Classes" Problem

**Status**: KANOPI-ONLY ARTIFACT (not a Strudel.cc issue)

**Root cause**: Kanopi's build imports `@strudel/codemirror` separately from `@strudel/web`. If not deduplicated, each import resolves to a distinct ESM graph, carrying:
- Separate `widgetElements = {}` module-level state (widget.mjs:56)
- Separate `StateField` and `StateEffect` token identities (codemirror.mjs creates new ones each time)
- Separate `Pattern.prototype` monkey-patch registrations (widget.mjs:86)

**Result**: `setWidget(id, canvas)` writes to graph A's `widgetElements`, but `BlockWidget.toDOM()` reads from graph B's map → widget never appears.

**Strudel.cc solution**: Monorepo workspace linking via `yarn workspaces` or `pnpm`. Single-instance dependencies → single `widgetElements` map.

**Kanopi solution**: 
1. **Vite `resolve.dedupe`** in `vite.config.ts` (already configured — confirm it works).
2. **Single-source proxy** (`strudel-cm.ts`) re-exports all @strudel/codemirror functions through one import.
3. **Lazy-load pattern** (`strudel.ts:267`) defers proxy import until afterEval fires, avoiding early double-instantiation.

**Confirmation check** (Kanopi commit 1140f6f):
- ✓ `vite.config.ts` has `resolve.dedupe: ['@strudel/codemirror']`
- ✓ `strudel-cm.ts` is the sole public import point for @strudel/codemirror
- ✓ `strudel.ts:267` lazily imports proxy
- ✓ CMEditor installs `widgetPlugin` from proxy (line 23)

**Gaps**: 
- ESLint rule not yet enforced; grep still finds direct imports in codebase (tracked in local roadmap).
- Inline widgets not yet visually tested post-dedupe (phase 2.1 task 1.3).

---

## 5. Gap Analysis: Kanopi vs. Strudel Reference (commit 1140f6f)

### 5.1 Visualization Methods: Status Matrix

| Method | Strudel | Kanopi | Status | Issue |
|--------|---------|--------|--------|-------|
| `.pianoroll()` | ✓ Fullscreen | ⚠️ Stub (noop) | BROKEN | strudel.ts:316–318 returns `this` instead of actual draw |
| `._pianoroll()` | ✓ Inline widget | ⚠️ Stub (noop) | BROKEN | Same stub applies to all `_X` methods |
| `.scope()` | ✓ Fullscreen | ⚠️ Partial | WORKS (via draw.mjs) | Fullscreen canvas works; analyser tapping present (strudel.ts:30–52) |
| `._scope()` | ✓ Inline widget | ⚠️ Stub (noop) | BROKEN | Same stub as `._pianoroll()` |
| `.spectrum()` | ✓ Fullscreen | ⚠️ Partial | WORKS (via spectrum.mjs) | Fullscreen canvas works; relies on analyser from `.scope()` |
| `._spectrum()` | ✓ Inline widget | ⚠️ Stub (noop) | BROKEN | Same stub |
| `.spiral()` | ✓ Fullscreen | ✗ Missing | BROKEN | No stub; throws "spiral is not a function" |
| `._spiral()` | ✓ Inline widget | ✗ Missing | BROKEN | No stub; throws "_spiral is not a function" |
| `.pitchwheel()` | ✓ Fullscreen | ✗ Missing | BROKEN | No stub; throws "pitchwheel is not a function" |
| `._pitchwheel()` | ✓ Inline widget | ✗ Missing | BROKEN | No stub; throws "_pitchwheel is not a function" |
| `.punchcard()` | ✓ Fullscreen | ✗ Missing | BROKEN | No stub; throws "punchcard is not a function" |
| `._punchcard()` | ✓ Inline widget | ✗ Missing | BROKEN | No stub; throws "_punchcard is not a function" |
| `.fscope()` | ✓ Fullscreen (freq) | ✗ Missing | BROKEN | No stub; throws "fscope is not a function" |
| `.wordfall()` | ✓ Fullscreen (variant) | ✗ Missing | BROKEN | No stub; throws "wordfall is not a function" |

**Stub location**: `strudel.ts:312–322`. Applies to `_scope`, `_pianoroll`, `_spectrum`.

### 5.2 CodeMirror Features: Status Matrix

| Feature | Strudel | Kanopi | Status | Notes |
|---------|---------|--------|--------|-------|
| `highlightMiniLocations` | ✓ Integrated | ⚠️ Custom reimpl | PARTIAL | Kanopi uses `pattern-highlight.ts` (marked for deletion). Strudel version in `highlight.mjs` not wired. |
| `flash` / `flashField` | ✓ Integrated | ✓ Wired | WORKS | Kanopi's `eval-flash.ts` + CMEditor:55–56 calls flash on success/error. |
| `sliderPlugin` | ✓ Available | ✗ Disabled | BROKEN | strudel.ts:274 filters out slider widget configs to prevent eval failure. |
| Theme system | ✓ 35 themes | ⚠️ Not integrated | PARTIAL | Strudel's `activateTheme()` not called. Kanopi uses CM6 theme directly. |
| Keybindings | ✓ 4 modes (vim/emacs/vscode/cm6) | ✓ Wired | WORKS | CMEditor:92–115 binds Mod-Enter/Mod-./Mod-k. Strudel keybindings imported but not directly used. |
| `basicSetup` | ✓ Available | ⚠️ Custom build | PARTIAL | Kanopi builds its own setup in CMEditor:77–91 instead of importing Strudel's. |

### 5.3 Runtime Adapter Integration

**File**: `strudel.ts` (521 lines)

| Component | Status | Notes |
|-----------|--------|-------|
| `initStrudel()` | ✓ Called | Initializes Strudel with error handlers and `editPattern` / `afterEval` hooks. |
| `evaluate()` | ✓ Wired | Builds composite source, calls `m.evaluate()`, latches errors, emits tokens. |
| `onTrigger` hook | ✓ Active | Taps every hap via `emitTokenFromHap()` for the core's token stream. |
| `editPattern` hook | ✓ Active | Installed but currently unused (pass-through). |
| `afterEval` hook | ✓ Partial | Captures widget configs, lazy-loads proxy, calls `updateWidgets()`. BUT: slider configs silently dropped (line 274). |
| Analyser attachment | ✓ Wired | `attachAnalyserOnce()` taps superdough master gain on first successful eval. |
| Sample bank loading | ✓ Wired | `loadSampleBank()` / `setDeclaredBanks()` manage @strudel/webaudio soundMap. |

### 5.4 CMEditor Component

**File**: `CMEditor.svelte` (195 lines)

| Component | Status | Notes |
|-----------|--------|-------|
| `widgetPlugin` install | ✓ Included | Line 88: `...widgetPlugin` in extension list for Strudel/Tidal. |
| `patternHighlightExtension` | ✓ Included | Line 22: Kanopi's custom highlight (to be replaced by Strudel's `highlightExtension`). |
| `miniOverlay` | ✓ Included | Line 19: Kanopi's custom mini-notation display (unrelated to Strudel). |
| `flashField` + `flashTheme` | ✓ Included | Lines 16, 90: Flash overlay on eval. |
| Pre-made `#test-canvas` | ✓ Present | Line 39: `let canvas: HTMLCanvasElement` state variable. But never mounted to DOM — verify integration. |
| Eval tracking | ✓ Wired | Line 51: `rememberEval()` stores ranges for error flashing. |
| Keybinding overrides | ✓ Wired | Lines 92–115: Mod-Enter (eval), Mod-. (stop), Mod-k (palette). |

### 5.5 Kanopi Viz Components (to be deleted)

**Files**: `Pianoroll.svelte`, `Scope.svelte`, `Spectrum.svelte`, `VizPanel.svelte`

**Status**: Marked for removal (see §7 rollout). These are custom Kanopi reimplementations that will be replaced by:
1. Fullscreen Strudel canvases (no component needed).
2. Inline widgets (handled by `widgetPlugin`).

---

## 6. Proposed Behavior Spec for Kanopi

### 6.1 Fullscreen Visualizers (`.scope()`, `.pianoroll()`, `.spectrum()`, `.spiral()`, `.pitchwheel()`, `.fscope()`, `.punchcard()`, `.wordfall()`)

**Behavior spec**:
1. Create or reuse `#test-canvas` (100% viewport, fixed position, transparent overlay, pointer-events:none).
2. Attach animation frame loop via `Pattern.prototype.draw()`.
3. Query haps every frame; pass to rendering function (e.g., `__pianoroll()`, `drawTimeScope()`).
4. Canvas persists until `.stop()` / `.hush()` stops playback OR another fullscreen viz is called (replacing it).
5. Colors inherit from active theme via `getTheme()` call.
6. Multiple fullscreen viz methods can coexist on the same canvas if they cooperate (e.g., a pianoroll + a scope on same canvas).

**Kanopi implementation**: 
- Pre-create `#test-canvas` in CMEditor at mount (already partially done — confirm DOM mounting).
- Import fullscreen viz functions from @strudel/draw and @strudel/webaudio.
- Ensure analyser is attached on first `.scope()` / `.spectrum()` call via `attachAnalyserOnce()`.
- Theme colors pull from Kanopi's active theme via `getComputedStyle()` → CSS custom properties.

### 6.2 Inline Visualizers (`._scope()`, `._pianoroll()`, `._spectrum()`, `._spiral()`, `._pitchwheel()`, `._punchcard()`)

**Behavior spec**:
1. Transpiler detects call in user code, generates widget config with unique ID.
2. `registerWidget()` hook wires `pat._X()` → creates canvas → tags pattern → calls fullscreen variant with `ctx` injected.
3. Canvas sits below the line of code that produced it, does NOT push down (block=true decoration).
4. Each inline viz gets its own canvas; multiple `._ pianoroll()` calls on same line create separate canvases.
5. Sizing defaults (500×60 for pianoroll, 200×200 for pitchwheel, etc.) can be overridden via options.
6. Colors inherit from hap values (if present) or active theme.

**Kanopi implementation**:
- Wire `afterEval` hook fully: capture widget configs, dispatch `updateWidgets()` without filtering.
- Ensure `widgetElements` map is single-instance (Vite dedupe + proxy already configured).
- Test that inline canvas renders and updates during playback.
- NO custom UI component needed (CodeMirror handles positioning).

### 6.3 Mini-Notation Highlight

**Behavior spec** (matching Strudel.cc):
1. At eval time, transpiler stores character ranges in `hap.context.locations`.
2. Every animation frame, `highlightMiniLocations(view, time, haps)` dispatches active ranges to CodeMirror.
3. Outline renders around active characters with color from `hap.value?.color` or theme foreground.
4. Outline style customizable via `hap.value?.markcss`.
5. Characters flash (pulsing effect) — currently static in code, optional enhancement.

**Kanopi implementation**:
- Delete `pattern-highlight.ts`.
- Import and use Strudel's `highlightExtension` + `highlightMiniLocations()` from strudel-cm proxy.
- Ensure pattern-highlight panel in UI doesn't duplicate the feature.

### 6.4 Eval Flash

**Behavior spec** (Kanopi-specific, not Strudel):
1. On successful eval: white overlay flash (200ms default).
2. On eval error: red overlay flash.
3. Applies to range `[docOffset, docOffset + codeLen]` (current block only in multi-block files).

**Kanopi implementation**:
- Use Strudel's `flash()` function from strudel-cm proxy.
- Call `flash(view, 200)` on success, custom error flash on failure.
- Already wired in CMEditor:55–56.

### 6.5 Sliders

**Behavior spec** (from Strudel, not yet integrated):
1. Transpiler detects `slider(value, min, max, step?)` in code.
2. Generates inline `<input type="range">` widget alongside the code.
3. User drags slider → postMessage to `sliderWithID` state → next query reads new value.
4. Slider UI updates when code is re-evaluated (value changes).

**Kanopi implementation**:
- Remove filter at `strudel.ts:274` that drops slider configs.
- Ensure transpiler integration is working (currently unknown status — phase 2.1 task 1.5 required).
- Test bidirectional state sync.

---

## 7. Rollout Plan: Phase 2.1 Integration Tasks

### 7.1 Task 1.1: Integrate Theme System

**Objective**: Replace Kanopi's custom theme logic with Strudel's 35-theme system.

**Changes**:
- Import `activateTheme`, `initTheme`, `themes` from strudel-cm proxy.
- On session load: call `initTheme(defaultThemeName)`.
- On theme switch: call `activateTheme(newName)`.
- Sync Kanopi's UI theme picker to Strudel's theme list.

**Deliverable**: Kanopi and Strudel canvases use identical color scheme.

**Files modified**: `CMEditor.svelte`, theme picker component.

---

### 7.2 Task 1.2: Pre-Create Fullscreen Canvas

**Objective**: Prevent Strudel's `getDrawContext()` from auto-prepending a fullscreen canvas; use Kanopi's managed `#test-canvas`.

**Changes**:
- CMEditor mounts a `<canvas id="test-canvas">` in the editor host (currently state variable, not mounted).
- Size it to match editor viewport: 100% width, absolute position within editor bounds.
- Ensure z-index places it above code (or use overlay mode).
- Confirm @strudel/draw's `getDrawContext()` finds and reuses it (no prepend).

**Deliverable**: Fullscreen viz canvases render in editor viewport, not as browser overlays.

**Files modified**: `CMEditor.svelte`.

---

### 7.3 Task 1.3: Wire Inline Widgets (MVP)

**Objective**: Make `._pianoroll()`, `._scope()`, `._spectrum()` render below code lines.

**Changes**:
- Remove stubs in `strudel.ts:316–318`.
- Test that `afterEval` hook captures widget configs without filtering.
- Verify `updateWidgets()` dispatch reaches `widgetField` StateField.
- Visually confirm canvases appear in editor.

**Deliverable**: Users can write `note("c a")._pianoroll()` and see inline canvas.

**Files modified**: `strudel.ts` (remove stubs).

---

### 7.4 Task 1.4: Add Missing Viz Methods

**Objective**: Stub remaining visualization methods so user code doesn't throw.

**Changes**:
- Import `spiral`, `pitchwheel`, `punchcard`, `wordfall`, `fscope` from @strudel/draw and @strudel/webaudio.
- Register as no-ops (return `this`) if analysis layer doesn't support them (e.g., spiral on non-pitched pattern).
- OR: Defer to Phase 3 if these are lower priority.

**Deliverable**: Code with `.spiral()` evaluates without error (may not render if unsupported).

**Files modified**: `strudel.ts` (`ensure()` function).

---

### 7.5 Task 1.5: Enable Sliders

**Objective**: Integrate Strudel's slider widgets.

**Changes**:
- Remove filter at `strudel.ts:274`.
- Verify transpiler generates correct widget configs.
- Test postMessage loop: drag slider → state updates → query reflects new value.

**Deliverable**: Users can write `slider(0.5, 0, 1)` and get an interactive range input.

**Files modified**: `strudel.ts` (line 274).

---

### 7.6 Task 1.6: Replace Mini-Notation Highlight

**Objective**: Delete Kanopi's custom highlight; use Strudel's `highlightExtension`.

**Changes**:
- Remove `pattern-highlight.ts`, `patternHighlightExtension` import from CMEditor.
- Import `highlightExtension` from strudel-cm proxy.
- Add to CMEditor extension list (line 88) when lang === 'strudel'.
- Verify pulsing outline appears on active mini-notation.

**Deliverable**: Mini-notation pulses with same behavior as strudel.cc.

**Files modified**: `CMEditor.svelte`, delete `pattern-highlight.ts`.

---

### 7.7 Task 1.7: Delete VizPanel Components

**Objective**: Remove Kanopi's custom Pianoroll, Scope, Spectrum panels.

**Changes**:
- Delete `/packages/ui/src/components/viz/Pianoroll.svelte`, `Scope.svelte`, `Spectrum.svelte`, `VizPanel.svelte`.
- Verify fullscreen canvases and inline widgets provide all UI.
- Confirm pattern list / MIDI export features are replaced or deferred.

**Deliverable**: Cleaner codebase; viz UI fully delegated to Strudel.

**Files modified**: Delete 4 files, update any imports.

---

## 8. Verification Checklist (Phase 2.1 Success Criteria)

- [ ] All 14 visualization methods callable without throwing (fullscreen + inline).
- [ ] Fullscreen canvas renders inside editor viewport (not as browser overlay).
- [ ] Inline widgets appear below code lines.
- [ ] Mini-notation pulsing matches strudel.cc (outline color, timing).
- [ ] Eval flash (green/red) covers same range as in Strudel.cc demo.
- [ ] Theme picker switches colors for code AND canvas simultaneously.
- [ ] Slider widgets appear and update pattern on drag.
- [ ] No double-instantiation of @strudel/codemirror (Vite dedupe working).
- [ ] Kanopi pattern-highlight.ts deleted.
- [ ] VizPanel components deleted.
- [ ] All strudel.ts stubs removed or upgraded to real implementations.

---

## 9. Surprising Findings and Contradictions

### 9.1 `.tpianoroll()` Does Not Exist

**Finding**: No `.tpianoroll()` prototype method in any upstream file.

**Contradiction**: The variant name suggests a time-domain fullscreen pianoroll, but it doesn't exist. User code like `note("c a").tpianoroll()` will throw.

**Resolution**: Strudel.cc does NOT document or provide `.tpianoroll()`. Fullscreen pianoroll is `.pianoroll()`. Inline variant is `._pianoroll()`. The `t` prefix is only used for `.tscope()` (which aliases `.scope()`) and `.tpianoroll()` does not exist.

**Implication for Kanopi**: Do NOT create a `.tpianoroll()` stub.

---

### 9.2 Spectrum Method Reassignment Bug

**Finding**: In `/home/romi/dev/music/kanopi/node_modules/@strudel/webaudio/spectrum.mjs:35`:
```javascript
Pattern.prototype.scope = Pattern.prototype.tscope;
```

**This is wrong**: Should be `Pattern.prototype.fscope = ...` (or something else).

**Citation**: Line 35 in spectrum.mjs overwrites `Pattern.prototype.scope` that was just set in scope.mjs:149.

**Implication**: Importing spectrum AFTER scope.mjs breaks the `.scope()` method. Order matters. Strudel.cc's @strudel/webaudio index must re-export both in the correct sequence.

**Kanopi impact**: If Kanopi manually imports spectrum.mjs before scope.mjs, `.scope()` breaks. Phase 2.1 task 1.3 must verify load order via @strudel/webaudio index.

---

### 9.3 Analyze Method Not Documented

**Finding**: `.scope()`, `.spectrum()`, `.fscope()` all call `.analyze(id)` before `.draw()`:
```javascript
Pattern.prototype.scope = function (config = {}) {
  let id = config.id ?? 1;
  return this.analyze(id).draw(...);
};
```

**Citation**: scope.mjs:112, 138, spectrum.mjs:25.

**Issue**: `.analyze()` is never imported or documented in the Strudel files read. Must come from @strudel/core (not provided in audit scope).

**Implication**: Without `.analyze()`, scope/spectrum won't tap the audio signal. Kanopi must ensure @strudel/core's `.analyze()` is available.

---

### 9.4 Default Theme Colors Hardcoded in Module State

**Finding**: draw.mjs:213–222 defines a hardcoded default theme:
```javascript
let theme = {
  background: '#222',
  foreground: '#75baff',
  caret: '#ffcc00',
  ...
};
```

**Issue**: This is set ONCE at module load time. If Kanopi later calls `activateTheme()`, it updates this module-level `theme` object.

**Implication**: Code that calls `getTheme()` before `activateTheme()` sees the hardcoded fallback, not the user's chosen theme. Kanopi must call `initTheme()` / `activateTheme()` early (before any viz code).

---

### 9.5 Slider State Is Global, Not Per-Pattern

**Finding**: slider.mjs:5 declares `export let sliderValues = {}` at module scope.

**Citation**: slider.mjs:5–145.

**Issue**: All slider widgets in a session share the same `sliderValues` map, keyed by numeric ID. No namespace isolation per-file or per-actor.

**Implication**: If two Kanopi actors have `slider(0.5)` in different files, they'll collide in the same map if the transpiler generates the same numeric ID. Phase 2.1 task 1.5 must verify the transpiler generates globally unique IDs.

---

## 10. References

### 10.1 Upstream Repositories

- **Strudel main repo**: https://codeberg.org/uzu/strudel
- **@strudel/draw package**: https://codeberg.org/uzu/strudel/tree/main/packages/draw
- **@strudel/codemirror package**: https://codeberg.org/uzu/strudel/tree/main/packages/codemirror
- **@strudel/webaudio package**: https://codeberg.org/uzu/strudel/tree/main/packages/webaudio

### 10.2 Kanopi Code Locations

- **Runtime adapter**: `/home/romi/dev/music/kanopi/packages/ui/src/lib/runtimes/strudel.ts`
- **CodeMirror proxy**: `/home/romi/dev/music/kanopi/packages/ui/src/lib/runtimes/strudel-cm.ts`
- **Editor component**: `/home/romi/dev/music/kanopi/packages/ui/src/components/editor/CMEditor.svelte`
- **Viz components (to delete)**: `/home/romi/dev/music/kanopi/packages/ui/src/components/viz/`
- **Vite config**: `/home/romi/dev/music/kanopi/vite.config.ts` (dedupe: `['@strudel/codemirror']`)

### 10.3 Strudel Packages in node_modules (Audited)

- `/home/romi/dev/music/kanopi/node_modules/@strudel/draw/pianoroll.mjs` (317 lines)
- `/home/romi/dev/music/kanopi/node_modules/@strudel/draw/spiral.mjs` (158 lines)
- `/home/romi/dev/music/kanopi/node_modules/@strudel/draw/pitchwheel.mjs` (145 lines)
- `/home/romi/dev/music/kanopi/node_modules/@strudel/draw/draw.mjs` (229 lines)
- `/home/romi/dev/music/kanopi/node_modules/@strudel/codemirror/widget.mjs` (143 lines)
- `/home/romi/dev/music/kanopi/node_modules/@strudel/codemirror/highlight.mjs` (139 lines)
- `/home/romi/dev/music/kanopi/node_modules/@strudel/codemirror/flash.mjs` (40 lines)
- `/home/romi/dev/music/kanopi/node_modules/@strudel/codemirror/slider.mjs` (147 lines)
- `/home/romi/dev/music/kanopi/node_modules/@strudel/codemirror/themes.mjs` (219 lines)
- `/home/romi/dev/music/kanopi/node_modules/@strudel/codemirror/keybindings.mjs` (144 lines)
- `/home/romi/dev/music/kanopi/node_modules/@strudel/webaudio/scope.mjs` (150 lines)
- `/home/romi/dev/music/kanopi/node_modules/@strudel/webaudio/spectrum.mjs` (70 lines)

---

## Appendix: Glossary

| Term | Definition |
|------|-----------|
| **Hap** | Strudel's atomic event: `{ whole, part, value, context: { locations, ... } }`. Represents a note, sample trigger, etc. |
| **Mini-notation** | Strudel's pattern syntax: `"c a f e"` for note sequences, `"bd sd hh"` for samples. Transpiled to Pattern objects. |
| **Transpiler** | @strudel/transpiler module (not audited). Parses mini-notation and viz function calls, generates widget configs. |
| **Drawer** | @strudel/draw's animation orchestration class. Syncs requestAnimationFrame to scheduler time. |
| **Analyser** | Web Audio API's AnalyserNode. Taps audio signal for scope/spectrum visualization. |
| **StateField** | CodeMirror 6's unit of reactive state. Holds decorations, responds to effects. |
| **StateEffect** | CodeMirror 6's message type. Dispatched via `view.dispatch({ effects: ... })`. |
| **BlockWidget** | CodeMirror 6's WidgetType subclass. Converts config → DOM element for inline placement. |
| **Dedupe** | Vite's `resolve.dedupe` option. Forces multiple imports of the same package to resolve to one instance. |
| **Composite source** | Kanopi's multi-actor evaluation strategy. Combines multiple actors' code into one Strudel eval. |
| **Compose** | Strudel's operator for combining multiple Patterns into one. Often used with `all()` for simultaneous visualization. |

---

**Document version**: 1.0  
**Last updated**: 2026-04-22  
**Prepared by**: Claude (Haiku)  
**Status**: Phase 0 Research Complete — Ready for Phase 2.1 Implementation

