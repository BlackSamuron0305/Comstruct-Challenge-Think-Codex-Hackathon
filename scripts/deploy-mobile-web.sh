#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ACTION="${1:-publish}"
API_BASE_URL="${API_BASE_URL:-${2:-}}"
MOBILE_DIR="$ROOT_DIR/apps/mobile"
BUILD_DIR="$MOBILE_DIR/build/web"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

ensure_flutter_web_scaffold() {
  if [ ! -d "$MOBILE_DIR/web" ]; then
    echo "Flutter web scaffolding is missing in apps/mobile/web."
    echo "Run this once on a machine with Flutter installed:"
    echo "  cd apps/mobile && flutter create --platforms=web ."
    exit 1
  fi
}

ensure_build_output() {
  if [ ! -f "$BUILD_DIR/index.html" ]; then
    echo "Flutter web build output is missing at apps/mobile/build/web."
    echo "Build it first with:"
    echo "  ./scripts/deploy-mobile-web.sh build http://YOUR_HOST:8001"
    exit 1
  fi
}

build_mobile_web() {
  require_cmd flutter
  ensure_flutter_web_scaffold

  if [ -z "$API_BASE_URL" ]; then
    echo "API base URL is required for Flutter web builds." >&2
    echo "Example:"
    echo "  ./scripts/deploy-mobile-web.sh build http://35.222.179.150:8001"
    exit 1
  fi

  (
    cd "$MOBILE_DIR"
    flutter pub get
    flutter build web --dart-define=API_BASE_URL="$API_BASE_URL"
  )

  echo "Flutter web bundle built in apps/mobile/build/web."
}

publish_mobile_web() {
  require_cmd docker
  ensure_build_output
  docker compose up -d mobile-web
  docker compose ps mobile-web
  echo "Flutter web demo should be available on http://HOST:8090"
}

show_help() {
  cat <<'EOF'
Usage: ./scripts/deploy-mobile-web.sh [build|publish|build-and-publish] [API_BASE_URL]

Commands:
  build              Build Flutter web output into apps/mobile/build/web
  publish            Start or refresh the mobile-web hosting container
  build-and-publish  Build the Flutter web bundle, then publish it

Examples:
  ./scripts/deploy-mobile-web.sh build http://35.222.179.150:8001
  ./scripts/deploy-mobile-web.sh publish
  API_BASE_URL=http://35.222.179.150:8001 ./scripts/deploy-mobile-web.sh build-and-publish
EOF
}

case "$ACTION" in
  build)
    build_mobile_web
    ;;
  publish)
    publish_mobile_web
    ;;
  build-and-publish)
    build_mobile_web
    publish_mobile_web
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
