import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { ensureDir, fileExists, readTextFile, writeTextFile } from "./lib/fs-utils.js";
import { getAppSupportDir } from "./helper-config.js";

const execFileAsync = promisify(execFile);
const LAUNCHD_LABEL = "net.arc.sidebar_sync";

function plistPath() {
  return path.join(
    os.homedir(),
    "Library",
    "LaunchAgents",
    `${LAUNCHD_LABEL}.plist`
  );
}

function syncLogPath() {
  return path.join(getAppSupportDir(), "logs", "launchd-sync.log");
}

function syncErrorLogPath() {
  return path.join(getAppSupportDir(), "logs", "launchd-sync.error.log");
}

function normalizeIntervalMinutes(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return 0;
  }

  return Math.max(1, Math.round(number));
}

function buildPlist({ intervalMinutes, commandPath }) {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${commandPath}</string>
    <string>sync</string>
  </array>
  <key>StartInterval</key>
  <integer>${intervalMinutes * 60}</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${syncLogPath()}</string>
  <key>StandardErrorPath</key>
  <string>${syncErrorLogPath()}</string>
  <key>WorkingDirectory</key>
  <string>${getAppSupportDir()}</string>
</dict>
</plist>
`;

  return plist;
}

async function runLaunchctl(args) {
  try {
    return await execFileAsync("launchctl", args);
  } catch (error) {
    const output = `${error?.stdout || ""}\n${error?.stderr || ""}`.trim();
    if (output) {
      error.message = `${error.message}: ${output}`;
    }
    throw error;
  }
}

export async function installLaunchAgent({ intervalMinutes, commandPath }) {
  const normalizedInterval = normalizeIntervalMinutes(intervalMinutes);
  if (!normalizedInterval) {
    throw new Error("sync-interval-minutes must be greater than 0");
  }

  if (!commandPath) {
    throw new Error("commandPath is required to install launchd agent");
  }

  const targetPath = plistPath();
  await ensureDir(path.dirname(targetPath));
  await ensureDir(path.dirname(syncLogPath()));
  await writeTextFile(
    targetPath,
    buildPlist({
      intervalMinutes: normalizedInterval,
      commandPath
    })
  );

  try {
    await runLaunchctl(["unload", targetPath]);
  } catch {
    // Ignore unload failures when not loaded yet.
  }

  await runLaunchctl(["load", targetPath]);

  return {
    enabled: true,
    label: LAUNCHD_LABEL,
    intervalMinutes: normalizedInterval,
    plistPath: targetPath,
    logPath: syncLogPath(),
    errorLogPath: syncErrorLogPath()
  };
}

export async function uninstallLaunchAgent() {
  const targetPath = plistPath();

  if (await fileExists(targetPath)) {
    try {
      await runLaunchctl(["unload", targetPath]);
    } catch {
      // Ignore unload failures if it was not loaded.
    }
  }

  return {
    enabled: false,
    label: LAUNCHD_LABEL,
    plistPath: targetPath
  };
}

export async function getLaunchAgentStatus() {
  const targetPath = plistPath();
  const exists = await fileExists(targetPath);

  if (!exists) {
    return {
      enabled: false,
      label: LAUNCHD_LABEL,
      plistPath: targetPath
    };
  }

  let intervalMinutes = null;
  try {
    const plist = await readTextFile(targetPath);
    const match = plist.match(/<key>StartInterval<\/key>\s*<integer>(\d+)<\/integer>/);
    if (match) {
      intervalMinutes = Math.round(Number(match[1]) / 60);
    }
  } catch {
    intervalMinutes = null;
  }

  return {
    enabled: true,
    label: LAUNCHD_LABEL,
    plistPath: targetPath,
    intervalMinutes,
    logPath: syncLogPath(),
    errorLogPath: syncErrorLogPath()
  };
}
