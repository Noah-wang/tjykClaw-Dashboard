#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PORT="${PORT:-3211}"
HOST="${HOST:-0.0.0.0}"
SERVICE_NAME="${SERVICE_NAME:-tjykclaw-dashboard-web}"
NODE_ARCHIVE="${NODE_ARCHIVE:-$(find "$PROJECT_DIR/vendor" -maxdepth 1 -type f -name 'node-v*-linux-*.tar.xz' | head -n 1)}"
RUNTIME_DIR="$PROJECT_DIR/.runtime"
NODE_DIR="$RUNTIME_DIR/node"

if [[ ! -d "$PROJECT_DIR/dist" ]]; then
  echo "Missing dist in $PROJECT_DIR"
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

sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" >/dev/null <<EOF
[Unit]
Description=tjykClaw Web UI
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
Environment=HOST=$HOST
Environment=PORT=$PORT
ExecStart=$NODE_DIR/bin/node $PROJECT_DIR/frontend-web.mjs
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE_NAME"
sudo systemctl status "$SERVICE_NAME" --no-pager || true
echo
echo "Installed web UI. Open http://<this-computer-ip>:${PORT}"
echo "Then pair your device bridge address, usually http://<device-ip>:3210"
