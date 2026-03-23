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

// Plugin to handle bun:ffi imports for cross-runtime compatibility.
// When running on Bun, the real bun:ffi is used for native TUI rendering.
// When running on Node.js, no-op stubs are provided so the app doesn't crash
// (the TUI entry point will re-exec with Bun automatically).
const bunFfiShim: import("bun").BunPlugin = {
  name: "bun-ffi-shim",
  setup(build) {
    build.onResolve({ filter: /^bun:ffi$/ }, () => ({
      path: "bun:ffi",
      namespace: "bun-ffi-shim",
    }));
    build.onLoad({ filter: /.*/, namespace: "bun-ffi-shim" }, () => ({
      contents: `
        let mod;
        if (typeof globalThis.Bun !== "undefined") {
          mod = await import(String.raw\`bun\${":" + "ffi"}\`);
        } else {
          const noop = () => 1;
          const symbolsProxy = new Proxy({}, { get: () => noop });
          mod = {
            dlopen() { return { symbols: symbolsProxy, close() {} }; },
            toArrayBuffer() { return new ArrayBuffer(0); },
            ptr() { return 0; },
            JSCallback: class { constructor() { this.ptr = 1; } close() {} },
          };
        }
        export const { dlopen, toArrayBuffer, ptr, JSCallback } = mod;
      `,
      loader: "js",
    }));
  },
};

// Clean dist/ to remove stale chunks from previous builds
rmSync(resolve(root, "dist"), { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: [resolve(root, "bin/agent-skill-manager.ts")],
  outdir: resolve(root, "dist"),
  target: "node",
  minify: true,
  splitting: true,
  plugins: [bunFfiShim],
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

// Post-process: wrap @opentui/core platform-specific dynamic import with a
// runtime guard. On Bun, the original import runs natively (it can handle .ts
// files in node_modules). On Node.js v25+, the import would fail with
// ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING, so we return a no-op stub instead.
const DYNAMIC_IMPORT_RE =
  /await import\(`@opentui\/core-\$\{process\.platform\}-\$\{process\.arch\}\/index\.ts`\)/g;
const PLATFORM_THROW_RE =
  /throw Error\(`opentui is not supported on the current platform: \$\{process\.platform\}-\$\{process\.arch\}`\)/g;

const DYNAMIC_IMPORT_REPLACEMENT =
  '(typeof globalThis.Bun!=="undefined"' +
  "?await import(`@opentui/core-${process.platform}-${process.arch}/index.ts`)" +
  ':({default:""}))';

let patchedFiles = 0;
for (const output of result.outputs) {
  if (!output.path.endsWith(".js")) continue;
  const text = await Bun.file(output.path).text();
  if (!DYNAMIC_IMPORT_RE.test(text)) continue;
  DYNAMIC_IMPORT_RE.lastIndex = 0;
  const patched = text
    .replace(DYNAMIC_IMPORT_RE, DYNAMIC_IMPORT_REPLACEMENT)
    .replace(PLATFORM_THROW_RE, "void 0");
  await Bun.write(output.path, patched);
  patchedFiles++;
}

console.log(`Built agent-skill-manager v${version} (${commitHash})`);
console.log(`  ${result.outputs.length} output(s) in dist/`);
if (patchedFiles > 0) {
  console.log(
    `  Patched ${patchedFiles} file(s): stubbed @opentui/core platform import for Node.js compat`,
  );
}
