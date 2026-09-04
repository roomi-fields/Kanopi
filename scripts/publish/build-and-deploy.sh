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
  echo "  local : construit amont vérifié (bpx, kronos, kairos) + vite build + vite preview (4173)" >&2
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
# ⚠️ ET ICI AUSSI, PAS SEULEMENT AU PUSH : ce script construit et déploie sans qu'aucun git
# n'intervienne. Un déploiement lancé à la main pendant la fenêtre d'un voisin lirait ses sources en
# plein chantier, et le crochet de poussée ne le verrait jamais passer.
bash ~/dev/bp/hub/tools/garde-fenetre.sh || exit 1

echo ">> [0/6] Build doc utilisateur (MkDocs) → packages/ui/public/docs"
DOC_SRC="$REPO_ROOT/../atlas/doc-utilisateur"

# ⛔ MKDOCS LIT L'ARBRE DE TRAVAIL D'ATLAS, PAS UN COMMIT. Mesuré par Atlas le 2026-08-21, témoin
# vivant à l'appui : une page jamais enregistrée (état `??` chez git) ressort dans le site construit,
# en page ET dans son index de recherche. Aucun git n'intervient — ni son commit, ni sa poussée, ni
# son portillon. Une page à moitié réécrite partait donc en production sans que rien ne rougisse.
#
# ⚠️ ET IL EST INVISIBLE À TOUT LE RESTE DE MON OUTILLAGE : mon relevé de voisins est bâti sur les
# LIENS SYMBOLIQUES de node_modules, et atlas est consommé par CHEMIN. Il n'est dans aucun des onze,
# donc ni ma légende, ni mon garde de bascule, ni ma fenêtre de mesure ne le connaissent. Ce refus-ci
# ne couvre que la publication ; le reste est KAN-68 au backlog.
# ⚠️ CE RENVOI A ÉTÉ MUET DU 2026-08-21 AU 2026-08-25 : il disait « le reste est au backlog » et aucun
# item n'y était. Une affirmation du code se relit comme une preuve — celle-ci nomme désormais l'item,
# donc elle se vérifie.
#
# La règle est celle que j'applique déjà aux onze : je ne pars pas en production sur du non-enregistré
# QUI ENTRE DANS MON PAQUET. Sa doc entre dans mon paquet (`public/docs` → `dist/docs`), donc elle y
# tombe. Sa charte le dit désormais aussi (atlas f87b2d3).
#
# ⛔ `--no-optional-locks` PARCE QUE `status` RAFRAÎCHIT L'INDEX ET PREND `.git/index.lock` CHEZ LUI.
# Sa commande git échoue alors sur « Unable to create '.git/index.lock' », rarement et sans que rien
# dans son dépôt ne le nomme. Ces DEUX appels ont été trouvés par atlas le 2026-08-30, dans le geste
# où il me signalait le même défaut chez lui.
#
# ⇒ ILS ÉTAIENT HORS DES TROIS CHEMINS QUE J'AVAIS TRACÉS — relevé, gardes de structure, construction
#   — et j'avais écrit cette limite en rendant ma mesure. C'est par elle qu'il est entré : une borne
#   écrite se fait vérifier par quelqu'un d'autre, tue elle ne l'aurait pas été.
#
# ⚠️ ET IL Y EN A DEUX, LÀ OÙ SON CONSTAT EN NOMMAIT UN. Le second recompte ce que le premier a lu.
#
# ⛔ ATLAS LIT CETTE LIGNE, À MON COMMIT PUBLIÉ, À CHAQUE PASSAGE DE SON PORTILLON. C'est le seul garde
# qui protège sa publication contre sa propre doc non enregistrée, et il vit ICI — donc il le mesure au
# lieu de le supposer. ⇒ CHANGER LA GRAPHIE DE CET APPEL SE PRÉAVISE : quand j'ai inséré
# `--no-optional-locks` le 2026-08-30, son motif cherchait la chaîne contiguë `git -C "$DOC_SRC" status
# --porcelain` et le drapeau l'a brisée EN SON MILIEU. Son verdict a alors annoncé « AUCUN garde côté
# kanopi » pendant que ce garde était là et refusait toujours.
#
# ⚠️ ET LE FAUX EST PARTI SOUS UN VERT : sa garde était VERTE, seule sa mention de régime avait basculé,
# à l'intérieur d'un verdict de succès — un lecteur qui lit « VERTE » ne relit pas la ligne de régime.
# ⇒ Il a réancré son motif depuis ; le préavis reste dû au prochain changement de forme.
if [[ -d "$DOC_SRC" ]]; then
  DOC_SALE="$(git -C "$DOC_SRC" --no-optional-locks status --porcelain -- . 2>/dev/null | head -20)"
  if [[ -n "$DOC_SALE" ]]; then
    DOC_N="$(git -C "$DOC_SRC" --no-optional-locks status --porcelain -- . 2>/dev/null | wc -l)"
    if [[ "$TARGET" == "prod" ]]; then
      echo "ERREUR : la doc d'atlas porte $DOC_N modification(s) non enregistrée(s) — elles" >&2
      echo "         PARTIRAIENT en production, et rien ne les signalerait ensuite :" >&2
      printf '%s\n' "$DOC_SALE" | sed 's/^/           /' >&2
      echo "         Demande-lui d'enregistrer, ou déploie en local." >&2
      exit 1
    fi
    echo "   (local) la doc d'atlas porte $DOC_N modification(s) non enregistrée(s) — embarquées telles quelles" >&2
  fi
