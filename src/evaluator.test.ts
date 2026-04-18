import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import {
  buildFixPlan,
  evaluateSkillContent,
  evaluateSkill,
  applyFix,
  splitSkillMd,
  unifiedDiff,
  formatReport,
  formatReportJSON,
  formatFixPreview,
  buildEvalMachineData,
} from "./evaluator";
import { mkdtemp, rm, readFile, writeFile, access } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

let tempDir: string;

function skillDir(name = "sample-skill") {
  return join(tempDir, name);
}

async function writeSkillMd(
  dir: string,
  content: string,
  fileName = "SKILL.md",
): Promise<string> {
  const { mkdir } = await import("fs/promises");
  await mkdir(dir, { recursive: true });
  const p = join(dir, fileName);
  await writeFile(p, content, "utf-8");
  return p;
}

const HIGH_QUALITY_SKILL = `---
name: code-review
description: Review pull request diffs for code smells, style issues, and safety problems before merging.
version: 1.0.0
license: MIT
creator: Test Author
compatibility: Claude Code
allowed-tools: Read Grep
effort: medium
---

# Code review

## When to Use

- When the user asks to "review this PR" or "check the diff"
- Before merging any change larger than 10 lines

## Prerequisites

- A git repository with the target branch checked out
- Read access to the files being reviewed

## Instructions

1. Run \`git diff main...HEAD\` to list files
2. Read each file and check for common smells
3. Emit a markdown report summarising findings

## Example

\`\`\`bash
$ asm eval ./code-review
Overall score: 95/100
\`\`\`

## Acceptance Criteria

- Produces a markdown report with sections per file
- Flags any use of \`eval()\` or \`exec\` as dangerous
- Does not modify the working tree

## Edge cases

- Empty diffs: emit a short "no changes" note
- Binary files: skip and mention the filename in the report

## Safety

See \`references/safety.md\` for error handling rules.
Always confirm before writing. Never run destructive commands without a dry-run.
`;

const POOR_SKILL = `---
name: BadName
description: foo
---

short
`;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "eval-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("splitSkillMd", () => {
  it("splits frontmatter and body", () => {
    const r = splitSkillMd("---\nname: x\n---\nhello world\n");
    expect(r.rawFrontmatter).toBe("name: x");
    expect(r.body.trim()).toBe("hello world");
  });

  it("handles no frontmatter", () => {
    const r = splitSkillMd("just markdown\n");
    expect(r.rawFrontmatter).toBeNull();
    expect(r.body).toContain("just markdown");
  });

  it("handles unclosed frontmatter", () => {
    const r = splitSkillMd("---\nkey: value\nmore\n");
    expect(r.rawFrontmatter).not.toBeNull();
  });
});

