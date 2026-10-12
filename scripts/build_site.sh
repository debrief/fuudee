#!/usr/bin/env bash
# Builds the blog and guides, with the playground when this checkout has one,
# into the given folder (default site/site). Used to publish main and to
# preview pull requests, so both are built the same way.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$(realpath -m "${1:-$root/site/site}")"
cd "$root"
if [ -x scripts/build_playground.sh ]; then
  uv sync --locked
  for package in schemas kernel config; do
    npm ci --prefix "ts/$package"
    npm run --prefix "ts/$package" build
  done
  npm ci --prefix vscode
  scripts/build_playground.sh
fi
uv sync --locked --only-group docs
uv run --only-group docs mkdocs build --strict --config-file site/mkdocs.yml --site-dir "$out"
# Pages must serve the files as they are, not through Jekyll.
touch "$out/.nojekyll"