fi

if [[ -x "$DOC_SRC/.venv/bin/mkdocs" ]]; then
  ( cd "$DOC_SRC" && ./.venv/bin/mkdocs build -d "$UI_DIR/public/docs" )
elif [[ "$TARGET" == "prod" ]]; then
  echo "ERREUR : mkdocs introuvable ($DOC_SRC/.venv/bin/mkdocs) — doc embarquée non régénérée" >&2
  exit 1
else
  echo "   (local) mkdocs introuvable — doc embarquée non régénérée, on continue" >&2
fi

# CONSTRUIT AMONT PRÉSENT — vérifié LÀ OÙ MON BUILD LE RÉSOUT, c'est-à-dire dans mes propres
# `node_modules`. Le build de production consomme le `dist` de bpx, kronos et kairos par la condition
# d'export `import` ; ces trois-là sont installés en liens vers l'espace publié, donc le construit
# que j'embarque est celui de leur commit publié.
#
# ⛔ CETTE ÉTAPE CONSTRUISAIT DANS LEURS ARBRES DE TRAVAIL, ET CE GESTE EST MORT LE 2026-09-04.
# Elle faisait `npm run build` dans `../BPx`, `../kronos`, `../kairos`, puis comparait la date de
# leur `dist` à celle de leur `src`. Depuis que mes onze dépendances sont déclarées vers l'espace
# publié, AUCUNE de mes résolutions n'atteint plus ces arbres : le construit produit n'entrait plus
# dans mon paquet, et la garde qui suivait mesurait la fraîcheur d'un objet que je ne consomme pas.
#
# ⚠️ UNE GARDE QUI MESURE LE MAUVAIS OBJET EST PIRE QUE MORTE : elle rend un vert, et ce vert se lit
#   comme une preuve que ce que j'embarque est frais. Elle l'a été entre ma migration et ce retrait.
#
# ⛔ ET ELLE ÉCRIVAIT CHEZ TROIS VOISINS À CHAQUE DÉPLOIEMENT — une construction dans l'arbre d'autrui,
#   hors de mon périmètre, invisible à ma propre discipline de fenêtre puisque aucun git n'intervenait.
#
# ⇒ Ce qui reste vérifiable CHEZ MOI est la présence du construit dans ce que je résous. Sa
#   FRAÎCHEUR appartient au producteur et se règle à sa publication : dans une archive publiée, la
#   source et le construit viennent du même commit, et je n'ai aucun `src` à comparer.
echo ">> [0bis/6] Construit amont présent (bpx, kronos, kairos)…"
for p in bpx @kronos/core @kairos/core; do
  main="$REPO_ROOT/node_modules/$p/dist/index.js"
  if [[ ! -f "$main" ]]; then
    echo "ERREUR : $p ne porte pas son construit ($main) — deploy REFUSÉ" >&2
    echo "         Son archive publiée doit emporter son \`dist\` ; demande-le à son producteur." >&2
    exit 1
  fi
  echo "   - $p"
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
  echo ">> ✓ Build local servi — http://localhost:$PREVIEW_PORT/ (construit amont publié, vérifié présent)"
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