describe("evaluateSkillContent", () => {
  it("scores a high-quality skill highly", () => {
    const report = evaluateSkillContent({
      content: HIGH_QUALITY_SKILL,
      skillPath: "/virtual/code-review",
      skillMdPath: "/virtual/code-review/SKILL.md",
    });
    expect(report.overallScore).toBeGreaterThan(70);
    expect(report.grade).not.toBe("F");
    expect(report.categories).toHaveLength(7);
  });

  it("returns 7 categories with the expected ids", () => {
    const report = evaluateSkillContent({
      content: HIGH_QUALITY_SKILL,
      skillPath: "/virtual/code-review",
      skillMdPath: "/virtual/code-review/SKILL.md",
    });
    const ids = report.categories.map((c) => c.id).sort();
    expect(ids).toEqual(
      [
        "context-efficiency",
        "description",
        "naming",
        "prompt-engineering",
        "safety",
        "structure",
        "testability",
      ].sort(),
    );
  });

  it("scores a poor skill lower than a good one", () => {
    const good = evaluateSkillContent({
      content: HIGH_QUALITY_SKILL,
      skillPath: "/virtual/code-review",
      skillMdPath: "/virtual/code-review/SKILL.md",
    });
    const poor = evaluateSkillContent({
      content: POOR_SKILL,
      skillPath: "/virtual/bad",
      skillMdPath: "/virtual/bad/SKILL.md",
    });
    expect(poor.overallScore).toBeLessThan(good.overallScore);
  });

  it("detects missing frontmatter fields", () => {
    const report = evaluateSkillContent({
      content: "---\nname: test\n---\nbody\n",
      skillPath: "/virtual/test",
      skillMdPath: "/virtual/test/SKILL.md",
    });
    const structure = report.categories.find((c) => c.id === "structure")!;
    expect(structure.findings.some((f) => /description/i.test(f))).toBe(true);
  });

  it("penalises very short descriptions", () => {
    const report = evaluateSkillContent({
      content: "---\nname: a\ndescription: foo\n---\nbody\n",
      skillPath: "/virtual/a",
      skillMdPath: "/virtual/a/SKILL.md",
    });
    const desc = report.categories.find((c) => c.id === "description")!;
    expect(desc.score).toBeLessThan(5);
  });

  it("rewards action-verb + trigger phrasing in descriptions", () => {
    const report = evaluateSkillContent({
      content:
        "---\nname: x\ndescription: Generate release notes when shipping a new version of the package.\n---\nbody text with content here\n",
      skillPath: "/virtual/x",
      skillMdPath: "/virtual/x/SKILL.md",
    });
    const desc = report.categories.find((c) => c.id === "description")!;
    expect(desc.score).toBeGreaterThanOrEqual(7);
  });

  it("flags non-kebab-case names", () => {
    const report = evaluateSkillContent({
      content:
        "---\nname: BadName\ndescription: Something that does work.\n---\nbody\n",
      skillPath: "/virtual/BadName",
      skillMdPath: "/virtual/BadName/SKILL.md",
    });
    const naming = report.categories.find((c) => c.id === "naming")!;
    expect(
      naming.findings.some((f) => /not lowercase kebab-case/.test(f)),
    ).toBe(true);
  });

  it("produces up to 3 top suggestions", () => {
    const report = evaluateSkillContent({
      content: POOR_SKILL,
      skillPath: "/virtual/bad",
      skillMdPath: "/virtual/bad/SKILL.md",
    });
    expect(report.topSuggestions.length).toBeGreaterThan(0);
    expect(report.topSuggestions.length).toBeLessThanOrEqual(3);
  });

  it("scores in the 0..100 range", () => {
    const report = evaluateSkillContent({
      content: POOR_SKILL,
      skillPath: "/virtual/bad",
      skillMdPath: "/virtual/bad/SKILL.md",
    });
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
  });

  it("awards naming bonus when directory matches frontmatter name", () => {
    const matchDir = evaluateSkillContent({
      content:
        "---\nname: my-skill\ndescription: Generate something when asked.\n---\n# hi\n\n## When to Use\n- thing\n",
      skillPath: "/virtual/my-skill",
      skillMdPath: "/virtual/my-skill/SKILL.md",
    });
    const mismatchDir = evaluateSkillContent({
      content:
        "---\nname: my-skill\ndescription: Generate something when asked.\n---\n# hi\n\n## When to Use\n- thing\n",
      skillPath: "/virtual/other-dir",
      skillMdPath: "/virtual/other-dir/SKILL.md",
    });
    const matchScore = matchDir.categories.find(
      (c) => c.id === "naming",
    )!.score;
    const mismatchScore = mismatchDir.categories.find(
      (c) => c.id === "naming",
    )!.score;
    expect(matchScore).toBeGreaterThanOrEqual(mismatchScore);
  });
});

describe("evaluateSkill (filesystem)", () => {
  it("reads SKILL.md from a directory", async () => {
    const dir = skillDir("ok");
    await writeSkillMd(dir, HIGH_QUALITY_SKILL);
    const report = await evaluateSkill(dir);
    expect(report.skillPath).toBe(dir);
    expect(report.overallScore).toBeGreaterThan(60);
  });

  it("accepts a direct SKILL.md file path", async () => {
    const dir = skillDir("ok2");
    const p = await writeSkillMd(dir, HIGH_QUALITY_SKILL);
    const report = await evaluateSkill(p);
    expect(report.skillMdPath).toBe(p);
  });

  it("throws when path does not exist", async () => {
    await expect(evaluateSkill(join(tempDir, "missing"))).rejects.toThrow(
      /does not exist/i,
    );
  });

  it("throws when SKILL.md is missing", async () => {
    const { mkdir } = await import("fs/promises");
    await mkdir(join(tempDir, "empty"), { recursive: true });
    await expect(evaluateSkill(join(tempDir, "empty"))).rejects.toThrow(
      /SKILL\.md/,
    );
  });
});

