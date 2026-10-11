#!/usr/bin/env bash
# Screenshot comparison (e2e/visual.spec.ts) with the browser in the official Playwright
# Linux image, so baselines match between any machine and CI. Uses the app on PORT
# (default 3000): CI's Playwright web server, or one you started (`pnpm start`).
#   scripts/visual.sh                      compare
#   scripts/visual.sh --update-snapshots   rewrite the baselines after an intended change
set -euo pipefail
cd "$(dirname "$0")/.."
ver=$(node -p "require('@playwright/test/package.json').version")
port=${PORT:-3000}
name="eyeq-visual-$$"
if [[ $(uname) == Linux ]]; then
  net=(--network host)
  base="http://localhost:$port"
else
  net=(-p 3333:3333 --add-host=host.docker.internal:host-gateway)
  base="http://host.docker.internal:$port"
fi
docker run -d --rm --init --name "$name" "${net[@]}" "mcr.microsoft.com/playwright:v$ver-noble" \
  /bin/sh -c "cd /tmp && npx -y playwright@$ver run-server --port 3333 --host 0.0.0.0" >/dev/null
trap 'docker stop "$name" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 120); do
  curl -s -o /dev/null http://localhost:3333 && break
  sleep 1
done
PW_WS_ENDPOINT=ws://localhost:3333/ PW_BASE_URL="$base" pnpm exec playwright test e2e/visual.spec.ts "$@"
