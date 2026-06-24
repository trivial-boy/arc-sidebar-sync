#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
EXTENSION_DIR="$ROOT_DIR/extension"
OUTPUT_DIR="$ROOT_DIR/outputs/releases"
STAGE_DIR="$ROOT_DIR/outputs/extension-package"
PACKAGE_JSON="$ROOT_DIR/package.json"

VERSION="$(node -e 'const fs=require("fs"); const pkg=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(pkg.version || "0.0.0");' "$PACKAGE_JSON")"
ZIP_NAME="arc-sidebar-sync-extension-v${VERSION}.zip"

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR" "$OUTPUT_DIR"
cp -R "$EXTENSION_DIR"/. "$STAGE_DIR"/

cd "$STAGE_DIR"
zip -qr "$OUTPUT_DIR/$ZIP_NAME" .

echo "$OUTPUT_DIR/$ZIP_NAME"
