#!/usr/bin/env bash
set -euo pipefail

EXTENSION_ZIP_URL="${ARC_SYNC_EXTENSION_ZIP_URL:-https://raw.githubusercontent.com/trivial-boy/arc-sidebar-sync/main/outputs/releases/arc-sidebar-sync-extension-v0.1.0.zip}"
TARGET_DIR="${ARC_SYNC_EXTENSION_DOWNLOAD_DIR:-$HOME/Downloads}"
TARGET_FILE="$TARGET_DIR/arc-sidebar-sync-extension.zip"

mkdir -p "$TARGET_DIR"

echo "正在下载扩展包..."
curl -fsSL "$EXTENSION_ZIP_URL" -o "$TARGET_FILE"

echo "扩展包已下载到本地。"
echo "下载位置：$TARGET_FILE"
echo "可在 Arc 扩展页面解压后加载该目录。"
