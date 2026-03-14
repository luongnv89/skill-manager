import { describe, expect, it } from "bun:test";
import {
  buildRemovalPlan,
  buildFullRemovalPlan,
  executeRemoval,
} from "./uninstaller";
import type { SkillInfo, AppConfig, RemovalPlan } from "./utils/types";
import { homedir, tmpdir } from "os";
import { resolve, join, relative } from "path";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readlink,
  lstat,
  realpath,
  rm,
  symlink,
} from "fs/promises";

const HOME = homedir();

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    version: 1,
    providers: [
      {
        name: "claude",
        label: "Claude Code",
        global: "~/.claude/skills",
        project: ".claude/skills",
        enabled: true,
      },
      {
        name: "codex",
        label: "Codex",
        global: "~/.codex/skills",
        project: ".codex/skills",
        enabled: true,
      },
    ],
    customPaths: [],
    preferences: { defaultScope: "both", defaultSort: "name" },
    ...overrides,
  };
}

function makeSkill(overrides: Partial<SkillInfo> = {}): SkillInfo {
  return {
    name: "test-skill",
    version: "1.0.0",
    description: "A test skill",
    dirName: "test-skill",
    path: `${HOME}/.claude/skills/test-skill`,
    originalPath: `${HOME}/.claude/skills/test-skill`,
    location: "global-claude",
    scope: "global",
    provider: "claude",
    providerLabel: "Claude Code",
    isSymlink: false,
    symlinkTarget: null,
    realPath: `${HOME}/.claude/skills/test-skill`,
    fileCount: 3,
    ...overrides,
  };
}

describe("buildRemovalPlan", () => {
  it("includes the skill directory for global skill", () => {
    const skill = makeSkill();
    const config = makeConfig();
    const plan = buildRemovalPlan(skill, config);

    expect(plan.directories).toHaveLength(1);
    expect(plan.directories[0].path).toBe(skill.originalPath);
    expect(plan.directories[0].isSymlink).toBe(false);
  });

  it("marks symlink directory correctly", () => {
    const skill = makeSkill({ isSymlink: true });
    const config = makeConfig();
    const plan = buildRemovalPlan(skill, config);

    expect(plan.directories[0].isSymlink).toBe(true);
  });

  it("generates rule files for project-scoped skill", () => {
    const skill = makeSkill({
      scope: "project",
      dirName: "my-skill",
      originalPath: ".claude/skills/my-skill",
    });
    const config = makeConfig();
    const plan = buildRemovalPlan(skill, config);

    expect(plan.ruleFiles).toHaveLength(3);
    expect(plan.ruleFiles).toContain(
      resolve(".cursor", "rules", "my-skill.mdc"),
    );
    expect(plan.ruleFiles).toContain(
      resolve(".windsurf", "rules", "my-skill.md"),
    );
    expect(plan.ruleFiles).toContain(
      resolve(".github", "instructions", "my-skill.instructions.md"),
    );
  });

  it("does not generate rule files for global-scoped skill", () => {
    const skill = makeSkill({ scope: "global" });
    const config = makeConfig();
    const plan = buildRemovalPlan(skill, config);
    expect(plan.ruleFiles).toHaveLength(0);
  });

  it("adds AGENTS.md blocks for project-scoped skill", () => {
    const skill = makeSkill({
      scope: "project",
      dirName: "test-skill",
      originalPath: ".claude/skills/test-skill",
    });
    const config = makeConfig();
    const plan = buildRemovalPlan(skill, config);

    expect(plan.agentsBlocks).toHaveLength(1);
    expect(plan.agentsBlocks[0].file).toBe(resolve("AGENTS.md"));
    expect(plan.agentsBlocks[0].skillName).toBe("test-skill");
  });

  it("adds AGENTS.md blocks for all enabled providers on global skill", () => {
    const skill = makeSkill({ scope: "global" });
    const config = makeConfig();
    const plan = buildRemovalPlan(skill, config);

    // 2 enabled providers + possibly codex AGENTS.md dedup
    expect(plan.agentsBlocks.length).toBeGreaterThanOrEqual(2);
  });

  it("skips disabled providers in global AGENTS.md blocks", () => {
    const skill = makeSkill({ scope: "global" });
    const config = makeConfig({
      providers: [
        {
          name: "claude",
          label: "Claude Code",
          global: "~/.claude/skills",
          project: ".claude/skills",
          enabled: true,
        },
        {
          name: "codex",
          label: "Codex",
          global: "~/.codex/skills",
          project: ".codex/skills",
          enabled: false,
        },
      ],
    });
    const plan = buildRemovalPlan(skill, config);

    // Only claude provider enabled + codex AGENTS.md fallback
    const claudeBlock = plan.agentsBlocks.find((b) =>
      b.file.includes(".claude"),
    );
    expect(claudeBlock).toBeDefined();
  });

  it("avoids duplicate codex AGENTS.md entry", () => {
    const skill = makeSkill({ scope: "global" });
    const config = makeConfig();
    const plan = buildRemovalPlan(skill, config);

    const codexBlocks = plan.agentsBlocks.filter((b) =>
      b.file.includes(".codex"),
    );
    // Should not have duplicates for the same file+skillName
    const unique = new Set(codexBlocks.map((b) => b.file));
    expect(codexBlocks.length).toBe(unique.size);
  });
});

