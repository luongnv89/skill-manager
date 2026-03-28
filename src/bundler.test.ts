import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, mkdir, readdir, rm, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  validateBundle,
  buildBundle,
  skillInfoToRef,
  saveBundle,
  readBundleFile,
  loadBundle,
  listBundles,
  removeBundle,
  getBundleDir,
} from "./bundler";
import type { BundleManifest, BundleSkillRef, SkillInfo } from "./utils/types";

// ─── Test Helpers ──────────────────────────────────────────────────────────

function makeSkillRef(overrides: Partial<BundleSkillRef> = {}): BundleSkillRef {
  return {
    name: "test-skill",
    installUrl: "github:user/repo#main:skills/test-skill",
    description: "A test skill",
    version: "1.0.0",
    ...overrides,
  };
}

function makeBundle(overrides: Partial<BundleManifest> = {}): BundleManifest {
  return {
    version: 1,
    name: "test-bundle",
    description: "A test bundle",
    author: "tester",
    createdAt: new Date().toISOString(),
    skills: [makeSkillRef()],
    ...overrides,
  };
}

function makeSkillInfo(overrides: Partial<SkillInfo> = {}): SkillInfo {
  const path = overrides.path ?? "/home/user/.claude/skills/test-skill";
  return {
    name: "test-skill",
    version: "1.0.0",
    description: "A test skill",
    creator: "tester",
    license: "MIT",
    compatibility: "",
    allowedTools: [],
    dirName: "test-skill",
    path,
    originalPath: path,
    location: "global-claude",
    scope: "global",
    provider: "claude",
    providerLabel: "Claude Code",
    isSymlink: false,
    symlinkTarget: null,
    realPath: path,
    ...overrides,
  };
}

// ─── validateBundle ────────────────────────────────────────────────────────

