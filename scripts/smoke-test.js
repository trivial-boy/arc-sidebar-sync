import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";

function run(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "pipe",
      env: { ...process.env, ...extraEnv }
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed (${code}): ${stderr || stdout}`));
        return;
      }

      resolve(stdout);
    });
  });
}

async function main() {
  const arcDir = path.join(os.homedir(), "Library", "Application Support", "Arc");
  const storeDir = path.join(process.cwd(), "work", "smoke-store");
  await fs.rm(storeDir, { recursive: true, force: true });

  const syncOutput = await run("node", [
    "./src/index.js",
    "sync",
    "--backend",
    "file",
    "--store-dir",
    storeDir,
    "--machine-id",
    "smoke-machine",
    "--arc-dir",
    arcDir
  ]);

  const statusOutput = await run("node", [
    "./src/index.js",
    "status",
    "--backend",
    "file",
    "--store-dir",
    storeDir,
    "--machine-id",
    "smoke-machine"
  ]);

  console.log(syncOutput.trim());
  console.log(statusOutput.trim());
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
