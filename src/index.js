#!/usr/bin/env node

import { installNativeHost } from "./native-install.js";
import { runNativeHost } from "./native-host.js";
import { runSyncCommand, runStatusCommand } from "./sync-client.js";
import { printHelp, parseArgs } from "./lib/cli.js";
import { loadHelperConfig, normalizeIncomingConfig, saveHelperConfig } from "./helper-config.js";

function routeConsoleToStderr() {
  const originalError = console.error.bind(console);
  const stderrWriter = (...args) => {
    process.stderr.write(`${args.map((item) => String(item)).join(" ")}\n`);
  };

  console.log = stderrWriter;
  console.info = stderrWriter;
  console.debug = stderrWriter;
  console.warn = stderrWriter;
  console.error = originalError;
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  switch (command) {
    case "config":
      if (options.save) {
        const saved = await saveHelperConfig(normalizeIncomingConfig(options));
        console.log(JSON.stringify(saved, null, 2));
        return;
      }
      console.log(JSON.stringify(await loadHelperConfig(), null, 2));
      return;
    case "install-native-host":
      console.log(JSON.stringify(await installNativeHost(options), null, 2));
      return;
    case "native-host":
      routeConsoleToStderr();
      await runNativeHost();
      return;
    case "sync":
      await runSyncCommand(options);
      return;
    case "status":
      await runStatusCommand(options);
      return;
    case "help":
    default:
      printHelp();
  }
}

main().catch((error) => {
  console.error(`[arc-sync] ${error.message}`);
  if (error.cause) {
    console.error(error.cause);
  }
  process.exitCode = 1;
});
