#!/usr/bin/env bash
set -euo pipefail

REPO_TARBALL_URL="${ARC_SYNC_REMOTE_PACKAGE_URL:-https://github.com/trivial-boy/arc-sidebar-sync/archive/refs/heads/main.tar.gz}"
INSTALL_ROOT="${ARC_SYNC_INSTALL_ROOT:-$HOME/Library/Application Support/arc-sidebar-sync}"
APP_DIR="$INSTALL_ROOT/app"
BIN_DIR="$INSTALL_ROOT/bin"
TMP_DIR="$(mktemp -d)"
EXTENSION_ID=""
BROWSER="arc"

cleanup() {
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

while [[ $# -gt 0 ]]; do
  case "$1" in
    --extension-id)
      EXTENSION_ID="${2:-}"
      shift 2
      ;;
    --browser)
      BROWSER="${2:-arc}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$EXTENSION_ID" ]]; then
  echo "Missing required argument: --extension-id" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Please install Node.js 20+ first." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required. Please install npm first." >&2
  exit 1
fi

mkdir -p "$APP_DIR" "$BIN_DIR"

echo "[arc-sync] downloading helper package..."
curl -fsSL "$REPO_TARBALL_URL" -o "$TMP_DIR/arc-sidebar-sync.tar.gz"

echo "[arc-sync] extracting helper package..."
tar -xzf "$TMP_DIR/arc-sidebar-sync.tar.gz" -C "$TMP_DIR"
EXTRACTED_DIR="$(find "$TMP_DIR" -maxdepth 1 -mindepth 1 -type d | head -n 1)"

if [[ -z "$EXTRACTED_DIR" ]]; then
  echo "Failed to extract helper package." >&2
  exit 1
fi

rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"
cp -R "$EXTRACTED_DIR"/. "$APP_DIR"/

echo "[arc-sync] installing dependencies..."
cd "$APP_DIR"
npm install --omit=dev

cat > "$BIN_DIR/arc-sync" <<EOF
#!/bin/sh
exec "$(command -v node)" "$APP_DIR/src/index.js" "\$@"
EOF
chmod +x "$BIN_DIR/arc-sync"

echo "[arc-sync] registering native host..."
if REGISTER_OUTPUT="$("$BIN_DIR/arc-sync" install-native-host --extension-id "$EXTENSION_ID" --browser "$BROWSER" 2>&1)"; then
  echo "Helper 通信注册成功。"
else
  echo "$REGISTER_OUTPUT" >&2
  exit 1
fi

echo
echo "Helper 已安装到本机。"
echo "安装位置：$BIN_DIR/arc-sync"
echo "可返回 Arc 点击“重新检测”。"
