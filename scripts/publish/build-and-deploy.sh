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

# Doc utilisateur EMBARQUÉE → packages/ui/public/docs, posée AVANT le vite build (public/ → dist/)
# pour être servie à la même origine sous /kanopi/docs — SOURCE UNIQUE ([463]).
# L'artefact public/docs est git-ignoré ; c'est CETTE étape qui le (re)produit à chaque déploiement.
# ⇒ Le refus vaut pour LES DEUX cibles. Il portait un régime par cible — obligatoire en production,
#   au mieux en local — et cette différence justifiait qu'un déploiement local serve une aide périmée
#   sans le dire. La cible décide de ce qu'on publie, jamais de ce qu'on affirme.
# ⚠️ ET ICI AUSSI, PAS SEULEMENT AU PUSH : ce script construit et déploie sans qu'aucun git
# n'intervienne. Un déploiement lancé à la main pendant la fenêtre d'un voisin lirait ses sources en
# plein chantier, et le crochet de poussée ne le verrait jamais passer.
bash ~/dev/bp/hub/tools/garde-fenetre.sh || exit 1

echo ">> [0/6] Aide utilisateur publiee par atlas -> packages/ui/public/docs"

# ⛔ LA SOURCE EST LE SITE BÂTI PAR ATLAS, DANS SON ESPACE PUBLIÉ. Cette étape appelait le mkdocs qui
# vit dans l'arbre d'atlas, et bâtissait son aide avec ses affaires. Ce chemin a cessé d'exister le
# 2026-09-04 : ma session tourne sous enveloppe, et de mes voisins je ne vois plus que
# `.publie/<nom>/`. Mesuré — `/home/romi/dev/bp` ne porte que `hub`, `kanopi`, `.paquets`, `.publie`.
#
# ⛔ CE QUI DISPARAÎT AVEC, ET LE PRÉAVIS EST PARTI : le garde qui refusait de partir en production
# quand la doc d'atlas portait du non-enregistré. Il lisait son arbre par `git -C "$DOC_SRC" status`,
# et ATLAS CHERCHAIT CETTE CHAÎNE CHEZ MOI, à mon commit publié, à chaque passage de son portillon —
# c'était le seul garde protégeant sa publication contre sa propre doc sale, et il vivait ici.
#
# ⇒ Il n'est pas retiré, il est SANS OBJET : je ne peux plus voir son arbre du tout, donc sa doc non
#   enregistrée ne peut plus m'atteindre, quoi qu'il écrive. Ce que je consomme est ce qu'il PUBLIE.
# ⚠️ CE QU'IL PERD QUAND MÊME, ET JE LE NOMME : il n'a plus, chez moi, de miroir lui disant que sa doc
#   est sale. Si ce signal lui sert, il le tient chez lui — je ne peux plus le lui rendre.
#
# ⇒ Bâtir l'aide n'a jamais été mon geste : je porte l'interface, atlas porte la documentation.
# ⚠️ DEUX EMPLACEMENTS, ET L'ORDRE EST LE POINT. Atlas déclare son site à `doc-utilisateur/site`,
# mais l'outil de publication du hub dépose un chemin de DEUX segments à la racine de l'archive : le
# site atterrit en `site/`, pendant que l'empreinte annonce le chemin déclaré. Le défaut est chez
# l'outil, remonté par atlas ; il ne renomme pas sa sortie pour le contourner.
# ⇒ Le DÉCLARÉ d'abord, l'accidentel ensuite : à la réparation, le premier répond et le second cesse
#   d'être atteint, sans que personne ait à revenir ici.
ATLAS_PUBLIE="$REPO_ROOT/../.publie/atlas"
DOC_SITE=""
for candidat in "doc-utilisateur/site" "site"; do
  if [[ -f "$ATLAS_PUBLIE/$candidat/index.html" ]]; then
    DOC_SITE="$ATLAS_PUBLIE/$candidat"
    break
  fi
done

if [[ -z "$DOC_SITE" ]]; then
  echo "ERREUR : le site bati d atlas est absent ($ATLAS_PUBLIE — ni doc-utilisateur/site, ni site) — deploy REFUSE" >&2
  echo "         Son espace publie ne porte aujourd hui que les sources markdown ; l outil qui" >&2
  echo "         les batit vit dans son arbre, hors de mon enveloppe." >&2
  echo "         Atlas doit PUBLIER sa documentation construite." >&2
  exit 1
fi

rm -rf "$UI_DIR/public/docs"
cp -r "$DOC_SITE" "$UI_DIR/public/docs"
echo "   aide publiee copiee depuis $DOC_SITE"

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
