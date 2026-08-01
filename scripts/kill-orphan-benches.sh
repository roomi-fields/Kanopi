#!/usr/bin/env bash
# kill-orphan-benches.sh — GUARD anti-orphelins de banc (Romain 2026-07-14 : "tes tests laissent
# régulièrement des Playwright orphelins qui pourrissent les perfs").
#
# Les runs e2e/gate (`npm run verify`, Playwright) et le banc écran (Playwright MCP) laissent, quand ils
# sont interrompus (push tué, SIGTERM, MCP déconnecté), des processus ORPHELINS qui s'accumulent :
#   - navigateurs Chromium de Playwright (cache `ms-playwright` / `headless_shell`) ;
#   - webServers e2e du gate (`vite --port 4321 --strictPort`).
# Ce guard NE tue QUE les ORPHELINS RÉELS = parent mort (`ppid == 1`). Il n'affecte donc JAMAIS :
#   - un run e2e/gate VIVANT (son navigateur/webServer a un parent vivant) ;
#   - le serveur dev 5173 courant ;
#   - un projet TIERS (ex. l'aperçu astro viasophia qui squatte aussi 4321) — pattern ciblé + ppid.
#
# Usage : `bash scripts/kill-orphan-benches.sh` (à lancer AVANT et APRÈS chaque run e2e/banc, cf CLAUDE.md).
set -uo pipefail

PATTERNS=('ms-playwright' 'headless_shell' 'vite .*--port 4321')
killed=0

sweep() { # $1 = signal
  for pat in "${PATTERNS[@]}"; do
    for pid in $(pgrep -f "$pat" 2>/dev/null); do
      ppid=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
      if [ "$ppid" = "1" ]; then
        kill "-$1" "$pid" 2>/dev/null && killed=$((killed + 1))
      fi
    done
  done
}

sweep TERM
sleep 1
sweep KILL # 2e passe pour les récalcitrants

# KAN-39 (2026-08-01) — un serveur de gate dont le PARENT VIT ENCORE était épargné par le
# balayage ci-dessus, qui n'accepte que `ppid == 1`. Or un push interrompu (timeout du client,
# Ctrl-C, session tuée) laisse exactement ça : un `vite --port 4321` rattaché à un shell encore
# vivant. Il occupait le port, `reuseExistingServer:false` refusait de le réutiliser, et CHAQUE
# TENTATIVE SUIVANTE ÉCHOUAIT À COUP SÛR — plus aucun push possible sans intervention manuelle.
#
# On tue donc TOUT ce qui écoute sur le port du gate, quel que soit son parent. Le port est
# DÉDIÉ au portillon (jamais 5173/5174) : rien de légitime n'y vit entre deux runs.
PORT="${GATE_PORT:-4321}"
for pid in $(ss -lptnH "sport = :$PORT" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u); do
  cmd=$(ps -o cmd= -p "$pid" 2>/dev/null)
  case "$cmd" in
    *vite*|*node*)
      kill -TERM "$pid" 2>/dev/null && killed=$((killed + 1))
      sleep 1; kill -KILL "$pid" 2>/dev/null
      echo "kill-orphan-benches: serveur de gate SQUATTEUR tué sur :$PORT (pid $pid, parent vivant)" ;;
    *)
      echo "kill-orphan-benches: ⚠️ :$PORT occupé par un processus ÉTRANGER, laissé intact — $cmd" ;;
  esac
done

if [ "$killed" -gt 0 ]; then
  echo "kill-orphan-benches: $killed orphelin(s) de banc tué(s)."
else
  echo "kill-orphan-benches: aucun orphelin (parent-mort) — rien à tuer."
fi
