#!/usr/bin/env bash
set -euo pipefail

REPO_TARBALL_URL="${ARC_SYNC_REMOTE_PACKAGE_URL:-https://github.com/trivial-boy/arc-sidebar-sync/archive/refs/heads/main.tar.gz}"
INSTALL_ROOT="${ARC_SYNC_INSTALL_ROOT:-$HOME/Library/Application Support/arc-sidebar-sync}"
APP_DIR="$INSTALL_ROOT/app"
BIN_DIR="$INSTALL_ROOT/bin"
INSTALL_STATE_FILE="$INSTALL_ROOT/install-state.env"
TMP_DIR="$(mktemp -d)"
EXTENSION_ID=""
BROWSER="arc"
CURRENT_VERSION=""
CURRENT_PACKAGE_SHA256=""
REMOTE_VERSION=""
REMOTE_PACKAGE_SHA256=""
INSTALL_MODE="install"

read_package_version() {
  local package_json_path="$1"
  if [[ ! -f "$package_json_path" ]]; then
    return 0
  fi

  node -e 'const fs = require("fs"); const file = process.argv[1]; const pkg = JSON.parse(fs.readFileSync(file, "utf8")); process.stdout.write(pkg.version || "");' "$package_json_path"
}

read_sha256() {
  local file_path="$1"
  shasum -a 256 "$file_path" | awk '{print $1}'
}

write_install_state() {
  cat > "$INSTALL_STATE_FILE" <<EOF
PACKAGE_SHA256='$REMOTE_PACKAGE_SHA256'
PACKAGE_VERSION='$REMOTE_VERSION'
SOURCE_URL='$REPO_TARBALL_URL'
EOF
}

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

if [[ -f "$INSTALL_STATE_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$INSTALL_STATE_FILE"
  CURRENT_PACKAGE_SHA256="${PACKAGE_SHA256:-}"
fi

CURRENT_VERSION="$(read_package_version "$APP_DIR/package.json")"

mkdir -p "$APP_DIR" "$BIN_DIR"

echo "[arc-sync] downloading helper package..."
curl -fsSL "$REPO_TARBALL_URL" -o "$TMP_DIR/arc-sidebar-sync.tar.gz"
REMOTE_PACKAGE_SHA256="$(read_sha256 "$TMP_DIR/arc-sidebar-sync.tar.gz")"

echo "[arc-sync] extracting helper package..."
tar -xzf "$TMP_DIR/arc-sidebar-sync.tar.gz" -C "$TMP_DIR"
EXTRACTED_DIR="$(find "$TMP_DIR" -maxdepth 1 -mindepth 1 -type d | head -n 1)"

if [[ -z "$EXTRACTED_DIR" ]]; then
  echo "Failed to extract helper package." >&2
  exit 1
fi

REMOTE_VERSION="$(read_package_version "$EXTRACTED_DIR/package.json")"

if [[ -n "$CURRENT_PACKAGE_SHA256" && "$CURRENT_PACKAGE_SHA256" == "$REMOTE_PACKAGE_SHA256" && -n "$CURRENT_VERSION" ]]; then
  INSTALL_MODE="reuse"
  echo "检测到 Helper 已安装，当前版本 v${CURRENT_VERSION}，无需重复安装。"
  echo "将仅刷新本地启动器和通信注册。"
elif [[ -n "$CURRENT_VERSION" && -n "$REMOTE_VERSION" ]]; then
  echo "检测到已安装版本 v${CURRENT_VERSION}。"
  echo "正在更新到 v${REMOTE_VERSION}。"
  INSTALL_MODE="update"
else
  echo "正在执行首次安装。"
fi

if [[ "$INSTALL_MODE" != "reuse" ]]; then
  rm -rf "$APP_DIR"
  mkdir -p "$APP_DIR"
  cp -R "$EXTRACTED_DIR"/. "$APP_DIR"/

  echo "[arc-sync] installing dependencies..."
  cd "$APP_DIR"
  npm install --omit=dev
  write_install_state
fi

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
echo "安装位置：${BIN_DIR}/arc-sync"
if [[ "$INSTALL_MODE" == "update" ]]; then
  echo "本次操作：已完成更新。"
elif [[ "$INSTALL_MODE" == "reuse" ]]; then
  echo "本次操作：检测到重复安装，已跳过重装。"
else
  echo "本次操作：已完成首次安装。"
fi
echo "可返回 Arc 点击“重新检测”。"
