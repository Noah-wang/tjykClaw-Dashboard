#!/usr/bin/env bash
set -euo pipefail

VM_NAME="${VM_NAME:-tjykclaw-box}"
CPUS="${CPUS:-4}"
MEMORY="${MEMORY:-8G}"
DISK="${DISK:-20G}"
BRIDGE_IFACE="${BRIDGE_IFACE:-}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SIM_DIR="$ROOT_DIR/simulators/linux-device"
DEFAULT_MULTIPASS_BIN="/Library/Application Support/com.canonical.multipass/bin/multipass"
MULTIPASS_BIN="${MULTIPASS_BIN:-}"

if [[ -z "$MULTIPASS_BIN" ]]; then
  if [[ -x "$DEFAULT_MULTIPASS_BIN" ]]; then
    MULTIPASS_BIN="$DEFAULT_MULTIPASS_BIN"
  else
    MULTIPASS_BIN="$(command -v multipass || true)"
  fi
fi

if [[ -z "$MULTIPASS_BIN" || ! -x "$MULTIPASS_BIN" ]]; then
  echo "multipass is required but not installed."
  exit 1
fi

if [[ -z "$BRIDGE_IFACE" ]]; then
  echo "Available Multipass networks:"
  "$MULTIPASS_BIN" networks || true
  echo
  echo "Set BRIDGE_IFACE=en0 (or your LAN interface) and rerun."
  exit 1
fi

if "$MULTIPASS_BIN" info "$VM_NAME" >/dev/null 2>&1; then
  echo "VM $VM_NAME already exists."
else
  "$MULTIPASS_BIN" set "local.bridged-network=$BRIDGE_IFACE"
  "$MULTIPASS_BIN" launch 24.04 \
    --name "$VM_NAME" \
    --cpus "$CPUS" \
    --memory "$MEMORY" \
    --disk "$DISK" \
    --bridged \
    --cloud-init "$SIM_DIR/cloud-init.yaml"
fi

TARGET_MOUNT="/home/ubuntu/tjykClaw-Dashboard"
if ! "$MULTIPASS_BIN" info "$VM_NAME" | grep -q "$TARGET_MOUNT"; then
  "$MULTIPASS_BIN" mount "$ROOT_DIR" "$VM_NAME:$TARGET_MOUNT"
fi

"$MULTIPASS_BIN" transfer "$SIM_DIR/bootstrap-inside-vm.sh" "$VM_NAME:/home/ubuntu/bootstrap-inside-vm.sh"
"$MULTIPASS_BIN" exec "$VM_NAME" -- chmod +x /home/ubuntu/bootstrap-inside-vm.sh
"$MULTIPASS_BIN" exec "$VM_NAME" -- /home/ubuntu/bootstrap-inside-vm.sh "$TARGET_MOUNT"

VM_IP="$("$MULTIPASS_BIN" info "$VM_NAME" | awk '/IPv4/{getline; print $2; exit}')"
echo
echo "Linux OpenClaw device simulator ready."
echo "VM name: $VM_NAME"
echo "VM IP:   $VM_IP"
echo
echo "Open in your browser:"
echo "  http://$VM_IP:3210"
echo
echo "In the pairing screen, use:"
echo "  http://$VM_IP:3210"
