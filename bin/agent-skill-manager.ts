#!/usr/bin/env node

import { isCLIMode, runCLI } from "../src/cli";

if (isCLIMode(process.argv)) {
  await runCLI(process.argv);
} else {
  await import("../src/index.tsx");
}

export {};
