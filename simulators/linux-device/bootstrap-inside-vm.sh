#!/usr/bin/env bash
set -euo pipefail

WORKDIR="${1:-$HOME/tjykClaw-Dashboard}"
WEB_DIR="$WORKDIR"
SERVICE_NAME="tjykclaw-dashboard-bridge"
SYSTEMD_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

if [[ ! -f "$WEB_DIR/package.json" ]]; then
  echo "Missing $WEB_DIR"
  exit 1
fi

cd "$WEB_DIR"
corepack pnpm install
corepack pnpm build
sudo npm install -g openclaw@2026.3.8

sudo tee "$SYSTEMD_FILE" >/dev/null <<EOF
[Unit]
Description=tjykClaw-Dashboard 设备桥接服务
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$WEB_DIR
Environment=HOST=0.0.0.0
Environment=PORT=3210
ExecStart=/usr/bin/env corepack pnpm device-bridge
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE_NAME"
sudo systemctl status "$SERVICE_NAME" --no-pager || true
