#!/usr/bin/env bash
# build-and-deploy.sh — build local de la SPA/PWA Kanopi (PC2) + rsync sur le VPS
# Hostinger dans une release timestampée + bascule atomique du symlink `current`
# + reload nginx + health-check (avec rollback automatique si KO).
#
# Pourquoi local : Kanopi dépend de 4 dépôts frères via des chemins file:../../../../bp/*
# qui n'existent QUE sur PC2. Le build doit donc se faire ici (les deps résolvent),
# pas dans un conteneur. Calque du modèle viasophia (scripts/publish/build-and-deploy.sh),
# enrichi d'un schéma de releases + rollback.
#
# Déclencheur : MANUEL, par l'architecte, depuis le repo Kanopi sur PC2. Pas de cron / CI.
#   bash scripts/publish/build-and-deploy.sh
#
# Prérequis :
#   - Node (>=18) + npm, deps installées (npm ci à la racine du monorepo)
#   - Les 4 deps frères présentes : /home/romi/dev/bp/{bp3-frontend,BPx,BPscript,runtime-MIDI}
#   - Clé SSH VPS : ~/.ssh/claude_hostinger_temp
#   - Conteneur kanopi-web déjà up sur le VPS (cf. deploy/compose.yml)
#
# Variables d'environnement (avec valeurs par défaut) :
#   VPS_HOST   = root@72.61.97.213
#   VPS_KEY    = ~/.ssh/claude_hostinger_temp
#   REMOTE_BASE= /var/www/kanopi          (contient releases/ + le symlink current)
#   CONTAINER  = kanopi-web
#   KEEP       = 5                         (nb de releases conservées)

set -euo pipefail

VPS_HOST="${VPS_HOST:-root@72.61.97.213}"
VPS_KEY="${VPS_KEY:-$HOME/.ssh/claude_hostinger_temp}"
REMOTE_BASE="${REMOTE_BASE:-/var/www/kanopi}"
CONTAINER="${CONTAINER:-kanopi-web}"
KEEP="${KEEP:-5}"
PUBLIC_URL="https://roomi-fields.com/kanopi/"

SSH=(ssh -i "$VPS_KEY" -o StrictHostKeyChecking=accept-new)

# Racine du repo (ce script est dans scripts/publish/)
cd "$(dirname "$0")/../.."
REPO_ROOT="$(pwd)"
UI_DIR="$REPO_ROOT/packages/ui"

TS="$(date +%Y%m%d-%H%M%S)"

echo ">> [1/6] Build local (packages/ui, VITE_BASE_PATH=/kanopi/)"
cd "$UI_DIR"
VITE_BASE_PATH=/kanopi/ npm run build

if [[ ! -d "$UI_DIR/dist" || ! -f "$UI_DIR/dist/index.html" ]]; then
  echo "ERREUR : packages/ui/dist/index.html inexistant après build" >&2
  exit 1
fi

echo ">> [2/6] Rsync dist/ vers $VPS_HOST:$REMOTE_BASE/releases/$TS/kanopi/"
# Le build est rangé sous kanopi/ pour que l'URL /kanopi/* mappe directement sur
# le filesystem (nginx root = .../current, location /kanopi/).
"${SSH[@]}" "$VPS_HOST" "mkdir -p '$REMOTE_BASE/releases/$TS/kanopi'"
rsync -avz --delete \
  -e "ssh -i $VPS_KEY -o StrictHostKeyChecking=accept-new" \
  "$UI_DIR/dist/" \
  "$VPS_HOST:$REMOTE_BASE/releases/$TS/kanopi/"

echo ">> [3/6] Bascule atomique du symlink current -> releases/$TS"
# Capture la release précédente (pour rollback) et bascule de façon atomique.
PREV="$("${SSH[@]}" "$VPS_HOST" "readlink '$REMOTE_BASE/current' 2>/dev/null || true")"
"${SSH[@]}" "$VPS_HOST" "cd '$REMOTE_BASE' && ln -sfn 'releases/$TS' .current.tmp && mv -Tf .current.tmp current"
echo "   précédente : ${PREV:-<aucune>}  →  nouvelle : releases/$TS"

echo ">> [4/6] Reload nginx ($CONTAINER)"
"${SSH[@]}" "$VPS_HOST" "docker exec '$CONTAINER' nginx -s reload"

echo ">> [5/6] Health-check $PUBLIC_URL"
sleep 1
HTTP_CODE="$(curl -sS -o /dev/null -w '%{http_code}' "$PUBLIC_URL" || echo 000)"
if [[ "$HTTP_CODE" != "200" ]]; then
  echo "⚠ HTTP $HTTP_CODE sur $PUBLIC_URL — ROLLBACK" >&2
  if [[ -n "$PREV" ]]; then
    "${SSH[@]}" "$VPS_HOST" "cd '$REMOTE_BASE' && ln -sfn '$PREV' .current.tmp && mv -Tf .current.tmp current && docker exec '$CONTAINER' nginx -s reload"
    echo "   symlink current re-pointé sur $PREV" >&2
  else
    echo "   pas de release précédente — rien à restaurer" >&2
  fi
  exit 2
fi
# Vérif bonus : le manifest PWA doit sortir en application/manifest+json
MIME="$(curl -sS -o /dev/null -w '%{content_type}' "${PUBLIC_URL}manifest.webmanifest" || true)"
echo "   manifest.webmanifest → $MIME"

echo ">> [6/6] Purge des anciennes releases (garde les $KEEP plus récentes)"
"${SSH[@]}" "$VPS_HOST" "cd '$REMOTE_BASE/releases' && ls -1dt */ 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -rf"

echo ">> ✓ Déploiement OK — $PUBLIC_URL répond $HTTP_CODE (release $TS)"
