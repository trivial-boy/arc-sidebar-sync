export function parseArgs(argv) {
  const [rawCommand, ...rest] = argv;
  const command = rawCommand || "help";
  const options = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const [keyPart, inlineValue] = token.slice(2).split("=", 2);
    const key = keyPart.trim();

    if (!key) {
      continue;
    }

    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }

    const next = rest[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    index += 1;
  }

  return { command, options };
}

export function printHelp() {
  console.log(`arc-sync

Usage:
  arc-sync sync --backend s3 --machine-id macbook-a --bucket your-bucket --endpoint https://oss-cn-hangzhou.aliyuncs.com
  arc-sync status --backend s3 --machine-id macbook-a --bucket your-bucket --endpoint https://oss-cn-hangzhou.aliyuncs.com
  arc-sync sync --backend file --machine-id macbook-a --store-dir ./work/object-store
  arc-sync config --save --backend s3 --machine-id macbook-a --bucket your-bucket --endpoint https://oss-cn-hangzhou.aliyuncs.com
  arc-sync install-native-host --extension-id your-extension-id --browser arc

Required backend flags:
  S3/OSS:
    --bucket your-bucket
    --endpoint https://oss-cn-hangzhou.aliyuncs.com
    --region oss-cn-hangzhou
    --access-key-id xxx
    --secret-access-key yyy
  File:
    --store-dir ./work/object-store

Optional client flags:
  --backend s3|file
  --arc-dir "~/Library/Application Support/Arc"
  --backup-dir "./backups"
  --prefix arc-sync
  --dry-run
  --force-write
  --interval 60
  --include-archive false

Native host install flags:
  --extension-id abcdefghijklmnopabcdefghijklmnop
  --browser arc|chrome|chromium|brave|edge
`);
}