describe("buildFullRemovalPlan", () => {
  it("returns empty plan when no matching skills", () => {
    const config = makeConfig();
    const plan = buildFullRemovalPlan("nonexistent", [], config);
    expect(plan.directories).toHaveLength(0);
    expect(plan.ruleFiles).toHaveLength(0);
    expect(plan.agentsBlocks).toHaveLength(0);
  });

  it("combines plans for multiple matching skills (same dirName)", () => {
    const config = makeConfig();
    const skills = [
      makeSkill({
        dirName: "shared-skill",
        scope: "global",
        originalPath: `${HOME}/.claude/skills/shared-skill`,
      }),
      makeSkill({
        dirName: "shared-skill",
        scope: "project",
        originalPath: ".codex/skills/shared-skill",
      }),
    ];

    const plan = buildFullRemovalPlan("shared-skill", skills, config);
    expect(plan.directories).toHaveLength(2);
  });

  it("deduplicates directories with the same path", () => {
    const config = makeConfig();
    const samePath = `${HOME}/.claude/skills/dup-skill`;
    const skills = [
      makeSkill({
        dirName: "dup-skill",
        originalPath: samePath,
        scope: "global",
      }),
      makeSkill({
        dirName: "dup-skill",
        originalPath: samePath,
        scope: "global",
      }),
    ];

    const plan = buildFullRemovalPlan("dup-skill", skills, config);
    expect(plan.directories).toHaveLength(1);
  });

  it("deduplicates rule files", () => {
    const config = makeConfig();
    const skills = [
      makeSkill({
        dirName: "dup-skill",
        scope: "project",
        originalPath: ".claude/skills/dup-skill",
      }),
      makeSkill({
        dirName: "dup-skill",
        scope: "project",
        originalPath: ".codex/skills/dup-skill",
      }),
    ];

    const plan = buildFullRemovalPlan("dup-skill", skills, config);
    // Rule files are resolved identically for project skills with same dirName
    const uniqueRules = new Set(plan.ruleFiles);
    expect(plan.ruleFiles.length).toBe(uniqueRules.size);
  });

  it("deduplicates AGENTS.md blocks with same file+skillName", () => {
    const config = makeConfig();
    const skills = [
      makeSkill({
        dirName: "dup-skill",
        scope: "project",
        originalPath: ".claude/skills/dup-skill",
      }),
      makeSkill({
        dirName: "dup-skill",
        scope: "project",
        originalPath: ".codex/skills/dup-skill",
      }),
    ];

    const plan = buildFullRemovalPlan("dup-skill", skills, config);
    const blockKeys = plan.agentsBlocks.map((b) => `${b.file}::${b.skillName}`);
    const uniqueKeys = new Set(blockKeys);
    expect(blockKeys.length).toBe(uniqueKeys.size);
  });

  it("ignores skills with different dirName", () => {
    const config = makeConfig();
    const skills = [
      makeSkill({ dirName: "target-skill", scope: "global" }),
      makeSkill({ dirName: "other-skill", scope: "global" }),
    ];

    const plan = buildFullRemovalPlan("target-skill", skills, config);
    expect(plan.directories).toHaveLength(1);
    expect(plan.directories[0].path).toContain("test-skill"); // from makeSkill default originalPath
  });
});

describe("executeRemoval with symlinkTo", () => {
  it("creates symlink to kept instance after removing directory", async () => {
    const base = await mkdtemp(join(tmpdir(), "asm-test-"));
    try {
      const keptDir = join(base, "provider-a", "my-skill");
      const dupDir = join(base, "provider-b", "my-skill");
      await mkdir(keptDir, { recursive: true });
      await mkdir(dupDir, { recursive: true });
      await writeFile(join(keptDir, "SKILL.md"), "kept");
      await writeFile(join(dupDir, "SKILL.md"), "dup");

      const plan: RemovalPlan = {
        directories: [{ path: dupDir, isSymlink: false }],
        ruleFiles: [],
        agentsBlocks: [],
      };

      const log = await executeRemoval(plan, keptDir);

      // dupDir should now be a symlink
      const stats = await lstat(dupDir);
      expect(stats.isSymbolicLink()).toBe(true);

      // Should point to the kept directory via relative path
      const target = await readlink(dupDir);
      const expectedRel = relative(join(base, "provider-b"), keptDir);
      expect(target).toBe(expectedRel);

      // Should resolve to the kept directory
      const resolved = await realpath(dupDir);
      const expectedReal = await realpath(keptDir);
      expect(resolved).toBe(expectedReal);

      expect(log).toContain(`Removed directory: ${dupDir}`);
      expect(log.some((l) => l.startsWith("Created symlink:"))).toBe(true);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("re-points existing symlink to kept instance", async () => {
    const base = await mkdtemp(join(tmpdir(), "asm-test-"));
    try {
      const keptDir = join(base, "kept");
      const oldTarget = join(base, "old");
      const dupLink = join(base, "dup-link");
      await mkdir(keptDir, { recursive: true });
      await mkdir(oldTarget, { recursive: true });
      await symlink(oldTarget, dupLink, "dir");

      const plan: RemovalPlan = {
        directories: [{ path: dupLink, isSymlink: true }],
        ruleFiles: [],
        agentsBlocks: [],
      };

      const log = await executeRemoval(plan, keptDir);

      const stats = await lstat(dupLink);
      expect(stats.isSymbolicLink()).toBe(true);
      const resolved = await realpath(dupLink);
      const expectedReal = await realpath(keptDir);
      expect(resolved).toBe(expectedReal);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("does NOT create symlink when symlinkTo is not provided", async () => {
    const base = await mkdtemp(join(tmpdir(), "asm-test-"));
    try {
      const dupDir = join(base, "my-skill");
      await mkdir(dupDir, { recursive: true });

      const plan: RemovalPlan = {
        directories: [{ path: dupDir, isSymlink: false }],
        ruleFiles: [],
        agentsBlocks: [],
      };

      await executeRemoval(plan);

      // dupDir should not exist at all
      try {
        await lstat(dupDir);
        throw new Error("should not exist");
      } catch (err: any) {
        expect(err.code).toBe("ENOENT");
      }
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
