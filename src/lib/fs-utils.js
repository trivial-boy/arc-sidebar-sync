import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function expandHome(inputPath) {
  if (!inputPath) {
    return inputPath;
  }

  if (inputPath === "~") {
    return os.homedir();
  }

  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }

  return inputPath;
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function readJsonFile(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
}

export async function readTextFile(filePath) {
  return fs.readFile(filePath, "utf8");
}

export async function writeTextFile(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}

export async function copyFileWithTimestamp(sourcePath, targetDir) {
  await ensureDir(targetDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = path.basename(sourcePath);
  const destination = path.join(targetDir, `${timestamp}-${fileName}`);
  await fs.copyFile(sourcePath, destination);
  return destination;
}

export function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
