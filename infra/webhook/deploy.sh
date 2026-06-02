#!/bin/sh
set -eu

cd /opt/jobradar

PREV_SHA=$(git rev-parse HEAD)
git fetch --all
git reset --hard origin/main
NEW_SHA=$(git rev-parse HEAD)

if [ "$PREV_SHA" = "$NEW_SHA" ]; then
    echo "[deploy] no changes"
    exit 0
fi

CHANGED=$(git diff --name-only "$PREV_SHA" "$NEW_SHA")
echo "[deploy] changed files:"
echo "$CHANGED" | sed 's/^/  /'

if ! echo "$CHANGED" | grep -qvE '^(context/|docs/|\.github/|.*\.md$|LICENSE$)'; then
    echo "[deploy] docs-only/context-only change, skipping rebuild"
    exit 0
fi

echo "[deploy] launching detached sibling deployer (logs: /opt/jobradar/deploy.log)"

docker run -d --rm \
  --name "jobradar-deployer-$(date +%s)" \
  -v /opt/jobradar:/opt/jobradar \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -w /opt/jobradar \
  docker:cli \
  sh -c '
    set -eux
    docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
    echo "[deployer] done"
  ' >> /opt/jobradar/deploy.log 2>&1

echo "[deploy] sibling deployer spawned, deploy.sh exiting (tail /opt/jobradar/deploy.log)"
