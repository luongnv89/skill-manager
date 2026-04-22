#!/usr/bin/env bun

import { readFileSync, rmSync } from "fs";
import { resolve } from "path";

const root = resolve(import.meta.dir, "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const version = pkg.version;

let commitHash = "unknown";
try {
  const proc = Bun.spawn(["git", "rev-parse", "--short", "HEAD"], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: root,
  });
  commitHash = (await new Response(proc.stdout).text()).trim() || "unknown";
} catch {
  // git not available
}

// Clean dist/ to remove stale chunks from previous builds
rmSync(resolve(root, "dist"), { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: [resolve(root, "bin/agent-skill-manager.ts")],
  outdir: resolve(root, "dist"),
  target: "node",
  minify: true,
  splitting: true,
  // Ink only loads react-devtools-core behind an `if (process.env.DEV)` gate;
  // exclude it from the bundle so production runs on node without the devDep.
  external: ["react-devtools-core"],
  define: {
    "process.env.__ASM_VERSION__": JSON.stringify(version),
    "process.env.__ASM_COMMIT__": JSON.stringify(commitHash),
  },
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log(`Built agent-skill-manager v${version} (${commitHash})`);
console.log(`  ${result.outputs.length} output(s) in dist/`);