describe("buildFixPlan", () => {
  it("adds missing version when absent", () => {
    const plan = buildFixPlan(
      "---\nname: x\ndescription: do a thing\n---\n\nbody here\n",
    );
    expect(plan.newContent).toContain("version: 0.1.0");
    expect(plan.applied.some((a) => a.id === "add-missing-version")).toBe(true);
  });

  it("does not touch version when already set", () => {
    const plan = buildFixPlan(
      "---\nname: x\ndescription: do a thing\nversion: 2.0.0\n---\n\nbody\n",
    );
    expect(plan.newContent).not.toContain("version: 0.1.0");
    expect(plan.applied.some((a) => a.id === "add-missing-version")).toBe(
      false,
    );
  });

  it("adds creator from gitAuthor option when absent", () => {
    const plan = buildFixPlan(
      "---\nname: x\ndescription: do a thing\n---\n\nbody\n",
      { gitAuthor: "Jane Doe" },
    );
    expect(plan.newContent).toContain("creator: Jane Doe");
    expect(plan.applied.some((a) => a.id === "add-missing-creator")).toBe(true);
  });

  it("skips creator when no gitAuthor is provided", () => {
    const plan = buildFixPlan(
      "---\nname: x\ndescription: do a thing\n---\n\nbody\n",
    );
    expect(plan.skipped.some((s) => s.id === "add-missing-creator")).toBe(true);
  });

  it("infers effort from line count when missing", () => {
    const longBody = Array.from({ length: 30 }, (_, i) => `line ${i}`).join(
      "\n",
    );
    const plan = buildFixPlan(
      `---\nname: x\ndescription: do a thing\n---\n\n${longBody}\n`,
    );
    expect(plan.newContent).toMatch(/effort: (low|medium|high|max)/);
    expect(plan.applied.some((a) => a.id === "infer-missing-effort")).toBe(
      true,
    );
  });

  it("normalises CRLF to LF", () => {
    const plan = buildFixPlan(
      "---\r\nname: x\r\ndescription: do a thing\r\n---\r\n\r\nbody\r\n",
    );
    expect(plan.newContent).not.toContain("\r");
    expect(plan.applied.some((a) => a.id === "normalise-line-endings")).toBe(
      true,
    );
  });

  it("strips trailing whitespace", () => {
    const plan = buildFixPlan(
      "---\nname: x   \ndescription: do a thing  \n---\n\nbody   \n",
    );
    expect(plan.applied.some((a) => a.id === "strip-trailing-whitespace")).toBe(
      true,
    );
    expect(plan.newContent).not.toMatch(/[ \t]+\n/);
  });

  it("reorders frontmatter keys to canonical order", () => {
    const plan = buildFixPlan(
      "---\ncreator: Alice\nname: x\nversion: 0.1.0\ndescription: do a thing\n---\n\nbody\n",
    );
    expect(plan.applied.some((a) => a.id === "reorder-frontmatter")).toBe(true);
    const nameIdx = plan.newContent.indexOf("name:");
    const descIdx = plan.newContent.indexOf("description:");
    const creatorIdx = plan.newContent.indexOf("creator:");
    expect(nameIdx).toBeLessThan(descIdx);
    expect(descIdx).toBeLessThan(creatorIdx);
  });

  it("leaves description alone (content-level fix)", () => {
    const plan = buildFixPlan("---\nname: x\n---\n\nbody\n");
    expect(plan.skipped.some((s) => s.id === "missing-description")).toBe(true);
  });

  it("skips when there is no frontmatter", () => {
    const plan = buildFixPlan("# hi\njust markdown\n");
    expect(plan.skipped.some((s) => s.id === "missing-frontmatter")).toBe(true);
  });
});

describe("unifiedDiff", () => {
  it("returns empty string when contents match", () => {
    expect(unifiedDiff("abc\n", "abc\n")).toBe("");
  });

  it("includes +/- lines on change", () => {
    const d = unifiedDiff("a\nb\nc\n", "a\nX\nc\n");
    expect(d).toContain("-b");
    expect(d).toContain("+X");
  });
});

