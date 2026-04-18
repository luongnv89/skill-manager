/**
 * Resolve the bundled `skillgrade` binary that ships as a direct
 * dependency of `agent-skill-manager`.
 *
 * Transparency goal: after `npm install -g agent-skill-manager` (or
 * `bun install -g ...`), `asm eval --runtime` should work without the
 * user installing anything else. Node's module resolver walks upward
 * from the calling module — including when the CLI runs from the
 * built `dist/` bundle — so `createRequire(import.meta.url).resolve()`
 * finds the nested `node_modules/skillgrade/bin/skillgrade.js`.
 *
 * When the resolution fails (detached install, corrupt node_modules,
 * or a test harness), the caller falls back to `"skillgrade"` and
 * relies on PATH lookup — preserving the pre-bundle behavior.
 */

import { createRequire } from "module";

/**
 * Attempt to resolve the absolute path of the bundled skillgrade binary.
 *
 * Returns the resolved path on success, or `null` if skillgrade is not
 * reachable from the caller's module resolution graph.
 *
 * This is pure — no filesystem side effects beyond what `require.resolve`
 * does internally. Callers must still use `applicable()` to verify the
 * binary works at runtime (executable bit, compatible version, etc.).
 */
export function resolveBundledSkillgradeBinary(
  fromUrl: string = import.meta.url,
): string | null {
  try {
    const req = createRequire(fromUrl);
    return req.resolve("skillgrade/bin/skillgrade.js");
  } catch {
    return null;
  }
}
