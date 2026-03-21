#!/usr/bin/env node

import { isCLIMode, runCLI } from "../src/cli";

if (isCLIMode(process.argv)) {
  await runCLI(process.argv);
} else {
  // No args — launch interactive TUI
  await import("../src/index.ts");
}

export {};
