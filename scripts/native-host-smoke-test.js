import os from "node:os";
import path from "node:path";

import { saveHelperConfig } from "../src/helper-config.js";
import { runNativeHost } from "../src/native-host.js";

function encodeMessage(payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

async function main() {
  const storeDir = path.join(process.cwd(), "work", "native-smoke-store");
  await saveHelperConfig({
    backend: "file",
    "machine-id": "native-smoke",
    "store-dir": storeDir,
    "arc-dir": path.join(os.homedir(), "Library", "Application Support", "Arc")
  });

  const payload = encodeMessage({ type: "ping" });
  process.stdin.push(payload);
  process.stdin.push(null);

  const chunks = [];
  process.stdout.write = (chunk, ...rest) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return true;
  };

  await runNativeHost();

  const buffer = Buffer.concat(chunks);
  const length = buffer.readUInt32LE(0);
  const message = JSON.parse(buffer.subarray(4, 4 + length).toString("utf8"));
  console.error(JSON.stringify(message, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
