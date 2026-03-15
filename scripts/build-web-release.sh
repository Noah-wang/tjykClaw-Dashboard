#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_NAME="${OUTPUT_NAME:-tjykclaw-dashboard-web-release.tar.gz}"
NODE_VERSION="${NODE_VERSION:-22.22.1}"
NODE_PLATFORM="${NODE_PLATFORM:-linux}"
NODE_ARCH="${NODE_ARCH:-x64}"
NODE_BASENAME="node-v${NODE_VERSION}-${NODE_PLATFORM}-${NODE_ARCH}"
NODE_ARCHIVE="${NODE_BASENAME}.tar.xz"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE}"
TMP_DIR="$(mktemp -d)"
STAGE_DIR="$TMP_DIR/tjyk-dashboard-web-release"
VENDOR_DIR="$STAGE_DIR/vendor"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$STAGE_DIR" "$VENDOR_DIR"

if command -v corepack >/dev/null 2>&1; then
  (cd "$PROJECT_DIR" && corepack pnpm build)
else
  (cd "$PROJECT_DIR" && pnpm build)
fi

mkdir -p "$STAGE_DIR/dist"
rsync -a "$PROJECT_DIR/dist/" "$STAGE_DIR/dist/"
cp "$PROJECT_DIR/frontend-web.mjs" "$STAGE_DIR/frontend-web.mjs"
cp "$PROJECT_DIR/scripts/install-web-release.sh" "$STAGE_DIR/install.sh"
chmod +x "$STAGE_DIR/install.sh"

pushd "$VENDOR_DIR" >/dev/null
curl -fsSL "$NODE_URL" -o "$NODE_ARCHIVE"
popd >/dev/null

tar -czf "$PROJECT_DIR/$OUTPUT_NAME" -C "$TMP_DIR" "$(basename "$STAGE_DIR")"
echo "Created $PROJECT_DIR/$OUTPUT_NAME"
