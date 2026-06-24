import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ensureDir, expandHome, writeTextFile } from "./lib/fs-utils.js";
import { getAppSupportDir } from "./helper-config.js";
import { KNOWN_BROWSER_HOST_DIRS, NATIVE_HOST_NAME } from "./native-host-constants.js";

const DEFAULT_REMOTE_PACKAGE_URL =
  process.env.ARC_SYNC_REMOTE_PACKAGE_URL ||
  "https://github.com/your-org/arc-sidebar-sync/archive/refs/heads/main.tar.gz";

function parseBrowsers(options = {}) {
  const requested = options.browser || options.browsers || "arc";
  return String(requested)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function manifestTargetDirs(browsers) {
  const targets = [];
  for (const browser of browsers) {
    const hostDir = KNOWN_BROWSER_HOST_DIRS[browser];
    if (!hostDir) {
      continue;
    }

    const hostDirs = Array.isArray(hostDir) ? hostDir : [hostDir];
    for (const dir of hostDirs) {
      targets.push({ browser, hostDir: expandHome(dir) });
    }
  }
  return targets;
}

function wrapperPath() {
  return path.join(getAppSupportDir(), "bin", "native-host");
}

async function installWrapperScript() {
  const targetPath = wrapperPath();
  const entryPath = fileURLToPath(new URL("./index.js", import.meta.url));
  const nodePath = process.execPath;
  const content = `#!/bin/sh
exec "${nodePath}" "${entryPath}" native-host "$@"
`;

  await ensureDir(path.dirname(targetPath));
  await writeTextFile(targetPath, content);
  await fs.chmod(targetPath, 0o755);

  return targetPath;
}

export async function installNativeHost(options = {}) {
  const extensionId = options["extension-id"];
  if (!extensionId) {
    throw new Error("Missing required option --extension-id");
  }

  const browsers = parseBrowsers(options);
  const wrapper = await installWrapperScript();
  const targets = manifestTargetDirs(browsers);

  if (targets.length === 0) {
    throw new Error(`No supported browser targets in --browser=${options.browser || ""}`);
  }

  const written = [];
  for (const target of targets) {
    const manifestPath = path.join(target.hostDir, `${NATIVE_HOST_NAME}.json`);
    const manifest = {
      name: NATIVE_HOST_NAME,
      description: "Arc Sidebar Sync native helper",
      path: wrapper,
      type: "stdio",
      allowed_origins: [`chrome-extension://${extensionId}/`]
    };

    await ensureDir(target.hostDir);
    await writeTextFile(manifestPath, JSON.stringify(manifest, null, 2));
    written.push({ browser: target.browser, manifestPath });
  }

  return {
    extensionId,
    wrapper,
    supportDir: getAppSupportDir(),
    written
  };
}

export function getInstallCommand(extensionId, browser = "arc") {
  const escapedId = String(extensionId || "").trim();
  return `arc-sync install-native-host --extension-id ${escapedId} --browser ${browser}`;
}

export function getRemoteInstallCommand() {
  return `npm install -g ${DEFAULT_REMOTE_PACKAGE_URL}`;
}

export function getBrewInstallCommand() {
  return "brew install your-org/tap/arc-sidebar-sync";
}

export function getLocalDevInstallCommand() {
  return "cd /Users/gemengying/Documents/Codex/2026-06-23/arc-github && npm install";
}
