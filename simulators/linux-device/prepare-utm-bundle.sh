#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/simulators/linux-device/out}"
ARCHIVE_PATH="${ARCHIVE_PATH:-$OUT_DIR/tjykClaw-Dashboard-utm-bundle.tgz}"

mkdir -p "$OUT_DIR"

tar \
  --exclude='./node_modules' \
  --exclude='./dist' \
  --exclude='./*.tsbuildinfo' \
  --exclude='./simulators/linux-device/out' \
  -czf "$ARCHIVE_PATH" \
  -C "$ROOT_DIR" \
  .

echo "Created bundle:"
echo "  $ARCHIVE_PATH"
