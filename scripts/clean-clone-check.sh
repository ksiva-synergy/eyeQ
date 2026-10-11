#!/usr/bin/env bash
# A fresh clone runs `pnpm i && pnpm dev` and serves pages (phase 0's "clone, install,
# run" promise). Clones the committed tree (not the working copy) into a temporary
# directory, installs with the lockfile, copies .env.example to .env (local values only,
# never a hosted database), starts `pnpm dev` and requests a few pages that compile the
# app, the UI package and the generated Prisma client.
#   scripts/clean-clone-check.sh [ref]      default HEAD; needs port 3000 free
set -euo pipefail

ref=${1:-HEAD}
repo=$(git rev-parse --show-toplevel)
sha=$(git -C "$repo" rev-parse "$ref")
dir=$(mktemp -d)
pid=""
cleanup() {
  if [[ -n $pid ]]; then kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true; fi
  rm -rf "$dir"
}
trap cleanup EXIT

if curl -fsS -o /dev/null http://localhost:3000/api/health 2>/dev/null; then
  echo "port 3000 is in use; stop that server first" >&2
  exit 2
fi

echo "# clone $sha"
git clone -q --no-local "$repo" "$dir/eyeq"
cd "$dir/eyeq"
git checkout -q "$sha"

echo "# pnpm install --frozen-lockfile"
pnpm install --frozen-lockfile --reporter=silent

cp .env.example .env

echo "# pnpm dev"
set -m # its own process group, so cleanup stops turbo and next together
pnpm dev > "$dir/dev.log" 2>&1 &
pid=$!
set +m

for _ in $(seq 1 180); do
  curl -fsS -o /dev/null http://localhost:3000/api/health 2>/dev/null && break
  if ! kill -0 "$pid" 2>/dev/null; then
    cat "$dir/dev.log"
    echo "not ok - pnpm dev exited" >&2
    exit 1
  fi
  sleep 1
done

failures=0
for path in /api/health /sign-in /dev/components; do
  # next dev compiles each route on first request, so allow it time.
  status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 180 "http://localhost:3000$path")
  if [[ $status == 200 ]]; then
    echo "ok - GET $path"
  else
    echo "not ok - GET $path ($status)"
    failures=$((failures + 1))
  fi
done

if ((failures > 0)); then
  tail -50 "$dir/dev.log"
  exit 1
fi
echo "# clean clone: pnpm i && pnpm dev serve the app"
