#!/usr/bin/env bash
# Tote latency spike (NFR-04): start the service at several data volumes and
# measure each interaction pattern from a Node client.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
deps=(--with "pyproj==3.8.0" --with "numpy==2.5.4" --with "starlette==1.7.0" --with "uvicorn==0.54.0")

uv run --project "$root" "${deps[@]}" python "$here/service.py" --check

for config in "5 360" "5 2160" "5 21600" "20 2160"; do
  read -r secondaries bearings <<<"$config"
  port=$((20000 + RANDOM % 20000))
  token="$(head -c 24 /dev/urandom | base64 | tr -d '/+=')"
  uv run --project "$root" "${deps[@]}" python "$here/service.py" "$port" "$token" "$secondaries" "$bearings" &
  server=$!
  for _ in $(seq 1 300); do
    curl -sf -o /dev/null -H "authorization: Bearer $token" "http://127.0.0.1:$port/health" && break
    sleep 0.2
  done
  node "$here/client.mjs" "$port" "$token" "$secondaries secondaries, $bearings bearings"
  kill "$server"; wait "$server" 2>/dev/null || true
done
