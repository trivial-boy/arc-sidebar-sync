import fs from "node:fs";
import path from "node:path";

import {
  getBootstrapInstallCommand,
  getRemoteInstallCommand,
  getBrewInstallCommand,
  getInstallCommand,
  getLocalDevInstallCommand,
  installNativeHost
} from "./native-install.js";
import {
  getAppSupportDir,
  loadHelperConfig,
  normalizeIncomingConfig,
  sanitizeHelperConfig,
  saveHelperConfig
} from "./helper-config.js";
import { NATIVE_HOST_NAME } from "./native-host-constants.js";
import { getStatusData, syncOnceWithResult } from "./sync-client.js";

const NATIVE_HOST_LOG_PATH = path.join(getAppSupportDir(), "native-host.log");

function logNativeHost(message) {
  try {
    fs.mkdirSync(path.dirname(NATIVE_HOST_LOG_PATH), { recursive: true });
    fs.appendFileSync(
      NATIVE_HOST_LOG_PATH,
      `[${new Date().toISOString()}] ${message}\n`,
      "utf8"
    );
  } catch {
    // Logging should never break the host protocol.
  }
}

function writeNativeMessage(payload) {
  const message = Buffer.from(JSON.stringify(payload), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(message.length, 0);
  const packet = Buffer.concat([header, message]);

  return new Promise((resolve, reject) => {
    process.stdout.write(packet, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function readExactly(byteLength) {
  if (byteLength === 0) {
    return Buffer.alloc(0);
  }

  return new Promise((resolve, reject) => {
    let pending = Buffer.alloc(0);

    function cleanup() {
      process.stdin.off("readable", onReadable);
      process.stdin.off("end", onEnd);
      process.stdin.off("error", onError);
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    function onEnd() {
      cleanup();
      reject(new Error(`Native host stdin ended before reading ${byteLength} bytes`));
    }

    function onReadable() {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        pending = Buffer.concat([pending, chunk]);
        if (pending.length >= byteLength) {
          const result = pending.subarray(0, byteLength);
          const remainder = pending.subarray(byteLength);
          if (remainder.length > 0) {
            process.stdin.unshift(remainder);
          }
          cleanup();
          resolve(result);
          return;
        }
      }
    }

    process.stdin.on("readable", onReadable);
    process.stdin.on("end", onEnd);
    process.stdin.on("error", onError);
    onReadable();
  });
}

async function readSingleNativeMessage() {
  const header = await readExactly(4);
  const length = header.readUInt32LE(0);
  const body = await readExactly(length);
  return JSON.parse(body.toString("utf8"));
}

function mergeRuntimeOptions(message, storedConfig) {
  const runtimeOptions = {
    ...storedConfig,
    ...(message.options || {})
  };

  if (!runtimeOptions.backend) {
    runtimeOptions.backend = "s3";
  }

  return runtimeOptions;
}

function compactStatus(status) {
  return {
    backend: status.backend,
    latest: status.latest
      ? {
          machineId: status.latest.machineId,
          updatedAt: status.latest.updatedAt,
          pushedAt: status.latest.pushedAt
        }
      : null,
    mine: status.mine
      ? {
          machineId: status.mine.machineId,
          updatedAt: status.mine.updatedAt,
          pushedAt: status.mine.pushedAt
        }
      : null
  };
}

function compactSyncResult(result) {
  return {
    ok: result.ok,
    dryRun: Boolean(result.dryRun),
    skippedPush: Boolean(result.skippedPush),
    events: Array.isArray(result.events) ? result.events.slice(-8) : [],
    localUpdatedAt: result.localState?.updatedAt || null,
    remoteUpdatedAt: result.remoteSnapshot?.updatedAt || null,
    pushedSnapshot: result.pushedSnapshot
      ? {
          machineId: result.pushedSnapshot.machineId,
          updatedAt: result.pushedSnapshot.updatedAt,
          pushedAt: result.pushedSnapshot.pushedAt
        }
      : null
  };
}

async function handleMessage(message) {
  const storedConfig = await loadHelperConfig();

  switch (message.type) {
    case "ping":
      return {
        ok: true,
        hostName: NATIVE_HOST_NAME,
        helperVersion: "0.1.0",
        config: sanitizeHelperConfig(storedConfig)
      };
    case "getConfig":
      return {
        ok: true,
        config: sanitizeHelperConfig(storedConfig)
      };
    case "saveConfig": {
      const saved = await saveHelperConfig(normalizeIncomingConfig(message.config));
      return {
        ok: true,
        config: sanitizeHelperConfig(saved)
      };
    }
    case "status": {
      const status = await getStatusData(mergeRuntimeOptions(message, storedConfig));
      return {
        ok: true,
        status: compactStatus(status)
      };
    }
    case "sync": {
      const result = await syncOnceWithResult(mergeRuntimeOptions(message, storedConfig));
      return {
        ok: true,
        result: compactSyncResult(result)
      };
    }
    case "installNativeHost": {
      const result = await installNativeHost(message.options || {});
      return {
        ok: true,
        result
      };
    }
    case "installHelp":
      return {
        ok: true,
        bootstrapInstallCommand: getBootstrapInstallCommand(
          message.extensionId,
          message.browser || "arc"
        ),
        remoteInstallCommand: getRemoteInstallCommand(),
        brewInstallCommand: getBrewInstallCommand(),
        localDevInstallCommand: getLocalDevInstallCommand(),
        nativeHostCommand: getInstallCommand(message.extensionId, message.browser || "arc")
      };
    default:
      throw new Error(`Unsupported native host message type: ${message.type}`);
  }
}

export async function runNativeHost() {
  logNativeHost(`start argv=${JSON.stringify(process.argv.slice(2))}`);

  try {
    const message = await readSingleNativeMessage();
    logNativeHost(`received type=${message?.type || "unknown"}`);

    const response = await handleMessage(message);
    await writeNativeMessage(response);
    logNativeHost(`responded ok type=${message?.type || "unknown"}`);
  } catch (error) {
    logNativeHost(`error ${error?.stack || error?.message || String(error)}`);

    try {
      await writeNativeMessage({
        ok: false,
        error: error?.message || "Native host failed"
      });
      logNativeHost("responded with error payload");
      return;
    } catch {
      logNativeHost("failed to respond with error payload");
    }

    throw error;
  }
}
