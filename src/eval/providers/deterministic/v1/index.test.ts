import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { deterministicProviderV1, extractGraders, runGrader } from "./index";

describe("deterministic provider — extractGraders", () => {
  it("reads top-level graders", () => {
    const doc = {
      graders: [
        { id: "shape", kind: "contains", needle: "## " },
        { id: "rx", kind: "regex", pattern: "^# " },
      ],
    };
    const spec = extractGraders(doc);
    expect(spec.graders).toHaveLength(2);
    expect(spec.graders[0]?.kind).toBe("contains");
    expect(spec.graders[1]?.kind).toBe("regex");
  });

  it("expands per-task expect blocks into graders", () => {
    const doc = {
      tasks: [
        { id: "t1", expect: { contains: "no changes" } },
        {
          id: "t2",
          expect: { regex: "^feat", "not-contains": "TODO" },
        },
      ],
    };
    const spec = extractGraders(doc);
    expect(spec.graders.map((g) => g.id)).toEqual([
      "t1/contains",
      "t2/not-contains",
      "t2/regex",
    ]);
  });

  it("classifies llm-rubric as a skipped kind", () => {
    const doc = { graders: [{ id: "judge", kind: "llm-rubric" }] };
    const spec = extractGraders(doc);
    expect(spec.graders[0]?.kind).toBe("llm-rubric");
  });

  it("returns empty list for non-object input", () => {
    expect(extractGraders(null).graders).toHaveLength(0);
    expect(extractGraders("foo").graders).toHaveLength(0);
  });
});

describe("deterministic provider — runGrader", () => {
  const content = "# Title\n\n## Section\n\nThis covers no changes here.";

  it("contains: passes when needle present", () => {
    const r = runGrader(
      { id: "g", kind: "contains", needle: "no changes" },
      content,
    );
    expect(r.status).toBe("pass");
  });

  it("contains: fails when needle absent", () => {
    const r = runGrader(
      { id: "g", kind: "contains", needle: "missing" },
      content,
    );
    expect(r.status).toBe("fail");
  });

  it("not-contains: passes when needle absent", () => {
    const r = runGrader(
      { id: "g", kind: "not-contains", needle: "TODO" },
      content,
    );
    expect(r.status).toBe("pass");
  });

  it("not-contains: fails when needle present", () => {
    const r = runGrader(
      { id: "g", kind: "not-contains", needle: "Title" },
      content,
    );
    expect(r.status).toBe("fail");
  });

  it("regex: passes on match", () => {
    const r = runGrader(
      { id: "g", kind: "regex", pattern: "^## ", flags: "m" },
      content,
    );
    expect(r.status).toBe("pass");
  });

  it("regex: fails on no match", () => {
    const r = runGrader({ id: "g", kind: "regex", pattern: "nope" }, content);
    expect(r.status).toBe("fail");
  });

  it("regex: errors on invalid pattern", () => {
    const r = runGrader({ id: "g", kind: "regex", pattern: "(" }, content);
    expect(r.status).toBe("error");
  });

  it("llm-rubric is reported as skipped", () => {
    const r = runGrader({ id: "g", kind: "llm-rubric" }, content);
    expect(r.status).toBe("skipped");
  });
});

describe("deterministic provider — applicable + run", () => {
  let tmp: string;
  let skillDir: string;

  beforeAll(async () => {
    tmp = await mkdtemp(join(tmpdir(), "det-provider-"));
    skillDir = join(tmp, "skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      "---\nname: t\ndescription: Sample skill that contains no changes when invoked.\n---\n\n# T\n\n## Steps\n\nSummary mentions feat and no changes.\n",
    );
    await writeFile(
      join(skillDir, "eval.yaml"),
      [
        "name: t",
        "tasks:",
        "  - id: summarize",
        "    expect:",
        "      contains: 'no changes'",
        "  - id: feat-shape",
        "    expect:",
        "      contains: 'feat'",
        "graders:",
        "  - id: heading",
        "    kind: contains",
        "    needle: '## '",
        "  - id: judge",
        "    kind: llm-rubric",
        "",
      ].join("\n"),
    );
  });

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("applicable() is ok when eval.yaml + SKILL.md exist", async () => {
    const ctx = {
      skillPath: skillDir,
      skillMdPath: join(skillDir, "SKILL.md"),
    };
    const r = await deterministicProviderV1.applicable(ctx, {});
    expect(r.ok).toBe(true);
  });

  it("applicable() is not ok when eval.yaml missing", async () => {
    const ctx = { skillPath: tmp, skillMdPath: join(skillDir, "SKILL.md") };
    const r = await deterministicProviderV1.applicable(ctx, {});
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no eval.yaml/);
  });

  it("run() scores executed graders, skips llm-rubric", async () => {
    const ctx = {
      skillPath: skillDir,
      skillMdPath: join(skillDir, "SKILL.md"),
    };
    const result = await deterministicProviderV1.run(ctx, {});
    expect(result.providerId).toBe("deterministic");
    // All three executable graders pass against SKILL.md → 3/3 = 100.
    expect(result.score).toBe(100);
    expect(result.passed).toBe(true);
    // One finding per grader, including the skipped llm-rubric one.
    expect(result.findings).toHaveLength(4);
    const skipped = result.findings.find((f) => /skipped/.test(f.message));
    expect(skipped).toBeDefined();
  });
});
