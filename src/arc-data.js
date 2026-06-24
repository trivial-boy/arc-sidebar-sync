import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  copyFileWithTimestamp,
  expandHome,
  fileExists,
  readTextFile,
  sha256,
  writeTextFile
} from "./lib/fs-utils.js";

const DEFAULT_ARC_DIR = path.join(os.homedir(), "Library", "Application Support", "Arc");
const SIDEBAR_FILE = "StorableSidebar.json";
const ARCHIVE_FILE = "StorableArchiveItems.json";

export function resolveArcPaths(options = {}) {
  const arcDir = path.resolve(expandHome(options["arc-dir"] || DEFAULT_ARC_DIR));
  const backupDir = path.resolve(
    expandHome(options["backup-dir"] || path.join(process.cwd(), "work", "backups"))
  );

  return {
    arcDir,
    backupDir,
    sidebarPath: path.join(arcDir, SIDEBAR_FILE),
    archivePath: path.join(arcDir, ARCHIVE_FILE)
  };
}

export async function readArcState(options = {}) {
  const { sidebarPath, archivePath } = resolveArcPaths(options);
  const includeArchive = options["include-archive"] !== "false";

  if (!(await fileExists(sidebarPath))) {
    throw new Error(`Arc sidebar file not found: ${sidebarPath}`);
  }

  const sidebar = await readTextFile(sidebarPath);
  const archive = includeArchive && (await fileExists(archivePath)) ? await readTextFile(archivePath) : null;
  const sidebarStat = await fs.stat(sidebarPath);
  const archiveStat =
    archive !== null && (await fileExists(archivePath)) ? await fs.stat(archivePath) : null;

  const files = {
    [SIDEBAR_FILE]: sidebar
  };

  if (archive !== null) {
    files[ARCHIVE_FILE] = archive;
  }

  const combinedHash = sha256(JSON.stringify(files));
  const updatedAt = new Date(
    Math.max(sidebarStat.mtimeMs, archiveStat?.mtimeMs || 0)
  ).toISOString();

  return {
    updatedAt,
    combinedHash,
    files
  };
}

export function buildSnapshotFromFiles(files, options = {}) {
  const normalizedFiles = {};

  for (const [fileName, content] of Object.entries(files || {})) {
    if (typeof content === "string") {
      normalizedFiles[fileName] = content;
    }
  }

  return {
    updatedAt: new Date().toISOString(),
    combinedHash: sha256(JSON.stringify(normalizedFiles)),
    files: normalizedFiles
  };
}

export async function backupArcFiles(options = {}) {
  const { sidebarPath, archivePath, backupDir } = resolveArcPaths(options);
  const results = [];

  if (await fileExists(sidebarPath)) {
    results.push(await copyFileWithTimestamp(sidebarPath, backupDir));
  }

  if (await fileExists(archivePath)) {
    results.push(await copyFileWithTimestamp(archivePath, backupDir));
  }

  return results;
}

export async function writeArcState(snapshot, options = {}) {
  const { sidebarPath, archivePath } = resolveArcPaths(options);

  if (!snapshot?.files?.[SIDEBAR_FILE]) {
    throw new Error("Snapshot is missing StorableSidebar.json");
  }

  await writeTextFile(sidebarPath, snapshot.files[SIDEBAR_FILE]);

  if (snapshot.files[ARCHIVE_FILE]) {
    await writeTextFile(archivePath, snapshot.files[ARCHIVE_FILE]);
  }
}

export async function isArcRunning() {
  try {
    const processes = await fs.readFile("/tmp/arc-sync-ps.txt", "utf8");
    return processes.includes("/Applications/Arc.app");
  } catch {
    return false;
  }
}
