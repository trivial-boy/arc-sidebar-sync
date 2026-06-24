import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { backupArcFiles, buildSnapshotFromFiles, readArcState, resolveArcPaths, writeArcState } from "./arc-data.js";
import { mergeSnapshots } from "./snapshot-merge.js";
import { listMachines, readLatestSnapshot, readMachineSnapshot, writeSnapshot } from "./store.js";

const execFileAsync = promisify(execFile);

function requireOption(options, key) {
  const value = options[key];
  if (!value) {
    throw new Error(`Missing required option --${key}`);
  }

  return value;
}

async function detectArcProcess() {
  try {
    const { stdout } = await execFileAsync("pgrep", ["-fal", "Arc.app"]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

function buildHeaders(options) {
  if ((options.backend || "s3") === "s3") {
    requireOption(options, "bucket");
    requireOption(options, "endpoint");
    requireOption(options, "access-key-id");
    requireOption(options, "secret-access-key");
  } else {
    requireOption(options, "store-dir");
  }

  return options;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function syncOnceWithResult(options = {}) {
  const machineId = requireOption(options, "machine-id");
  buildHeaders(options);
  const dryRun = Boolean(options["dry-run"]);
  const forceWrite = Boolean(options["force-write"]);

  const arcPaths = resolveArcPaths(options);
  const localState = await readArcState(options);
  const remoteSnapshot = await readLatestSnapshot(options);
  const events = [];

  const log = (message) => {
    events.push(message);
    console.log(message);
  };

  log(`[arc-sync] local hash: ${localState.combinedHash}`);
  log(`[arc-sync] local updatedAt: ${localState.updatedAt}`);
  log(`[arc-sync] arc dir: ${arcPaths.arcDir}`);

  if (remoteSnapshot) {
    log(`[arc-sync] remote hash: ${remoteSnapshot.combinedHash}`);
    log(`[arc-sync] remote updatedAt: ${remoteSnapshot.updatedAt}`);
  }

  const { mergedSnapshot, changed, source } = mergeSnapshots(localState, remoteSnapshot, machineId);
  const mergedState = buildSnapshotFromFiles(mergedSnapshot.files, options);
  const remoteMatchesMerged =
    remoteSnapshot && remoteSnapshot.combinedHash === mergedState.combinedHash;
  const localMatchesMerged = localState.combinedHash === mergedState.combinedHash;

  if (!remoteSnapshot) {
    log("[arc-sync] remote snapshot missing; will upload local snapshot as initial state");
  } else if (!changed && localMatchesMerged && remoteMatchesMerged) {
    log("[arc-sync] local and remote snapshots already match");
  } else {
    log("[arc-sync] local and remote snapshots differ; will merge, write locally, and upload");
  }

  if (dryRun) {
    log("[arc-sync] dry-run: would merge local and remote snapshots, write local files, and push merged snapshot");
    return {
      ok: true,
      dryRun: true,
      events,
      localState,
      remoteSnapshot,
      mergedSnapshot: {
        machineId,
        updatedAt: mergedState.updatedAt,
        combinedHash: mergedState.combinedHash
      }
    };
  }

  if (!localMatchesMerged) {
    const arcRunning = await detectArcProcess();
    if (arcRunning && !forceWrite) {
      throw new Error("Arc 正在运行，无法安全写入本地侧边栏。请先关闭 Arc，或稍后再试。");
    }

    const backups = await backupArcFiles(options);
    await writeArcState(
      {
        machineId,
        updatedAt: mergedState.updatedAt,
        combinedHash: mergedState.combinedHash,
        files: mergedState.files
      },
      options
    );
    log("[arc-sync] merged snapshot has been written to local Arc files");
    if (backups.length > 0) {
      log(`[arc-sync] backups saved: ${backups.join(", ")}`);
    }
  }

  const refreshedState = localMatchesMerged ? mergedState : await readArcState(options);
  const result = await writeSnapshot(options, {
    machineId,
    pushedAt: new Date().toISOString(),
    combinedHash: refreshedState.combinedHash,
    updatedAt: refreshedState.updatedAt,
    files: refreshedState.files
  });

  log(`[arc-sync] pushed merged snapshot ${result.combinedHash.slice(0, 12)} from ${result.machineId}`);
  return {
    ok: true,
    events,
    localState,
    remoteSnapshot,
    mergedSnapshot: {
      machineId,
      updatedAt: refreshedState.updatedAt,
      combinedHash: refreshedState.combinedHash
    },
    pushedSnapshot: result
  };
}

export async function getStatusData(options = {}) {
  const machineId = requireOption(options, "machine-id");
  buildHeaders(options);

  const [latest, mine, machines] = await Promise.all([
    readLatestSnapshot(options),
    readMachineSnapshot(options, machineId),
    listMachines(options)
  ]);

  return {
    backend: options.backend || "s3",
    machines,
    latest: latest
      ? {
          machineId: latest.machineId,
          combinedHash: latest.combinedHash,
          updatedAt: latest.updatedAt,
          pushedAt: latest.pushedAt
        }
      : null,
    mine: mine
      ? {
          machineId: mine.machineId,
          combinedHash: mine.combinedHash,
          updatedAt: mine.updatedAt,
          pushedAt: mine.pushedAt
        }
      : null
  };
}

export async function runStatusCommand(options = {}) {
  const status = await getStatusData(options);
  console.log(JSON.stringify(status, null, 2));
}

export async function runSyncCommand(options = {}) {
  const intervalSeconds = Number(options.interval || 0);

  if (!Number.isFinite(intervalSeconds) || intervalSeconds < 0) {
    throw new Error("--interval must be a non-negative number");
  }

  if (intervalSeconds === 0) {
    await syncOnceWithResult(options);
    return;
  }

  console.log(`[arc-sync] starting watch mode with ${intervalSeconds}s interval`);
  while (true) {
    try {
      await syncOnceWithResult(options);
    } catch (error) {
      console.error(`[arc-sync] sync loop error: ${error.message}`);
    }
    await sleep(intervalSeconds * 1000);
  }
}
