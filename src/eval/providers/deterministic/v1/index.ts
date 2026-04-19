/**
 * Deterministic provider — v1.
 *
 * Zero-dependency runtime evaluator. Parses `eval.yaml` from the skill
 * directory and runs `contains`, `regex`, and `not-contains` graders
 * against the skill's `SKILL.md` body. No subprocess, no API key, no
 * external binary — `asm eval ./my-skill` works on a fresh install.
 *
 * `llm-rubric` graders are reported as `skipped` (severity `info`)
 * rather than failing or erroring, so eval.yaml files written for an
 * LLM-judge provider degrade gracefully here.
 *
 * Grader location:
 *   - Top-level `graders[]` — checked against SKILL.md content.
 *   - Per-task `expect:` blocks — each `contains` / `regex` /
 *     `not-contains` field is treated as a grader against SKILL.md.
 *     Other expect fields (e.g. `lines:` that require live output)
 *     are skipped.
 */

import { readFile, stat } from "fs/promises";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import type {
  ApplicableResult,
  CategoryResult,
  EvalOpts,
  EvalProvider,
  EvalResult,
  Finding,
  SkillContext,
} from "../../../types";

export const PROVIDER_ID = "deterministic";
export const PROVIDER_VERSION = "1.0.0";
export const SCHEMA_VERSION = 1;

/** Default pass threshold (fraction). */
export const DEFAULT_THRESHOLD_FRACTION = 0.8;

/** Supported deterministic grader kinds. */
export type DeterministicGraderKind = "contains" | "regex" | "not-contains";

/** Grader kinds that are recognized but intentionally not executed. */
export type SkippedGraderKind = "llm-rubric";

interface GraderEntry {
  /** Stable id for display. */
  id: string;
  /** Optional task id this grader belongs to. */
  taskId?: string;
  /** Grader kind. */
  kind: DeterministicGraderKind | SkippedGraderKind | "unknown";
  /** Needle for `contains` / `not-contains`. */
  needle?: string;
  /** Pattern source for `regex`. */
  pattern?: string;
  /** Optional regex flags. */
  flags?: string;
  /** Raw kind string when `kind === "unknown"`. */
  rawKind?: string;
}

interface ParsedEvalSpec {
  graders: GraderEntry[];
}

function evalYamlPath(ctx: SkillContext): string {
  return join(ctx.skillPath, "eval.yaml");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isFile();
  } catch {
    return false;
  }
}

/**
 * Map a raw grader `kind` string to one of our known buckets.
 */
function classifyKind(
  raw: unknown,
): DeterministicGraderKind | SkippedGraderKind | "unknown" {
  if (typeof raw !== "string") return "unknown";
  const k = raw.trim().toLowerCase();
  if (k === "contains" || k === "regex" || k === "not-contains") return k;
  if (k === "llm-rubric") return "llm-rubric";
  return "unknown";
}

/**
 * Extract grader entries from a parsed eval.yaml document.
 *
 * Reads top-level `graders[]` plus task-level `expect:` shorthand
 * (`contains`, `regex`, `not-contains`). Unknown shapes degrade to a
 * `kind: "unknown"` entry so the runner reports them rather than
 * silently dropping coverage.
 */
export function extractGraders(doc: unknown): ParsedEvalSpec {
  const out: GraderEntry[] = [];
  if (!doc || typeof doc !== "object") return { graders: out };
  const root = doc as Record<string, unknown>;

  // Top-level graders[].
  if (Array.isArray(root.graders)) {
    root.graders.forEach((g, i) => {
      if (!g || typeof g !== "object") return;
      const obj = g as Record<string, unknown>;
      const kind = classifyKind(obj.kind);
      const id =
        typeof obj.id === "string" && obj.id.length > 0
          ? obj.id
          : `grader-${i + 1}`;
      const entry: GraderEntry = { id, kind };
      if (typeof obj.kind === "string") entry.rawKind = obj.kind;
      if (typeof obj.needle === "string") entry.needle = obj.needle;
      if (typeof obj.pattern === "string") entry.pattern = obj.pattern;
      if (typeof obj.flags === "string") entry.flags = obj.flags;
      out.push(entry);
    });
  }

  // Task-level expect blocks — treat shorthand fields as graders.
  if (Array.isArray(root.tasks)) {
    root.tasks.forEach((t, i) => {
      if (!t || typeof t !== "object") return;
      const task = t as Record<string, unknown>;
      const taskId =
        typeof task.id === "string" && task.id.length > 0
          ? task.id
          : `task-${i + 1}`;
      const expect = task.expect;
      if (!expect || typeof expect !== "object") return;
      const exp = expect as Record<string, unknown>;
      if (typeof exp.contains === "string") {
        out.push({
          id: `${taskId}/contains`,
          taskId,
          kind: "contains",
          needle: exp.contains,
        });
      }
      if (typeof exp["not-contains"] === "string") {
        out.push({
          id: `${taskId}/not-contains`,
          taskId,
          kind: "not-contains",
          needle: exp["not-contains"] as string,
        });
      }
      if (typeof exp.regex === "string") {
        out.push({
          id: `${taskId}/regex`,
          taskId,
          kind: "regex",
          pattern: exp.regex,
        });
      }
    });
  }

  return { graders: out };
}

interface GraderOutcome {
  /** "pass" / "fail" / "skipped" / "error" — drives the per-grader line. */
  status: "pass" | "fail" | "skipped" | "error";
  message: string;
}