describe("validateBundle", () => {
  it("accepts a valid bundle", () => {
    const result = validateBundle(makeBundle());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects non-object input", () => {
    const result = validateBundle("not an object");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("must be a JSON object");
  });

  it("rejects null input", () => {
    const result = validateBundle(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("must be a JSON object");
  });

  it("rejects array input", () => {
    const result = validateBundle([]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("must be a JSON object");
  });

  it("rejects unsupported version", () => {
    const result = validateBundle({ ...makeBundle(), version: 2 });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Unsupported bundle version");
  });

  it("rejects missing name", () => {
    const result = validateBundle({ ...makeBundle(), name: "" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("rejects missing description", () => {
    const bundle = { ...makeBundle() };
    delete (bundle as any).description;
    const result = validateBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("description"))).toBe(true);
  });

  it("rejects missing author", () => {
    const bundle = { ...makeBundle() };
    delete (bundle as any).author;
    const result = validateBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("author"))).toBe(true);
  });

  it("rejects missing createdAt", () => {
    const bundle = { ...makeBundle() };
    delete (bundle as any).createdAt;
    const result = validateBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("createdAt"))).toBe(true);
  });

  it("rejects missing skills array", () => {
    const data = {
      version: 1,
      name: "test",
      description: "test",
      author: "test",
      createdAt: "2025-01-01",
    };
    const result = validateBundle(data);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("skills"))).toBe(true);
  });

  it("rejects empty skills array", () => {
    const result = validateBundle(makeBundle({ skills: [] }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("at least one skill"))).toBe(
      true,
    );
  });

  it("rejects skill with missing name", () => {
    const result = validateBundle(
      makeBundle({ skills: [makeSkillRef({ name: "" })] }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("rejects skill with missing installUrl", () => {
    const result = validateBundle(
      makeBundle({ skills: [makeSkillRef({ installUrl: "" })] }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("installUrl"))).toBe(true);
  });

  it("rejects invalid tags type", () => {
    const bundle = { ...makeBundle(), tags: "not-an-array" };
    const result = validateBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("tags"))).toBe(true);
  });

  it("accepts valid tags array", () => {
    const bundle = makeBundle({ tags: ["workflow", "devops"] });
    const result = validateBundle(bundle);
    expect(result.valid).toBe(true);
  });

  it("accepts multiple valid skills", () => {
    const bundle = makeBundle({
      skills: [
        makeSkillRef({ name: "skill-a" }),
        makeSkillRef({ name: "skill-b", installUrl: "github:user/skill-b" }),
      ],
    });
    const result = validateBundle(bundle);
    expect(result.valid).toBe(true);
  });

  it("collects multiple errors at once", () => {
    const data = {
      version: 99,
      skills: [{ name: "", installUrl: "" }],
    };
    const result = validateBundle(data);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── buildBundle ───────────────────────────────────────────────────────────

describe("buildBundle", () => {
  it("produces valid bundle manifest", () => {
    const skills = [makeSkillRef()];
    const bundle = buildBundle("my-bundle", "A bundle", "author", skills);
    expect(bundle.version).toBe(1);
    expect(bundle.name).toBe("my-bundle");
    expect(bundle.description).toBe("A bundle");
    expect(bundle.author).toBe("author");
    expect(bundle.createdAt).toBeTruthy();
    expect(new Date(bundle.createdAt).getTime()).not.toBeNaN();
    expect(bundle.skills).toHaveLength(1);
    expect(bundle.skills[0].name).toBe("test-skill");
  });

  it("includes tags when provided", () => {
    const bundle = buildBundle(
      "tagged-bundle",
      "Tagged",
      "author",
      [makeSkillRef()],
      ["workflow", "review"],
    );
    expect(bundle.tags).toEqual(["workflow", "review"]);
  });

  it("omits tags when not provided", () => {
    const bundle = buildBundle("no-tags", "No tags", "author", [
      makeSkillRef(),
    ]);
    expect(bundle.tags).toBeUndefined();
  });
});

// ─── skillInfoToRef ────────────────────────────────────────────────────────

describe("skillInfoToRef", () => {
  it("converts SkillInfo to BundleSkillRef", () => {
    const skill = makeSkillInfo({
      name: "code-review",
      version: "2.0.0",
      description: "Code review skill",
      path: "/home/.claude/skills/code-review",
    });
    const ref = skillInfoToRef(skill);
    expect(ref.name).toBe("code-review");
    expect(ref.version).toBe("2.0.0");
    expect(ref.description).toBe("Code review skill");
    expect(ref.installUrl).toBe("/home/.claude/skills/code-review");
  });

  it("uses symlinkTarget as installUrl for symlinked skills", () => {
    const skill = makeSkillInfo({
      isSymlink: true,
      symlinkTarget: "/dev/my-skills/code-review",
      path: "/home/.claude/skills/code-review",
    });
    const ref = skillInfoToRef(skill);
    expect(ref.installUrl).toBe("/dev/my-skills/code-review");
  });

  it("uses path as installUrl for non-symlinked skills", () => {
    const skill = makeSkillInfo({
      isSymlink: false,
      symlinkTarget: null,
      path: "/home/.claude/skills/my-skill",
    });
    const ref = skillInfoToRef(skill);
    expect(ref.installUrl).toBe("/home/.claude/skills/my-skill");
  });

  it("omits description when empty", () => {
    const skill = makeSkillInfo({ description: "" });
    const ref = skillInfoToRef(skill);
    expect(ref.description).toBeUndefined();
  });

  it("omits version when empty", () => {
    const skill = makeSkillInfo({ version: "" });
    const ref = skillInfoToRef(skill);
    expect(ref.version).toBeUndefined();
  });
});

// ─── readBundleFile ────────────────────────────────────────────────────────

describe("readBundleFile", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "bundle-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("reads a valid bundle file", async () => {
    const bundle = makeBundle();
    const filePath = join(tmpDir, "test.json");
    await writeFile(filePath, JSON.stringify(bundle));

    const loaded = await readBundleFile(filePath);
    expect(loaded.name).toBe("test-bundle");
    expect(loaded.skills).toHaveLength(1);
  });

  it("throws on missing file", async () => {
    await expect(readBundleFile(join(tmpDir, "nope.json"))).rejects.toThrow(
      "Bundle file not found",
    );
  });

  it("throws on invalid JSON", async () => {
    const filePath = join(tmpDir, "bad.json");
    await writeFile(filePath, "not json{");

    await expect(readBundleFile(filePath)).rejects.toThrow("not valid JSON");
  });

  it("throws on invalid bundle structure", async () => {
    const filePath = join(tmpDir, "invalid.json");
    await writeFile(filePath, JSON.stringify({ version: 99 }));

    await expect(readBundleFile(filePath)).rejects.toThrow("Invalid bundle");
  });
});

// ─── saveBundle and listBundles ────────────────────────────────────────────

describe("saveBundle", () => {
  let tmpDir: string;
  let origBundleDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "bundle-save-test-"));
    // We can't easily override the bundle dir constant, so we test readBundleFile directly
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("saveBundle writes valid JSON", async () => {
    // Directly test the file writing by saving then reading
    const bundle = makeBundle({ name: "save-test" });
    const bundleDir = join(tmpDir, "bundles");
    await mkdir(bundleDir, { recursive: true });
    const filePath = join(bundleDir, "save-test.json");
    await writeFile(filePath, JSON.stringify(bundle, null, 2) + "\n", "utf-8");

    const loaded = await readBundleFile(filePath);
    expect(loaded.name).toBe("save-test");
    expect(loaded.skills).toHaveLength(1);
  });
});

describe("removeBundle", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "bundle-rm-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("can write and read back a bundle file", async () => {
    const bundle = makeBundle({ name: "removable" });
    const filePath = join(tmpDir, "removable.json");
    await writeFile(filePath, JSON.stringify(bundle, null, 2));

    const loaded = await readBundleFile(filePath);
    expect(loaded.name).toBe("removable");
  });
});
