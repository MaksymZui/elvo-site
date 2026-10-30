#!/usr/bin/env bash
# ELVO production deploy: cd /opt/elvo && bash deploy/deploy.sh
# git pull → build → up -d (waits for healthy) → docker cache prune → ps
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.prod.yml)

log() { printf '\n==> %s\n' "$*"; }

log "git pull"
git pull --ff-only

log "docker network edge"
docker network create edge >/dev/null 2>&1 || true

log "build and start"
"${COMPOSE[@]}" up -d --build --wait

# Keeps the disk from filling up with build cache and old image layers; a failed prune must not fail the deploy.
log "prune docker build cache (keep 5GB) and dangling images"
docker builder prune -f --reserved-space 5GB || true
docker image prune -f || true

log "status"
"${COMPOSE[@]}" ps
