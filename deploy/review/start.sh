#!/bin/sh
# Starts the review copy from the image's seed: a fresh workspace on every start,
# so a restart resets it. Everything written goes under /tmp, whatever user Heroku runs as.
set -eu
: "${PASSWORD:?Set PASSWORD: heroku config:set PASSWORD=...}"

state=/tmp/debrief-review
rm -rf "$state"
cp -R /opt/review/seed "$state"
export HOME="$state/home"
export DEBRIEF_CONFIG="$state/config.json"
mkdir -p "$HOME"

# Heroku may run the container as a user /etc/passwd does not name: the name a plot's
# history gives the analyst is then USER's.
export USER=reviewer

# Each browser window has its own extension host and tool service, about 300 MB together,
# kept after the window closes for the reconnection grace time: 10 minutes, not 3 hours.
exec code-server \
  --bind-addr "0.0.0.0:${PORT:-8080}" \
  --auth password \
  --user-data-dir "$state/user-data" \
  --extensions-dir "$state/extensions" \
  --disable-telemetry \
  --disable-update-check \
  --reconnection-grace-time 600 \
  --app-name "Debrief review" \
  --welcome-text "A review copy of Debrief with sample data. Do not open sensitive data here. It resets on every restart." \
  "$state/workspace"
