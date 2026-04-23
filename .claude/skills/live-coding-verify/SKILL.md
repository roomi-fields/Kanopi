---
name: live-coding-verify
description: Visual and functional verification protocol for any UI, CSS, Svelte, or CodeMirror change in Kanopi (packages/ui/src/**/*.{svelte,css,ts}). Use this skill whenever Claude edits files that affect rendered UI, styling, editor behavior, or Strudel/Hydra runtime wiring — even if the user only asks for a "small tweak". It prevents the "I edited, reload, you see nothing" failure loop that plagues this WSL2 + Vite + Svelte 5 project. Trigger on ANY mention of sliders, panels, themes, layout, keybindings, editor extensions, evaluation/error flashes, visual regressions, or "reload" / "hard reload" / "it doesn't change".
---

# Live-Coding Verification Protocol

Kanopi is an in-browser IDE for live coding (Strudel, Hydra, Web Audio). Claude cannot see the UI on its own. Without a verification step, the typical failure mode is: Claude edits a file, tells the user "done, reload", the user reloads and sees nothing changed, loop repeats. This skill breaks that loop.

## When to apply

Any edit under `packages/ui/src/` — Svelte components, CSS, CodeMirror extensions, theme files, keybindings, runtime adapters that affect rendering or audio eval. Also apply any time the user reports "rien n'a changé", "il reste le slider", "le flash marche pas", etc.

## The protocol

### 1. Before editing — know what you're changing

- Read the target file fully. If it touches CodeMirror, also read the nearest `Editor.svelte` or extension registration site.
- Grep for every place the symbol/class is used. A slider style can live in several layers (raw element, Svelte scoped style, global CSS, CM6 theme). Changing one layer without the others is the #1 source of "rien n'a changé".
- State in one sentence what you expect to see change, so verification has a concrete target.

### 2. Start or verify the dev server

Dev server must be running with polling on WSL2 — otherwise HMR silently ignores file changes.

```bash
cd packages/ui && VITE_FORCE_POLLING=1 CHOKIDAR_USEPOLLING=1 npm run dev
```

If HMR has stopped working mid-session, invoke the `vite-hmr-reset` skill before continuing. Do not try to verify on top of a broken HMR — you will chase ghost bugs.

### 3. Verify visually — Playwright MCP

If Playwright MCP is available (`mcp__playwright__*` tools), Claude takes the screenshot itself — no human in the loop.

```
browser_navigate       → http://localhost:5173
browser_snapshot       → structural DOM check
browser_take_screenshot → pixel check
browser_click / browser_press_key → exercise the interaction the user cares about
browser_console_messages → confirm no new errors
```

For error-flash / eval-result changes: trigger the eval (Ctrl+Enter in CodeMirror) via `browser_press_key`, then screenshot within the flash duration.

If Playwright MCP is not installed, stop and tell the user:

> "Je peux pas vérifier visuellement. Soit on installe Playwright MCP (`claude mcp add playwright npx @playwright/mcp@latest`), soit tu valides à chaque itération."

Do not pretend to have verified.

### 4. Verify functionally — browser console + Strudel

Strudel errors are async and often swallowed. After any eval-related change:

- Read `browser_console_messages` after a test eval.
- Look for `@strudel/core` duplicate-load warnings (dedupe broken → regression in `vite.config.ts`).
- Look for silent promise rejections.

For Hydra: check that the canvas has actually been created (`browser_evaluate` → `document.querySelector('canvas')`).

### 5. Only then say "done"

A response of "c'est fait, recharge" is forbidden unless one of these is true:

- Claude has seen the screenshot diff and it matches the expectation.
- The user explicitly waived verification ("t'embête pas à screenshot").
- The change is provably invisible (pure type alias, comment, test-only file).

If verification failed or was impossible, say so explicitly and propose a next step instead of declaring success.

## Common Kanopi-specific pitfalls

- **CodeMirror styling lives in multiple layers.** A slider, scrollbar, or gutter style may be overridden by: the CM6 `EditorView.theme`, a `baseTheme`, a Svelte `<style>` scoped block, a global CSS rule in `app.css`, or a Strudel-injected stylesheet. Changing one layer does not change the rendered pixel. When a user reports "il reste des sliders", grep all of these layers before editing.
- **Svelte 5 compiler rewrites `await`.** If you add `await` inside a `$derived` or a reactive block, the compiler may silently produce broken code. Verify behavior in the browser, not by reading the source.
- **Strudel `onEvalError` fires asynchronously** after the transpiler has already returned "ok". An error-flash tied to the synchronous return path will miss real errors. Verify by actually evaluating broken code in the browser.
- **Vite HMR on WSL2 without polling drops updates silently.** "J'ai modifié mais rien ne bouge" is almost always this. See `vite-hmr-reset`.
- **`@strudel/core` double-load** kills the scheduler silently (patterns play to a detached audio context). Check `vite.config.ts` `resolve.dedupe` if eval "works" but you hear nothing.

## Output format

After completing verification, report in this shape:

```
Changed: <file(s)>
Expected visual change: <one sentence>
Verification method: <Playwright screenshot / user validation / none>
Result: <matches expectation | differs in X | could not verify because Y>
Console: <clean | warnings: ... | errors: ...>
Next: <commit | iterate | hand back to user>
```

Do not skip fields. "Could not verify" is an acceptable answer — "done, reload" is not.
