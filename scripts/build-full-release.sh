#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_NAME="${OUTPUT_NAME:-tjykclaw-dashboard-full-release.tar.gz}"
OPENCLAW_VERSION="${OPENCLAW_VERSION:-2026.3.8}"
NODE_VERSION="${NODE_VERSION:-22.22.1}"
NODE_PLATFORM="${NODE_PLATFORM:-linux}"
NODE_ARCH="${NODE_ARCH:-x64}"
NODE_BASENAME="node-v${NODE_VERSION}-${NODE_PLATFORM}-${NODE_ARCH}"
NODE_ARCHIVE="${NODE_BASENAME}.tar.xz"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE}"
TMP_DIR="$(mktemp -d)"
STAGE_DIR="$TMP_DIR/tjyk-dashboard-release"
VENDOR_DIR="$STAGE_DIR/vendor"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

mkdir -p "$STAGE_DIR" "$VENDOR_DIR"

rsync -a \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.git' \
  --exclude '*.tsbuildinfo' \
  --exclude 'out*.log' \
  --exclude 'bridge.log' \
  --exclude 'test-*.mjs' \
  --exclude 'test-*.js' \
  --exclude 'ws-test*.mjs' \
  --exclude 'tjykclaw-dashboard-release.tar.gz' \
  --exclude 'tjykclaw-dashboard-full-release.tar.gz' \
  "$PROJECT_DIR"/ "$STAGE_DIR"/

pushd "$VENDOR_DIR" >/dev/null
npm pack "openclaw@${OPENCLAW_VERSION}" >/dev/null
curl -fsSL "$NODE_URL" -o "$NODE_ARCHIVE"
popd >/dev/null

cat >"$STAGE_DIR/install.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-3210}"
HOST="${HOST:-0.0.0.0}"
SERVICE_NAME="${SERVICE_NAME:-tjykclaw-dashboard}"
OPENCLAW_TGZ="$(find "$PROJECT_DIR/vendor" -maxdepth 1 -type f -name 'openclaw-*.tgz' | head -n 1)"
NODE_ARCHIVE="$(find "$PROJECT_DIR/vendor" -maxdepth 1 -type f -name 'node-v*-linux-*.tar.xz' | head -n 1)"
RUNTIME_DIR="$PROJECT_DIR/.runtime"
NODE_DIR="$RUNTIME_DIR/node"

if [[ -z "$OPENCLAW_TGZ" ]]; then
  echo "Missing bundled OpenClaw package in $PROJECT_DIR/vendor"
  exit 1
fi

if [[ ! -x "$NODE_DIR/bin/node" ]]; then
  if [[ -z "$NODE_ARCHIVE" ]]; then
    echo "Missing bundled Node.js runtime in $PROJECT_DIR/vendor"
    exit 1
  fi
  mkdir -p "$RUNTIME_DIR"
  rm -rf "$NODE_DIR"
  tar -xJf "$NODE_ARCHIVE" -C "$RUNTIME_DIR"
  mv "$RUNTIME_DIR"/node-v*-linux-* "$NODE_DIR"
fi

export PATH="$NODE_DIR/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js runtime is unavailable after extraction."
  exit 1
fi

if [[ ! -x "$NODE_DIR/bin/pnpm" ]]; then
  "$NODE_DIR/bin/npm" install -g pnpm@10.31.0 --prefix "$NODE_DIR"
fi

"$NODE_DIR/bin/npm" install
"$NODE_DIR/bin/npm" run build
"$NODE_DIR/bin/npm" install -g "$OPENCLAW_TGZ" --prefix "$NODE_DIR"

sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" >/dev/null <<EOT
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
EOT

sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE_NAME"
sudo systemctl status "$SERVICE_NAME" --no-pager || true
echo
echo "Installed. Open http://<device-ip>:${PORT}"
EOF

chmod +x "$STAGE_DIR/install.sh"

tar -czf "$PROJECT_DIR/$OUTPUT_NAME" -C "$TMP_DIR" "$(basename "$STAGE_DIR")"
echo "Created $PROJECT_DIR/$OUTPUT_NAME"
