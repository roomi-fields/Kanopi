---
name: vite-hmr-reset
description: Deterministic recovery procedure for Vite HMR failures on WSL2 in Kanopi's packages/ui. Use this skill the instant the user reports any of: "rien ne recharge", "il faut que je hard-reload", "HMR ne marche plus", "j'ai modifié mais rien ne bouge", "le CSS ne se met pas à jour", "Vite est figé" — or when Claude's own `live-coding-verify` step shows a screenshot that doesn't reflect a just-made edit. This is the single most common source of lost debugging time in this project; resolve it before any further edits or verification work.
---

# Vite HMR Reset (WSL2)

Vite's file watcher on WSL2 relies on native inotify events that do not propagate reliably from the Windows-mounted DrvFS into the Linux kernel. Without polling, file edits from the Windows side (VS Code on Windows, a Claude Code session editing via WSL, etc.) are *silently missed* — the file on disk has changed, but Vite never fires the HMR update. The browser keeps showing stale code.

This skill is the deterministic fix. Do not try to diagnose "why did my change not appear" through other means first — 90% of the time on this project, it's this.

## Symptom triage

You are almost certainly in this failure mode if:

- The file on disk *has* changed (verify with `git diff` or re-reading it) but the browser UI has not.
- The Vite terminal shows no `[vite] hmr update` line after your edit.
- A hard reload (Ctrl+Shift+R) makes the change appear — but only until the next edit.
- You just resumed a WSL session that was suspended or disconnected from the network.

You are probably **not** in this mode if:

- Vite's terminal logs an HMR update but the browser still shows the old thing → that's a browser cache or service-worker issue (Kanopi ships a PWA — try unregistering the SW in devtools > Application).
- The dev server terminal is quiet because Vite has crashed → see "If polling doesn't fix it".

## The fix, in order

### 1. Kill every running vite process

```bash
pkill -f 'vite' || true
```

On WSL2 it's common to end up with orphaned vite processes after a session disconnect. `pkill` is safe here — no other project in this workspace runs a command whose name contains `vite`.

### 2. Clear Vite's dep cache

```bash
rm -rf packages/ui/node_modules/.vite
```

Stale pre-bundled deps after a package-lock change also manifest as "HMR stopped working". This is cheap to clear; do it defensively.

### 3. Restart with polling enabled

```bash
cd packages/ui && VITE_FORCE_POLLING=1 CHOKIDAR_USEPOLLING=1 npm run dev
```

Both env vars are set because different plugin chains check different variables. The polling interval is 100–300 ms; CPU cost is negligible for a project this size and eliminates the lost-event class of bugs entirely.

### 4. Make it the default

If `packages/ui/vite.config.ts` does not already set `server.watch.usePolling: true`, patch it so future sessions don't hit this. Minimal patch:

```ts
server: {
  port: 5173,
  strictPort: false,
  watch: {
    usePolling: true,
    interval: 200,
  },
},
```

The one-line cost is worth more than any "but polling is ugly" aesthetic argument — this project is developed on WSL2 and the non-polling path is broken.

## If polling doesn't fix it

Then it's probably not a watcher issue. Check in this order:

1. **Vite actually crashed.** Scroll the dev-server terminal — look for a stack trace above the prompt. Common culprits: a syntax error in a `.svelte` file that the Svelte compiler reported and then Vite gave up, a circular import, or `@strudel/core` being pulled in twice (see `vite.config.ts` `resolve.dedupe`).
2. **PWA service worker serving stale assets.** Open devtools → Application → Service Workers → Unregister. Then hard-reload once. From then on, HMR should flow normally.
3. **Port collision.** Vite may have bound to 5174 or 5175 silently if 5173 was held by a zombie process. Check the URL Vite prints on startup — it's authoritative.
4. **Browser tab holding a broken WebSocket.** Close the tab and reopen. Vite's HMR client reconnects on fresh page load but can get stuck in an error state if the tab was open during a Vite crash.

## What to say back to the user

Once HMR is verified working (make a trivial edit, see the HMR update line in the terminal, confirm the browser updated):

> "HMR remis en route : tué les processus vite, vidé `.vite`, redémarré avec polling. J'ai (ou n'ai pas) patché `vite.config.ts` pour que ce soit le défaut. Dis-moi quand je reprends."

Then, if the original task was a UI edit, route back to the `live-coding-verify` skill — HMR was the blocker, now the verification step can actually proceed.