/** Run a single grader against the SKILL.md content. */
export function runGrader(g: GraderEntry, content: string): GraderOutcome {
  if (g.kind === "llm-rubric") {
    return {
      status: "skipped",
      message: `${g.id} (llm-rubric) — skipped: requires LLM judge`,
    };
  }
  if (g.kind === "unknown") {
    return {
      status: "skipped",
      message: `${g.id} — skipped: unknown grader kind ${
        g.rawKind ? JSON.stringify(g.rawKind) : "(missing)"
      }`,
    };
  }
  if (g.kind === "contains") {
    if (typeof g.needle !== "string") {
      return {
        status: "error",
        message: `${g.id} (contains) — missing "needle"`,
      };
    }
    const ok = content.includes(g.needle);
    return {
      status: ok ? "pass" : "fail",
      message: `${g.id}  contains ${JSON.stringify(g.needle)}${
        ok ? "" : " — not found"
      }`,
    };
  }
  if (g.kind === "not-contains") {
    if (typeof g.needle !== "string") {
      return {
        status: "error",
        message: `${g.id} (not-contains) — missing "needle"`,
      };
    }
    const present = content.includes(g.needle);
    return {
      status: present ? "fail" : "pass",
      message: `${g.id}  not-contains ${JSON.stringify(g.needle)}${
        present ? " — unexpectedly found" : ""
      }`,
    };
  }
  // regex
  if (typeof g.pattern !== "string") {
    return {
      status: "error",
      message: `${g.id} (regex) — missing "pattern"`,
    };
  }
  let re: RegExp;
  try {
    re = new RegExp(g.pattern, g.flags ?? "");
  } catch (err: any) {
    return {
      status: "error",
      message: `${g.id} (regex) — invalid pattern: ${err?.message ?? String(err)}`,
    };
  }
  const ok = re.test(content);
  return {
    status: ok ? "pass" : "fail",
    message: `${g.id}  regex /${g.pattern}/${g.flags ?? ""}${
      ok ? "" : " — no match"
    }`,
  };
}

/** Resolve a threshold from raw EvalOpts to a 0..1 fraction. */
function resolveThresholdFraction(opts: EvalOpts): number {
  if (typeof opts.threshold === "number" && Number.isFinite(opts.threshold)) {
    return opts.threshold > 1 ? opts.threshold / 100 : opts.threshold;
  }
  return DEFAULT_THRESHOLD_FRACTION;
}

/**
 * Build an EvalResult from grader outcomes.
 *
 * Score is `passing / executed × 100` where `executed` excludes skipped
 * graders. When every grader is skipped, score is 0 and `passed` is
 * `false` — the user's eval.yaml has no executable assertions.
 */
function buildResult(
  outcomes: { grader: GraderEntry; outcome: GraderOutcome }[],
  thresholdFraction: number,
  raw: unknown,
): EvalResult {
  const findings: Finding[] = [];
  const categories: CategoryResult[] = [];
  let passing = 0;
  let executed = 0;

  for (const { grader, outcome } of outcomes) {
    const severity: Finding["severity"] =
      outcome.status === "pass"
        ? "info"
        : outcome.status === "skipped"
          ? "info"
          : outcome.status === "fail"
            ? "warning"
            : "error";
    findings.push({
      severity,
      message: outcome.message,
      categoryId: grader.taskId ?? grader.id,
      code: `grader:${grader.id}`,
    });
    if (outcome.status === "pass") {
      passing++;
      executed++;
    } else if (outcome.status === "fail" || outcome.status === "error") {
      executed++;
    }

    categories.push({
      id: grader.id,
      name: grader.id,
      score: outcome.status === "pass" ? 1 : 0,
      max: outcome.status === "skipped" ? 0 : 1,
    });
  }

  const score = executed === 0 ? 0 : Math.round((passing / executed) * 100);
  const passed = executed > 0 && passing / executed >= thresholdFraction;

  return {
    providerId: PROVIDER_ID,
    providerVersion: PROVIDER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    score,
    passed,
    categories,
    findings,
    raw,
    startedAt: "",
    durationMs: 0,
  };
}

export const deterministicProviderV1: EvalProvider = {
  id: PROVIDER_ID,
  version: PROVIDER_VERSION,
  schemaVersion: SCHEMA_VERSION,
  description:
    "Zero-dependency runtime eval: parses eval.yaml and runs contains/regex/not-contains graders against SKILL.md.",

  async applicable(ctx: SkillContext): Promise<ApplicableResult> {
    const yamlPath = evalYamlPath(ctx);
    if (!(await fileExists(yamlPath))) {
      return {
        ok: false,
        reason: `no eval.yaml at ${yamlPath}`,
      };
    }
    if (!(await fileExists(ctx.skillMdPath))) {
      return {
        ok: false,
        reason: `SKILL.md not found at ${ctx.skillMdPath}`,
      };
    }
    return { ok: true };
  },

  async run(ctx: SkillContext, opts: EvalOpts): Promise<EvalResult> {
    const yamlPath = evalYamlPath(ctx);
    const yamlText = await readFile(yamlPath, "utf-8");
    const doc = parseYaml(yamlText) as unknown;
    const spec = extractGraders(doc);
    const skillContent = await readFile(ctx.skillMdPath, "utf-8");

    const outcomes = spec.graders.map((g) => ({
      grader: g,
      outcome: runGrader(g, skillContent),
    }));

    const thresholdFraction = resolveThresholdFraction(opts);
    return buildResult(outcomes, thresholdFraction, doc);
  },
};

export default deterministicProviderV1;
