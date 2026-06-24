import os from "node:os";
import path from "node:path";

import { ensureDir, expandHome, fileExists, readJsonFile, writeTextFile } from "./lib/fs-utils.js";

const APP_SUPPORT_DIR = path.join(os.homedir(), "Library", "Application Support", "arc-sidebar-sync");
const CONFIG_FILE = "config.json";

export function getAppSupportDir() {
  return APP_SUPPORT_DIR;
}

export function getConfigPath() {
  return path.join(APP_SUPPORT_DIR, CONFIG_FILE);
}

export async function loadHelperConfig() {
  const configPath = getConfigPath();
  if (!(await fileExists(configPath))) {
    return {};
  }

  return readJsonFile(configPath);
}

export async function saveHelperConfig(inputConfig) {
  const current = await loadHelperConfig();
  const merged = mergeConfig(current, inputConfig);
  const configPath = getConfigPath();

  await ensureDir(path.dirname(configPath));
  await writeTextFile(configPath, JSON.stringify(merged, null, 2));
  return merged;
}

export function mergeConfig(existingConfig, newConfig) {
  const merged = {
    ...existingConfig,
    ...newConfig
  };

  if (!newConfig["secret-access-key"] && existingConfig["secret-access-key"]) {
    merged["secret-access-key"] = existingConfig["secret-access-key"];
  }

  if (merged.backend === "s3" && merged["store-dir"]) {
    delete merged["store-dir"];
  }

  if (merged.backend === "file") {
    delete merged.bucket;
    delete merged.endpoint;
    delete merged.region;
    delete merged["access-key-id"];
    delete merged["secret-access-key"];
  }

  return merged;
}

export function sanitizeHelperConfig(config) {
  if (!config || Object.keys(config).length === 0) {
    return {};
  }

  const sanitized = { ...config };
  if (sanitized["secret-access-key"]) {
    delete sanitized["secret-access-key"];
    sanitized.hasSecretAccessKey = true;
  } else {
    sanitized.hasSecretAccessKey = false;
  }

  return sanitized;
}

export function normalizeIncomingConfig(config = {}) {
  const normalized = {};

  const allowedKeys = [
    "backend",
    "machine-id",
    "bucket",
    "endpoint",
    "region",
    "access-key-id",
    "secret-access-key",
    "prefix",
    "store-dir",
    "arc-dir",
    "backup-dir",
    "include-archive",
    "sync-interval-minutes"
  ];

  for (const key of allowedKeys) {
    if (config[key] !== undefined) {
      normalized[key] = typeof config[key] === "string" ? expandHome(config[key]) : config[key];
    }
  }

  if (typeof normalized.endpoint === "string" && normalized.endpoint.trim()) {
    normalized.endpoint = normalized.endpoint.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }

  return normalized;
}
