#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_NAME="${OUTPUT_NAME:-tjykclaw-dashboard-bridge-release.tar.gz}"
OPENCLAW_VERSION="${OPENCLAW_VERSION:-2026.3.8}"
BONJOUR_VERSION="${BONJOUR_VERSION:-1.3.0}"
NODE_VERSION="${NODE_VERSION:-22.22.1}"
NODE_PLATFORM="${NODE_PLATFORM:-linux}"
NODE_ARCH="${NODE_ARCH:-x64}"
NODE_BASENAME="node-v${NODE_VERSION}-${NODE_PLATFORM}-${NODE_ARCH}"
NODE_ARCHIVE="${NODE_BASENAME}.tar.xz"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE}"
TMP_DIR="$(mktemp -d)"
STAGE_DIR="$TMP_DIR/tjyk-dashboard-bridge-release"
VENDOR_DIR="$STAGE_DIR/vendor"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$STAGE_DIR" "$VENDOR_DIR"

cp "$PROJECT_DIR/real-device-bridge.mjs" "$STAGE_DIR/real-device-bridge.mjs"
cp "$PROJECT_DIR/scripts/install-bridge-release.sh" "$STAGE_DIR/install.sh"
chmod +x "$STAGE_DIR/install.sh"

pushd "$VENDOR_DIR" >/dev/null
npm pack "openclaw@${OPENCLAW_VERSION}" >/dev/null
npm pack "bonjour-service@${BONJOUR_VERSION}" >/dev/null
curl -fsSL "$NODE_URL" -o "$NODE_ARCHIVE"
popd >/dev/null

tar -czf "$PROJECT_DIR/$OUTPUT_NAME" -C "$TMP_DIR" "$(basename "$STAGE_DIR")"
echo "Created $PROJECT_DIR/$OUTPUT_NAME"
