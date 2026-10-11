#!/usr/bin/env bash
# Pyodide spike (CON-09): run the same smoke test under CPython and Pyodide and compare.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

rm -rf "$here/wheels" && mkdir -p "$here/wheels"
uv build --project "$root" --package debrief-schemas --wheel --out-dir "$here/wheels" -q
uv build --project "$root" --package debrief-kernel --wheel --out-dir "$here/wheels" -q
# The tool framework and core tools (not the HTTP service, which runs only on the desktop).
for package in debrief-config debrief-stac debrief-tools; do
  uv build --project "$root" --package "$package" --wheel --out-dir "$here/wheels" -q
done
uv run --project "$root" --with pip python -m pip download --no-deps --only-binary :all: --dest "$here/wheels" -q "geographiclib==2.1"

uv run --project "$root" python "$here/smoke.py" "$root/schemas/fixtures" > "$work/cpython.json"
(cd "$here" && npm ci --silent && node run.mjs "$work/cpython.json" "$work/pyodide.json")
