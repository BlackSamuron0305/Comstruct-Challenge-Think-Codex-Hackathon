#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ACTION="${1:-update}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

ensure_env_file() {
  if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from .env.example."
    echo "Edit .env for your public host before deploying, then rerun this script."
    exit 1
  fi
}

ensure_keys() {
  if [ ! -f infra/keys/jwt_private.pem ] || [ ! -f infra/keys/jwt_public.pem ]; then
    echo "JWT keys missing. Generating them now."
    mkdir -p infra/keys
    openssl genpkey -algorithm RSA -out infra/keys/jwt_private.pem -pkeyopt rsa_keygen_bits:2048
    openssl rsa -pubout -in infra/keys/jwt_private.pem -out infra/keys/jwt_public.pem
  fi
}

warn_if_localhost_env() {
  if grep -Eq '^VITE_API_BASE_URL=.*localhost' .env; then
    echo "Warning: VITE_API_BASE_URL still points to localhost in .env."
    echo "Set it to your public host, for example:"
    echo "  VITE_API_BASE_URL=http://YOUR_VM_IP:8001/api"
  fi

  if grep -Eq '^VITE_WS_URL=.*localhost' .env; then
    echo "Warning: VITE_WS_URL still points to localhost in .env."
    echo "Set it to your public host, for example:"
    echo "  VITE_WS_URL=ws://YOUR_VM_IP:8001/ws"
  fi

  if grep -Eq '^CORS_ORIGIN=.*localhost' .env; then
    echo "Warning: CORS_ORIGIN still points to localhost in .env."
    echo "Set it to your public host, for example:"
    echo "  CORS_ORIGIN=http://YOUR_VM_IP:8080"
  fi
}

compose_up() {
  docker compose up -d --build
  docker compose ps
}

show_help() {
  cat <<'EOF'
Usage: ./scripts/deploy.sh [init|update|logs|status|pull]

Commands:
  init    Validate env, generate JWT keys if needed, then build and start the stack
  update  Pull latest git changes, then rebuild and restart the stack
  logs    Tail container logs
  status  Show container status
  pull    Pull latest git changes only
EOF
}

require_cmd docker
require_cmd git
require_cmd openssl

case "$ACTION" in
  init)
    ensure_env_file
    ensure_keys
    warn_if_localhost_env
    compose_up
    ;;
  update)
    ensure_env_file
    ensure_keys
    warn_if_localhost_env
    git pull --ff-only
    compose_up
    ;;
  logs)
    docker compose logs -f --tail=100
    ;;
  status)
    docker compose ps
    ;;
  pull)
    git pull --ff-only
    ;;
  help|-h|--help)
    show_help
    ;;
  *)
    echo "Unknown command: $ACTION" >&2
    show_help
    exit 1
    ;;
esac
