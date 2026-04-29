---
name: skill-auto-improver
description: "Improve a SKILL.md to pass the skill-creator standard (quick_validate, frontmatter audit, ≤500 lines) AND the asm-eval 85/8 floor. Use to level up a skill before publish. Don't use for authoring from scratch, bulk evaluation, or prose rewriting."
license: MIT
compatibility: "Claude Code; requires `asm` on PATH and Python 3 for skill-creator's quick_validate.py"
allowed-tools: Bash Read Write Edit Grep Glob
effort: high
metadata:
  version: 1.0.2
  author: luongnv89
---

# Skill Auto-Improver

You are running an eval-driven improvement loop for a SKILL.md-based skill. The target skill must clear **two gates** in this order:

1. **Skill-creator standard (must-pass floor)** — `python scripts/quick_validate.py` is clean; the Frontmatter Audit passes; SKILL.md is under 500 lines; description has a negative-trigger clause; `metadata.version` and `metadata.author` are present; `docs/README.md` (if it exists) carries the AI-skip notice; bundled scripts print descriptive errors before exiting.
2. **`asm eval` quality floor (supplementary)** — `overallScore > 85` AND every category score `>= 8`.

A skill that scores 92 on `asm eval` but fails `quick_validate.py` is **not** done. A skill that passes `quick_validate.py` but scores 70 on `asm eval` is **not** done. Both gates must clear, or the loop reports a blocker.

## Repo Sync Before Edits (mandatory)

This skill mutates files in a git repo. Before any edit, sync the local branch with the remote:

```bash
branch="$(git rev-parse --abbrev-ref HEAD)"
git fetch origin
git pull --rebase origin "$branch"
```

If the working tree is dirty, `git stash`, sync, then `git stash pop`. If `origin` is missing or `git pull` hits conflicts, **stop and ask the user** before continuing — do not skip or force the sync.

## When to Use

- The user asks to "improve", "level up", "fix", "polish", or "bring up to standard" an existing skill
- A skill fails `quick_validate.py` or scores below the asm-eval 85/8 floor and must ship
- You are preparing a skill for `asm publish` or inclusion in a catalog
- You want to dogfood quality improvements on one of your own skills

If the user only wants a report without edits, run `asm eval <path>` and `python scripts/quick_validate.py <path>` directly — that is not this skill. If the user is authoring a brand-new skill from scratch, send them to `/skill-creator` instead — this skill assumes a SKILL.md already exists.

## Prerequisites

Verify all of the following before touching any files. Stop and tell the user if any fails.

- `asm` is available on PATH (`command -v asm` or `which asm`)
- Python 3 is available, and `~/.claude/skills/skill-creator/scripts/quick_validate.py` exists (skill-creator must be installed locally)
- The target skill path contains a `SKILL.md` file
- The working tree has no unrelated uncommitted edits (dirty files get mixed into diffs)
- You have write access to the skill directory

Resolve the path to skill-creator's validator once at the start and reuse it:

```bash
QV="$HOME/.claude/skills/skill-creator/scripts/quick_validate.py"
test -f "$QV" || { echo "skill-creator not installed at $QV"; exit 1; }
```

## Inputs

The user provides one of:

- A local skill path: `skills/foo` or `/abs/path/to/skill`
- A direct `SKILL.md` file path (treated as its parent directory)
- A GitHub shorthand: `github:owner/repo` or `github:owner/repo:path/to/skill`

For GitHub inputs, ask the user to clone locally first or whether you should open a PR back to that repo. This skill's default path is **local editing** — remote editing is out of scope for v1.

## The Two Gates

### Gate 1 — Skill-creator standard (must-pass floor)

A skill passes this gate when **all** of these are true:

- `python "$QV" "$SKILL_PATH"` exits 0 (no unexpected keys, name is kebab-case ≤64 chars, description is single-line ≤1024 chars, etc.)
- The Frontmatter Audit (full checklist in `references/frontmatter-audit.md`) passes
- `SKILL.md` body is under 500 lines (split to `references/` if not)
- Description includes a negative-trigger clause naming adjacent domains that should not trigger the skill (`quick_validate.py` warns when missing)
- `metadata.version` follows `MAJOR.MINOR.PATCH`; `metadata.author` is present
- If `docs/README.md` exists, it carries the AI-skip HTML comment at the top
- Any bundled scripts under `scripts/` print descriptive errors on stderr before exiting

This gate is **non-negotiable** — `asm publish` and the catalog rely on it.

