#!/usr/bin/env bash
# build-and-deploy.sh — UNE procédure de build, DEUX destinations ([570], demande Romain) :
#
#   bash scripts/publish/build-and-deploy.sh local   # serveur de test local FRAIS (vite preview → 4173)
#   bash scripts/publish/build-and-deploy.sh prod    # déploiement VPS (releases + rollback), INCHANGÉ
#
# Les deux cibles partagent le MÊME tronc (garantie dev/prod ISO) :
#   1. rebuild des compilés amont que Kanopi consomme via `dist` en build — BPx, kronos,
#      kairos (les runtimes sont consommés en SOURCE, pas de build) + GARDE anti-périmé
#      bruyante → on ne teste/déploie JAMAIS sur du compilé périmé (piège vécu 2026-07-04 :
#      un preview 4173 bâti sur des dist BPx/kairos périmés rendait les voix de code muettes
#      alors que le dev 5173 sonnait) ;
#   2. vite build.
# Puis la cible diverge : `local` sert dist/ via vite preview (4173) ; `prod` rsync sur le
# VPS dans une release timestampée + bascule atomique + health-check/rollback.
#
# Pourquoi build local : Kanopi dépend de dépôts frères via des chemins file:../../../../bp/*
# qui n'existent QUE sur PC2. Le build doit donc se faire ici (les deps résolvent),
# pas dans un conteneur. Calque du modèle viasophia, enrichi releases + rollback.
#
# Déclencheur : MANUEL (architecte/agent), depuis le repo Kanopi sur PC2. Pas de cron / CI.
#
# Prérequis :
#   - Node (>=18) + npm, deps installées (npm ci à la racine du monorepo)
#   - Les deps frères présentes dans l'atelier, à côté de ce dépôt : BPx, kronos, kairos, BPscript…
#   - prod seulement : clé SSH VPS (~/.ssh/claude_hostinger_temp) + conteneur kanopi-web up
#
# Variables d'environnement (avec valeurs par défaut) :
#   VPS_HOST   = root@72.61.97.213
#   VPS_KEY    = ~/.ssh/claude_hostinger_temp
#   REMOTE_BASE= /var/www/kanopi          (contient releases/ + le symlink current)
#   CONTAINER  = kanopi-web
#   KEEP       = 5                         (nb de releases conservées)
#   PREVIEW_PORT = 4173                    (cible local)

set -euo pipefail

TARGET="${1:-}"
if [[ "$TARGET" != "local" && "$TARGET" != "prod" ]]; then
  echo "Usage : $(basename "$0") local | prod" >&2
  echo "  local : rebuild dist amont (BPx, kronos, kairos) + vite build + vite preview (4173)" >&2
  echo "  prod  : même tronc de build, puis déploiement VPS (releases + rollback)" >&2
  exit 64
fi

PREVIEW_PORT="${PREVIEW_PORT:-4173}"
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

# Doc utilisateur EMBARQUÉE (MkDocs) → packages/ui/public/docs, régénérée AVANT le vite build
# (public/ → dist/) pour être servie à la même origine sous /kanopi/docs — SOURCE UNIQUE ([463]).
# L'artefact public/docs est git-ignoré ; c'est CETTE étape qui le (re)produit à chaque déploiement.
# prod : OBLIGATOIRE (on ne publie pas sans la doc). local : best-effort (le banc de test
# n'a pas besoin de la doc ; absente → avertir et continuer).
echo ">> [0/6] Build doc utilisateur (MkDocs) → packages/ui/public/docs"
DOC_SRC="$REPO_ROOT/../atlas/doc-utilisateur"
if [[ -x "$DOC_SRC/.venv/bin/mkdocs" ]]; then
  ( cd "$DOC_SRC" && ./.venv/bin/mkdocs build -d "$UI_DIR/public/docs" )
elif [[ "$TARGET" == "prod" ]]; then
  echo "ERREUR : mkdocs introuvable ($DOC_SRC/.venv/bin/mkdocs) — doc embarquée non régénérée" >&2
  exit 1
else
  echo "   (local) mkdocs introuvable — doc embarquée non régénérée, on continue" >&2
fi

