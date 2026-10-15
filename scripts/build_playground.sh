#!/usr/bin/env bash
# Builds the blog's playground into site/docs/play: Debrief's webviews and the
# page that hosts them, wheels of the Debrief Python packages for Pyodide, and
# the sample exercise. Needs the TypeScript packages built (ts/*) and vscode's
# node modules installed.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="${1:-$root/site/docs/play}"
rm -rf "$out" && mkdir -p "$out/wheels"

for package in debrief-schemas debrief-kernel debrief-config debrief-stac debrief-io debrief-tools; do
  uv build --project "$root" --package "$package" --wheel --out-dir "$out/wheels" -q
done
uv run --project "$root" --with pip python -m pip download --no-deps --only-binary :all: \
  --dest "$out/wheels" -q "geographiclib==2.1" $(python3 "$root/scripts/locked_requirements.py" pypdf olefile)

uv run --project "$root" python -m debrief_sample build "$out/sample" > /dev/null

(cd "$out" && python3 - <<'PY'
import json, pathlib
here = pathlib.Path(".")
manifest = {
    "wheels": sorted(p.name for p in (here / "wheels").glob("*.whl")),
    "sample": sorted(str(p.relative_to("sample")) for p in (here / "sample").rglob("*") if p.is_file()),
}
pathlib.Path("manifest.json").write_text(json.dumps(manifest, indent=1))
PY
)
(cd "$root/vscode" && node scripts/build-play.mjs "$out")
