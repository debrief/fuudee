#!/usr/bin/env bash
# Python writes every valid fixture of every document kind, TypeScript validates and rewrites it,
# Python reads it back and compares with the original.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

uv run --project "$root" python -m debrief_schemas.roundtrip export "$root/schemas/fixtures" "$work/py"
(cd "$root/ts/schemas" && npm run --silent build && node scripts/roundtrip.mjs "$work/py" "$work/ts")
uv run --project "$root" python -m debrief_schemas.roundtrip verify "$root/schemas/fixtures" "$work/ts"
