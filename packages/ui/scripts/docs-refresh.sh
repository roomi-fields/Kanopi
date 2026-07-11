#!/usr/bin/env bash
# Rebuild the embedded user docs (public/docs/, git-ignored) from atlas/doc-utilisateur
# for the DEV loop. Same command as scripts/publish/build-and-deploy.sh's [0/6] step,
# which is the only place this normally runs (at deploy time) — dev sessions never see
# doc-utilisateur updates until this is run manually. Best-effort: absence of mkdocs
# just warns, it never blocks dev.
set -euo pipefail

UI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOC_SRC="$UI_DIR/../../../atlas/doc-utilisateur"

if [[ -x "$DOC_SRC/.venv/bin/mkdocs" ]]; then
  ( cd "$DOC_SRC" && ./.venv/bin/mkdocs build -d "$UI_DIR/public/docs" )
  echo "docs:refresh — public/docs mis à jour depuis $DOC_SRC"
else
  echo "docs:refresh — mkdocs introuvable ($DOC_SRC/.venv/bin/mkdocs), public/docs inchangé" >&2
fi
