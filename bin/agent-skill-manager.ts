#!/usr/bin/env node

import { isCLIMode, runCLI } from "../src/cli";

if (isCLIMode(process.argv)) {
  await runCLI(process.argv);
} else {
  // TUI mode requires Bun's FFI for native rendering.
  // If running on Node.js, re-exec with Bun (or show an error).
  const isBun = typeof globalThis.Bun !== "undefined";
  if (!isBun) {
    const { spawn } = await import("child_process");
    const child = spawn("bun", [process.argv[1], ...process.argv.slice(2)], {
      stdio: "inherit",
    });
    child.on("error", () => {
      console.error(
        "The interactive TUI requires Bun (https://bun.sh).\n" +
          "Install it with: curl -fsSL https://bun.sh/install | bash\n\n" +
          "CLI commands (list, search, inspect, etc.) work with Node.js — run: asm --help",
      );
      process.exit(1);
    });
    child.on("exit", (code) => process.exit(code ?? 0));
  } else {
    await import("../src/index.ts");
  }
}

export {};