### Gate 2 — asm-eval 85/8 quality floor (supplementary)

```
overallScore > 85   AND   min(categories[*].score) >= 8
```

Stricter than overall score alone — a skill at 86 with a 5 in `testability` still fails. This forces balanced quality instead of letting one strong area hide a weak one.

## Workflow

Do these phases in order. Do not skip phases or change the order. **Phase 4 is a continuous sidebar that runs throughout Phase 3 — not a standalone step**, which is why it does not appear in the per-phase Step Completion Reports.

### Phase 0 — Capture baseline against both gates

Save the starting state so the before/after diff is auditable:

```bash
mkdir -p .asm-improver
asm eval "$SKILL_PATH" --json > .asm-improver/baseline.json
python "$QV" "$SKILL_PATH" > .asm-improver/baseline-quickvalidate.txt 2>&1 || true
```

Then perform the **Frontmatter Audit** described in `references/frontmatter-audit.md` and save findings to `.asm-improver/baseline-frontmatter-audit.md`.

If the target skill lives inside a git repo, suggest adding `.asm-improver/` to `.gitignore` so iteration artifacts stay out of version control.

Read the JSON and note:

- `overallScore`, `grade`
- Every `categories[].score` (7 categories, each out of 10)
- `topSuggestions` (the evaluator's own priorities)

If the baseline already passes **both** gates, stop immediately — print a one-line summary and skip to the final report. Do not "improve" a skill that already passes.

### Phase 1 — Apply deterministic fixes, then normalize frontmatter

Run the evaluator's auto-fixer for free wins:

```bash
asm eval "$SKILL_PATH" --fix --dry-run   # preview the diff
asm eval "$SKILL_PATH" --fix              # write, creates SKILL.md.bak
```

This handles trailing whitespace, CRLF normalization, missing `effort`, and other mechanical issues. **However, when authorship or version is missing, `asm eval --fix` writes a top-level `author:` (from `git config user.name`) and/or top-level `version: 0.1.0` — both of which `quick_validate.py` rejects as unexpected keys.** Immediately follow with the normalization step below.

#### Frontmatter normalization (mandatory after `--fix`)

Read `references/frontmatter-audit.md` — section "Normalizing `asm eval --fix` output" — for the exact migration. In short:

- Move top-level `author: <name>` → `metadata.author: <name>` (keep the value). The current fixer writes `author:`; older skills may carry a top-level `creator:` instead — treat it the same way and migrate to `metadata.author:`.
- Move top-level `version: <semver>` → `metadata.version: <semver>` (keep the value)
- Drop any other top-level keys that aren't in the allowed set (`name`, `description`, `license`, `allowed-tools`, `metadata`, `compatibility`, `effort`) — e.g., legacy `tags:`. Surface non-trivial drops to the user before deleting.
- Quote any string value containing `:`, `#`, `-`, `<`, `>`, `|`, `{`, `}`, `[`, `]`, `,`, `&`, `*`, `?`, `=`, `!`, `%`, `@`, or `` ` `` per the YAML safety rule

After normalization, re-run **both** checks:

```bash
asm eval "$SKILL_PATH" --json > .asm-improver/iter-1.json
python "$QV" "$SKILL_PATH"
```

Many skills jump 5–15 points on `asm eval` here without touching the body, and `quick_validate.py` typically goes from fail to pass.

### Phase 2 — Fix Gate 1 failures first

`quick_validate.py` and the Frontmatter Audit findings come first because they gate publish. Read `references/skill-creator-checklist.md` for the full retrofit playbook. Common fixes:

- Description missing a negative-trigger clause → append "Don't use for X, Y, Z." naming 2–3 adjacent domains
- Description over 250 chars → trim hedge words, collapse synonyms (1024 is the hard ceiling, 250 is the runtime-budget target)
- Body over 500 lines → split dense sections into `references/<topic>.md` and replace inline content with a one-line pointer
- Missing AI-skip notice in `docs/README.md` → prepend the HTML comment from `references/skill-creator-checklist.md`
- Bundled script exits silently → add `echo "Error: ..." >&2` lines before each `exit 1` / `sys.exit(1)`

Re-run `python "$QV" "$SKILL_PATH"` after every Gate 1 edit. Do not move to Phase 3 until Gate 1 is clean.

### Phase 3 — Fix the lowest asm-eval categories

Sort the 7 categories by score ascending. Work on the lowest one first. Stop when all of them are `>= 8`.

For each category below 8:

1. Read `references/category-playbook.md` to find the fix patterns for that category
2. Apply them with `Edit` (small targeted changes) or `Write` (when restructuring a whole section)
3. Re-run `asm eval "$SKILL_PATH" --json` and `python "$QV" "$SKILL_PATH"` and check the deltas

**Do not batch-edit multiple categories blindly.** Fixes can interact — expanding the body for `testability` can tank `context-efficiency` or push the body over 500 lines (which fails Gate 1). One category at a time, re-eval after each change, keep the ones that help, revert the ones that regress either gate.

### Phase 4 — Watch for cross-gate tradeoffs (sidebar — applies during Phase 3)

These principles apply continuously while doing Phase 3 category fixes, not as a separate sequential phase. Read them once before Phase 3 and keep them in mind on every edit.

The two gates pull in opposite directions on body length:

- `asm eval`'s `prompt-engineering` rewards bodies up to 3000 words
- `asm eval`'s `context-efficiency` rewards bodies under 1500 words
- Gate 1 caps SKILL.md at **500 lines** (the hard skill-creator rule, ~ a few thousand words)

When you add content, default to **linking out, not inlining**:

- Long examples → `references/examples.md` with `See references/examples.md for...`
- Long scripts → `scripts/foo.sh` with `Run scripts/foo.sh to...`
- Long tables → `references/rubric.md`
- Long prerequisite lists → `references/prerequisites.md`

This pattern earns `context-efficiency` points (the words "reference" / "see" / "link" / "template" are scanned for), keeps SKILL.md under the 500-line Gate 1 cap, and reduces token cost on every invocation.

Concretely, if you would need more than ~80 lines to add a section, put it in `references/` and link to it from SKILL.md in 2-3 lines.

### Phase 5 — Bump the target skill's `metadata.version`

This phase **runs as the last action inside each iteration of Phase 6's loop**, not as a separate one-time pass after Phase 6. The number is sequential for narrative flow; the actual execution is per-iteration.

Per skill-creator's Version Management rule, every edit to a SKILL.md must bump `metadata.version` before saving:

- **Patch** (`x.y.Z`): typo fixes, frontmatter-only normalization, minor wording tweaks
- **Minor** (`x.Y.0`): new sections, new references, expanded triggers, added subagents
- **Major** (`X.0.0`): restructured workflow, breaking output-format changes

If the target SKILL.md has no `metadata.version`, add one starting at `1.0.0`. Bump exactly **once per loop iteration**, not once per edit within an iteration — otherwise the version churns ahead of meaningful change.

Record the bump in the loop log so the final report can show baseline → final version.

### Phase 6 — Loop with a cap

Re-run **both** checks after every iteration. The loop stops when any of these is true:

| Stop condition                                               | Outcome                  |
| ------------------------------------------------------------ | ------------------------ |
| Gate 1 passes AND `overallScore > 85` AND `min(scores) >= 8` | PASS — proceed to report |
| 8 eval iterations completed                                  | BLOCKER — write report   |
| 3 consecutive iterations with no movement on either gate     | BLOCKER — write report   |
| 2 consecutive iterations with regression on either gate      | BLOCKER — revert, report |

**Mid-iteration Gate 1 regressions** — a Phase 3 edit can push SKILL.md over the 500-line cap or otherwise break a Gate 1 check (the two gates pull in opposite directions on body length; see Phase 4). When this happens within an iteration, do not let it close the iteration as a regression: drop back into Phase 2, fix the Gate 1 break in the same iteration, then re-run both checks. Only count the iteration as a regression if both gates are still worse than the previous iteration after that fix lands. This prevents the loop from tripping the "2 consecutive regressions" stop condition on a churn that the agent could resolve in-place.

Save every iteration's JSON to `.asm-improver/iter-N.json` and a one-line gate summary to `.asm-improver/iter-N-gates.txt` so the final report can diff them.

### Phase 7 — Write the final report

On pass, write `.asm-improver/report.md` with:

- Target skill path
- Baseline vs final for **both gates**: `quick_validate.py` status, Frontmatter Audit findings cleared, `overallScore`, `grade`, per-category before/after table
- Target skill's `metadata.version`: baseline → final
- Files changed (list every path under the skill directory that was edited or created)
- Iterations taken (N of 8)
- Key fixes applied (one line per category or audit item that moved)

On blocker, write the same report but add a "Blockers" section explaining why a gate was not cleared. Blocker entries must name the gate (Gate 1 or Gate 2), the specific failing check (e.g., `quick_validate.py: unexpected key 'tags'`), and what the loop was unable to resolve. Do not pretend a blocker is a pass.

Example blocker entry:

> **Gate 2 — testability** (stuck at 6/10): The evaluator wants verifiable outputs and an "Acceptance Criteria" section. The skill's output is a subjective rewrite of prose, which is hard to express as a testable assertion. Author decision needed: accept a 6 here, or redefine scope so output is machine-checkable.

## Step Completion Reports (mandatory)

After each phase, emit a compact status block so pass/fail is scannable:

```
◆ Phase N — [phase name]
··································································
  Frontmatter valid:   √ pass
  quick_validate:      √ pass
  asm overall:         86 → 91
  Min category:        7 → 8
  Target version:      1.2.0 → 1.3.0
  Result:              PASS | FAIL | PARTIAL
```

Use `√` for pass, `×` for fail, `—` for context. Report per phase: Phase 0 (baseline captured), Phase 1 (deterministic + normalization), Phase 2 (Gate 1 fixes), Phase 3 (asm-eval category fixes), Phase 5 (version bump applied), Phase 6 (loop stop condition), Phase 7 (final report written).

## Acceptance Criteria

- `.asm-improver/baseline.json`, `.asm-improver/baseline-quickvalidate.txt`, and `.asm-improver/baseline-frontmatter-audit.md` captured before any edits
- `asm eval --fix` applied, then frontmatter normalized so `quick_validate.py` accepts the result
- Each Gate 1 check addressed at least once before any Gate 2 work
- Each `asm eval` category below 8 addressed at least once
- Re-eval against **both** gates after every iteration, captured to `.asm-improver/iter-N.json` and `.asm-improver/iter-N-gates.txt`
- Target skill's `metadata.version` bumped exactly once per iteration that produced edits
- Loop stops on one of the 4 conditions in Phase 6 — never unbounded
- `.asm-improver/report.md` exists on exit, pass or blocker
- On PASS: `python "$QV" "$SKILL_PATH"` exits 0 AND final eval JSON shows `overallScore > 85` AND `min(categories[*].score) >= 8`
- On BLOCKER: report names every Gate 1 check still failing and every category still below 8 with a one-line reason

### Expected output

See `references/report-template.md` for the full PASS and BLOCKER report templates. On BLOCKER, include a `## Blockers` section naming each failing gate check with a one-line reason.

## Edge Cases

- **Skill already passes both gates**: stop at Phase 0, skip to report. Do not edit passing skills.
- **SKILL.md has no frontmatter**: `asm eval --fix` cannot add it. Ask the user whether to scaffold one (using the skill-creator template) or abort.
- **Iterating regresses either gate**: revert the last edit (`cp SKILL.md.bak SKILL.md` if available, or undo via git) and try a different fix pattern from the playbook.
- **`asm eval --fix` writes a key `quick_validate.py` rejects**: this is expected — Phase 1's normalization step handles it. Do not skip the normalization.
- **Description over 250 chars after edits**: trim. The 250-char target prevents tail-first truncation in Claude Code's `/skills` listing, which would chop your negative-trigger clause.
- **SKILL.md body over 500 lines**: split into `references/` per the progressive-disclosure rule. SKILL.md must drop below 500 before exit.
- **Loop caps out at 8 iterations**: the skill has structural issues auto-improvement cannot solve. Write the blocker report and hand back to the user.
- **GitHub shorthand input**: for v1, ask the user to clone locally first. Remote editing is out of scope.
- **Destructive action**: never `rm -rf` the skill directory. `asm eval --fix` creates `SKILL.md.bak` — leave it in place until the user explicitly cleans up.

## References

- `references/skill-creator-checklist.md` — Gate 1 retrofit playbook (frontmatter, README, scripts, body length)
- `references/frontmatter-audit.md` — full audit checklist plus the `asm eval --fix` normalization migration
- `references/category-playbook.md` — per-category fix patterns for `asm eval` Gate 2
- `references/report-template.md` — PASS and BLOCKER report layouts
- `~/.claude/skills/skill-creator/scripts/quick_validate.py` — the Gate 1 mechanical validator
- `~/.claude/skills/skill-creator/references/frontmatter-rules.md` — upstream source of the audit rules
- `asm eval --help` — flag reference for the evaluator
- `src/evaluator.ts` in the ASM repo — source of truth for how each Gate 2 category is scored
