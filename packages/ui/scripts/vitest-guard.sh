#!/usr/bin/env bash
# vitest-guard.sh — ceinture anti-OOM pour un run vitest (durcissement PC2 [450], 2026-07-02).
#
# Ce matin, un run vitest (8 workers) a gonflé à ~7,4 Go et a contribué à un FREEZE machine —
# même classe de danger qu'un runner de tests sans plafond. La concurrence est déjà bornée dans
# vitest.config.ts (`maxWorkers: 3`, ~3-4 Go) ; ce wrapper ajoute la ceinture :
#   victime OOM : choom -n 1000 → si la RAM sature quand même, le noyau tue vitest (et ses
#   workers, qui héritent du oom_score_adj), JAMAIS le système (pipewire/desktop) → plus de reboot.
#
# PAS de `ulimit -v` (contrairement à bp3-guard.sh) : bp3 est un binaire natif C, mais V8/WASM
# (vitest tourne sous Node, esbuild/WASM inclus) RÉSERVENT énormément d'adressage VIRTUEL sans
# le committer → un RLIMIT_AS même large tue WASM (« WebAssembly.instantiate(): Out of memory »,
# vérifié). Le plafond de RAM RÉELLE, c'est `maxWorkers` ; l'adressage virtuel ne se plafonne pas
# ici. Pas de flock non plus (vitest est lancé UNE fois ; sa concurrence = maxWorkers).
#
# Usage : vitest-guard.sh <cmd> [args...]   (ex. dans package.json : vitest-guard.sh vitest run …)
set -u

if command -v choom >/dev/null 2>&1 ; then
  exec choom -n 1000 -- "$@"   # -- : ne pas laisser choom parser les flags de vitest (-c, --run…)
else
  exec "$@"
fi
