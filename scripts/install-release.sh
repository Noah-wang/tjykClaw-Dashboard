#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PORT="${PORT:-3210}"
HOST="${HOST:-0.0.0.0}"
SERVICE_NAME="${SERVICE_NAME:-tjykclaw-dashboard}"
OPENCLAW_TGZ="${OPENCLAW_TGZ:-$(find "$PROJECT_DIR/vendor" -maxdepth 1 -type f -name 'openclaw-*.tgz' | head -n 1)}"
NODE_ARCHIVE="${NODE_ARCHIVE:-$(find "$PROJECT_DIR/vendor" -maxdepth 1 -type f -name 'node-v*-linux-*.tar.xz' | head -n 1)}"
RUNTIME_DIR="$PROJECT_DIR/.runtime"
NODE_DIR="$RUNTIME_DIR/node"

if [[ ! -f "$PROJECT_DIR/package.json" ]]; then
  echo "Missing package.json in $PROJECT_DIR"
  exit 1
fi

if [[ -z "$OPENCLAW_TGZ" || ! -f "$OPENCLAW_TGZ" ]]; then
  echo "Bundled OpenClaw package not found under $PROJECT_DIR/vendor"
  exit 1
fi

if [[ ! -x "$NODE_DIR/bin/node" ]]; then
  if [[ -z "$NODE_ARCHIVE" || ! -f "$NODE_ARCHIVE" ]]; then
    echo "Bundled Node.js runtime not found under $PROJECT_DIR/vendor"
    exit 1
  fi
  mkdir -p "$RUNTIME_DIR"
  rm -rf "$NODE_DIR"
  tar -xJf "$NODE_ARCHIVE" -C "$RUNTIME_DIR"
  mv "$RUNTIME_DIR"/node-v*-linux-* "$NODE_DIR"
fi

export PATH="$NODE_DIR/bin:$PATH"
if [[ ! -x "$NODE_DIR/bin/pnpm" ]]; then
  "$NODE_DIR/bin/npm" install -g pnpm@10.31.0 --prefix "$NODE_DIR"
fi

"$NODE_DIR/bin/npm" install
"$NODE_DIR/bin/npm" run build
"$NODE_DIR/bin/npm" install -g "$OPENCLAW_TGZ" --prefix "$NODE_DIR"

sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" >/dev/null <<EOF
[Unit]
Description=tjykClaw Dashboard
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
Environment=HOST=$HOST
Environment=PORT=$PORT
Environment=OPENCLAW_BIN=$NODE_DIR/bin/openclaw
Environment=PATH=$NODE_DIR/bin:$NODE_DIR/lib/node_modules/pnpm/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=$NODE_DIR/bin/node $PROJECT_DIR/real-device-bridge.mjs
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE_NAME"
sudo systemctl status "$SERVICE_NAME" --no-pager || true
