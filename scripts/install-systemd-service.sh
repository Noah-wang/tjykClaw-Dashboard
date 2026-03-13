#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SERVICE_NAME="${SERVICE_NAME:-tjykclaw-dashboard-bridge}"
PORT="${PORT:-3211}"
HOST="${HOST:-0.0.0.0}"
OPENCLAW_BIN="${OPENCLAW_BIN:-$(command -v openclaw || true)}"
SYSTEMD_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

if [[ ! -f "$PROJECT_DIR/package.json" ]]; then
  echo "Missing package.json in $PROJECT_DIR"
  exit 1
fi

if [[ -z "$OPENCLAW_BIN" ]]; then
  echo "openclaw is not in PATH. Set OPENCLAW_BIN=/path/to/openclaw and rerun."
  exit 1
fi

sudo tee "$SYSTEMD_FILE" >/dev/null <<EOF
[Unit]
Description=tjykClaw-Dashboard bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
Environment=HOST=$HOST
Environment=PORT=$PORT
Environment=OPENCLAW_BIN=$OPENCLAW_BIN
ExecStart=/usr/bin/env pnpm device-bridge
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE_NAME"
sudo systemctl status "$SERVICE_NAME" --no-pager