describe("applyFix", () => {
  it("dry-run does NOT modify the file", async () => {
    const dir = skillDir("dry");
    const original = "---\nname: dry\ndescription: does a thing\n---\n\nbody\n";
    await writeSkillMd(dir, original);
    const r = await applyFix(dir, { dryRun: true, gitAuthor: "Alice" });
    expect(r.dryRun).toBe(true);
    const after = await readFile(join(dir, "SKILL.md"), "utf-8");
    expect(after).toBe(original);
    expect(r.backupPath).toBeNull();
    expect(r.applied.length).toBeGreaterThan(0);
    expect(r.diff).not.toBe("");
  });

  it("writing applies changes and creates .bak backup", async () => {
    const dir = skillDir("wet");
    const original = "---\nname: wet\ndescription: does a thing\n---\n\nbody\n";
    await writeSkillMd(dir, original);
    const r = await applyFix(dir, { dryRun: false, gitAuthor: "Alice" });
    expect(r.dryRun).toBe(false);
    expect(r.backupPath).toBe(join(dir, "SKILL.md.bak"));
    const after = await readFile(join(dir, "SKILL.md"), "utf-8");
    expect(after).toContain("version: 0.1.0");
    expect(after).toContain("creator: Alice");
    const backup = await readFile(r.backupPath!, "utf-8");
    expect(backup).toBe(original);
  });

  it("is idempotent when nothing needs fixing", async () => {
    const dir = skillDir("clean");
    await writeSkillMd(dir, HIGH_QUALITY_SKILL);
    const r = await applyFix(dir, { dryRun: false, gitAuthor: "Ignored" });
    expect(r.applied).toEqual([]);
    expect(r.backupPath).toBeNull();
    // No changes → .bak should not be created
    await expect(access(join(dir, "SKILL.md.bak"))).rejects.toThrow();
  });

  it("report is consistent with the post-fix content", async () => {
    const dir = skillDir("cons");
    await writeSkillMd(
      dir,
      "---\nname: cons\ndescription: does a specific thing when asked.\n---\n\n# cons\n\nSome body text with enough content to pass basic checks.\n",
    );
    const r = await applyFix(dir, { dryRun: false, gitAuthor: "Bob" });
    expect(r.report.frontmatter.version).toBe("0.1.0");
    expect(r.report.frontmatter.creator).toBe("Bob");
  });
});

describe("formatters", () => {
  it("formatReport contains key sections", () => {
    const report = evaluateSkillContent({
      content: HIGH_QUALITY_SKILL,
      skillPath: "/virtual/code-review",
      skillMdPath: "/virtual/code-review/SKILL.md",
    });
    const text = formatReport(report);
    expect(text).toContain("Overall score:");
    expect(text).toContain("Categories:");
    expect(text).toContain("Structure & completeness");
  });

  it("formatReportJSON returns parseable JSON", () => {
    const report = evaluateSkillContent({
      content: HIGH_QUALITY_SKILL,
      skillPath: "/virtual/code-review",
      skillMdPath: "/virtual/code-review/SKILL.md",
    });
    const parsed = JSON.parse(formatReportJSON(report));
    expect(parsed.overallScore).toBeGreaterThan(0);
    expect(Array.isArray(parsed.categories)).toBe(true);
  });

  it("buildEvalMachineData has the expected shape", () => {
    const report = evaluateSkillContent({
      content: HIGH_QUALITY_SKILL,
      skillPath: "/virtual/code-review",
      skillMdPath: "/virtual/code-review/SKILL.md",
    });
    const data = buildEvalMachineData(report);
    expect(data.overall_score).toBe(report.overallScore);
    expect(data.categories.length).toBe(7);
    expect(data.fix).toBeNull();
  });

  it("formatFixPreview summarises applied and skipped items", () => {
    const report = evaluateSkillContent({
      content: HIGH_QUALITY_SKILL,
      skillPath: "/virtual/code-review",
      skillMdPath: "/virtual/code-review/SKILL.md",
    });
    const preview = formatFixPreview({
      report,
      applied: [{ id: "x", description: "did the thing" }],
      skipped: [{ id: "y", description: "skipped the other thing" }],
      diff: "",
      dryRun: true,
      backupPath: null,
      skillMdPath: "/virtual/code-review/SKILL.md",
    });
    expect(preview).toContain("did the thing");
    expect(preview).toContain("skipped the other thing");
  });
});