# DIST AMONT FRAIS (LAN-14 / DEPLOY-DIST-STALE, GO [521]) : le build prod consomme les
# DIST de bpx/kronos/kairos (condition d'export `import`) ; depuis deps-fraîches le dev
# sert leurs SRC et plus rien ne rebuildait les dist → un deploy embarquait des briques
# périmées (site potentiellement muet, 'ax is not a constructor'). On REBUILD dans
# l'ordre de dépendance (bpx et kronos, puis kairos qui dépend des deux), puis une GARDE
# refuse BRUYAMMENT le deploy si un dist reste plus vieux que sa source.
# ⛔ LES CHEMINS SE DÉRIVENT, ILS NE S'ÉCRIVENT PAS. Ils portaient `/home/romi/dev/bp/...` en
# absolu : sur une autre machine, ce déploiement échouerait au premier `cd`, et rien ne l'aurait
# dit avant. Un chemin absolu ne se déclare nulle part et ne se voit qu'au moment où il échoue,
# ailleurs que là où il a été écrit (mesure d'atlas, 2026-08-14 : douze sites chez lui, dont son
# oracle et deux étapes de son portillon).
ATELIER="$(cd "$(git rev-parse --show-toplevel)/.." && pwd)"
UPSTREAMS=("$ATELIER/BPx" "$ATELIER/kronos" "$ATELIER/kairos")
echo ">> [0bis/6] Rebuild des dist amont (bpx, kronos, kairos)…"
for d in "${UPSTREAMS[@]}"; do
  echo "   - $(basename "$d")"
  ( cd "$d" && npm run build )
done
for d in "${UPSTREAMS[@]}"; do
  main="$d/dist/index.js"
  [[ -f "$main" ]] || { echo "ERREUR : $main absent après build — deploy REFUSÉ" >&2; exit 1; }
  stale="$(find "$d/src" -type f \( -name '*.ts' -o -name '*.js' \) -newer "$main" | head -1)"
  if [[ -n "$stale" ]]; then
    echo "ERREUR : dist périmé pour $d (source plus récente : $stale) — deploy REFUSÉ" >&2
    exit 1
  fi
done

if [[ "$TARGET" == "local" ]]; then
  echo ">> [1/2] Build (packages/ui, base par défaut — servi à la racine)"
else
  echo ">> [1/6] Build local (packages/ui, VITE_BASE_PATH=/kanopi/)"
fi
cd "$UI_DIR"
if [[ "$TARGET" == "local" ]]; then
  npm run build
else
  VITE_BASE_PATH=/kanopi/ npm run build
fi

if [[ ! -d "$UI_DIR/dist" || ! -f "$UI_DIR/dist/index.html" ]]; then
  echo "ERREUR : packages/ui/dist/index.html inexistant après build" >&2
  exit 1
fi

# ————————————————————————————— CIBLE local : servir le build frais ——————————————————————————
if [[ "$TARGET" == "local" ]]; then
  echo ">> [2/2] Serveur de test local (vite preview → $PREVIEW_PORT)"
  if curl -sf -o /dev/null "http://localhost:$PREVIEW_PORT/"; then
    # Un preview tourne déjà : il sert dist/ depuis le disque, donc il sert DÉJÀ le build
    # tout frais — pas de nouveau process (et on ne tue jamais un serveur qu'on n'a pas lancé).
    echo "   preview déjà actif sur $PREVIEW_PORT — il sert le dist/ fraîchement rebâti."
  else
    ( cd "$UI_DIR" && nohup npx vite preview --port "$PREVIEW_PORT" --strictPort \
        > /tmp/kanopi-preview-$PREVIEW_PORT.log 2>&1 & )
    sleep 2
    if ! curl -sf -o /dev/null "http://localhost:$PREVIEW_PORT/"; then
      echo "ERREUR : vite preview ne répond pas sur $PREVIEW_PORT (log : /tmp/kanopi-preview-$PREVIEW_PORT.log)" >&2
      exit 1
    fi
  fi
  echo ">> ✓ Build local FRAIS servi — http://localhost:$PREVIEW_PORT/ (dist amont rebâtis + gardés)"
  exit 0
fi

# ————————————————————————————— CIBLE prod : déploiement VPS (INCHANGÉ) —————————————————————
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
