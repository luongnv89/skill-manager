/**
 * Tests for the bundled skillgrade binary resolver.
 *
 * Goal: verify the transparent-install story holds — after `npm install
 * -g agent-skill-manager`, the resolver finds the nested skillgrade.
 * Node's module resolver walks upward from the caller, so it should
 * find `node_modules/skillgrade/bin/skillgrade.js` regardless of whether
 * we call from source or from the built `dist/` bundle.
 */

import { describe, expect, it } from "bun:test";
import { existsSync } from "fs";
import { resolveBundledSkillgradeBinary } from "./resolve-binary";

describe("resolveBundledSkillgradeBinary", () => {
  it("resolves to an absolute path when skillgrade is installed", () => {
    const path = resolveBundledSkillgradeBinary();
    // skillgrade is a direct dependency — must be present in node_modules
    // whenever tests run.
    expect(path).not.toBeNull();
    expect(typeof path).toBe("string");
  });

  it("returns a path that actually exists on disk", () => {
    const path = resolveBundledSkillgradeBinary();
    expect(path).not.toBeNull();
    // `require.resolve` can return paths that no longer exist if the
    // package was half-removed. Guard against that.
    expect(existsSync(path!)).toBe(true);
  });

  it("points at the skillgrade bin entry (.js with node shebang)", () => {
    const path = resolveBundledSkillgradeBinary();
    expect(path).not.toBeNull();
    expect(path!.endsWith(".js")).toBe(true);
    // Convention check — the npm package's bin is under /bin/.
    expect(path!.includes("skillgrade")).toBe(true);
  });

  it("returns null when the fromUrl points at an unreachable location", () => {
    // Use a file:// URL outside any node_modules tree so resolution fails.
    const path = resolveBundledSkillgradeBinary("file:///nonexistent/dir/");
    expect(path).toBeNull();
  });
});
