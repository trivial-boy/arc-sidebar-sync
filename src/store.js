import fs from "node:fs/promises";
import path from "node:path";

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { ensureDir, expandHome, fileExists, readJsonFile, writeTextFile } from "./lib/fs-utils.js";

function requireOption(options, key) {
  const value = options[key];
  if (!value) {
    throw new Error(`Missing required option --${key}`);
  }
  return value;
}

function backendType(options) {
  return options.backend || "s3";
}

function prefixOf(options) {
  const prefix = options.prefix || "arc-sync";
  return prefix.replace(/^\/+|\/+$/g, "");
}

function latestKey(options) {
  return `${prefixOf(options)}/latest.json`;
}

function machineKey(options, machineId) {
  return `${prefixOf(options)}/machines/${machineId}.json`;
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function createS3Client(options) {
  const rawEndpoint = requireOption(options, "endpoint");
  const endpoint = /^https?:\/\//i.test(rawEndpoint) ? rawEndpoint : `https://${rawEndpoint}`;
  const region = options.region || "oss-cn-hangzhou";
  const accessKeyId = requireOption(options, "access-key-id");
  const secretAccessKey = requireOption(options, "secret-access-key");
  const usePathStyle = options["path-style"] === true || options["path-style"] === "true";

  return new S3Client({
    region,
    endpoint,
    forcePathStyle: usePathStyle,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });
}

async function readS3Json(options, key) {
  const client = createS3Client(options);
  const bucket = requireOption(options, "bucket");

  try {
    const result = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key
      })
    );
    const text = await streamToString(result.Body);
    return JSON.parse(text);
  } catch (error) {
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}

async function writeS3Json(options, key, payload) {
  const client = createS3Client(options);
  const bucket = requireOption(options, "bucket");
  const body = JSON.stringify(payload, null, 2);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/json; charset=utf-8"
    })
  );
}

function resolveStoreDir(options) {
  const storeDir = requireOption(options, "store-dir");
  return path.resolve(expandHome(storeDir));
}

async function readFileJson(options, relativePath) {
  const filePath = path.join(resolveStoreDir(options), relativePath);
  if (!(await fileExists(filePath))) {
    return null;
  }
  return readJsonFile(filePath);
}

async function writeFileJson(options, relativePath, payload) {
  const filePath = path.join(resolveStoreDir(options), relativePath);
  await ensureDir(path.dirname(filePath));
  await writeTextFile(filePath, JSON.stringify(payload, null, 2));
}

export async function readLatestSnapshot(options) {
  if (backendType(options) === "file") {
    return readFileJson(options, latestKey(options));
  }
  return readS3Json(options, latestKey(options));
}

export async function readMachineSnapshot(options, machineId) {
  if (backendType(options) === "file") {
    return readFileJson(options, machineKey(options, machineId));
  }
  return readS3Json(options, machineKey(options, machineId));
}

export async function writeSnapshot(options, snapshot) {
  const machinePath = machineKey(options, snapshot.machineId);
  const latestPath = latestKey(options);

  if (backendType(options) === "file") {
    await writeFileJson(options, machinePath, snapshot);
    await writeFileJson(options, latestPath, snapshot);
    return snapshot;
  }

  await writeS3Json(options, machinePath, snapshot);
  await writeS3Json(options, latestPath, snapshot);
  return snapshot;
}

export async function listMachines(options) {
  if (backendType(options) === "file") {
    const dirPath = path.join(resolveStoreDir(options), prefixOf(options), "machines");
    if (!(await fileExists(dirPath))) {
      return [];
    }
    const entries = await fs.readdir(dirPath);
    return entries.filter((entry) => entry.endsWith(".json")).map((entry) => entry.replace(/\.json$/, ""));
  }

  return [];
}
