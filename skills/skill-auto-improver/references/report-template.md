# Report template

The final `.asm-improver/report.md` produced by this skill. PASS layout first, BLOCKER layout second. The report covers **both gates** — the skill-creator standard (Gate 1) and the asm-eval 85/8 floor (Gate 2).

## PASS example

```
# Skill improvement report

Skill: skills/my-skill
Verdict: PASS
Gate 1 (skill-creator standard): √ pass
Gate 2 (asm-eval): overallScore 91, min category 8
Iterations: 3 of 8
Target version: 0.2.0 → 1.0.0

## Gate 1 — skill-creator standard

| Check                                | Baseline    | Final |
|--------------------------------------|-------------|-------|
| quick_validate.py exit code          | 1 (rejected)| 0     |
| Allowed top-level keys only          | ×           | √     |
| metadata.version present             | ×           | √     |
| metadata.author present              | ×           | √     |
| Description ≤250 chars               | √           | √     |
| Negative-trigger clause              | × (warning) | √     |
| SKILL.md body <500 lines             | √ (290)     | √ (290)|
| docs/README.md AI-skip notice        | √           | √     |
| Bundled scripts have descriptive errors | n/a      | n/a   |

## Gate 2 — asm-eval categories

| Category            | Baseline | Final | Delta   |
|---------------------|----------|-------|---------|
| structure           | 10       | 10    | 0       |
| description         | 4        | 9     | +5      |
| prompt-engineering  | 3        | 10    | +7      |
| context-efficiency  | 6        | 9     | +3      |
| safety              | 5        | 8     | +3      |
| testability         | 2        | 8     | +6      |
| naming              | 10       | 10    | 0       |
| **Overall**         | **57**   | **91**| **+34** |

## Files changed
- SKILL.md
- references/examples.md (new)
- references/prerequisites.md (new)
- docs/README.md (added AI-skip notice)
```

## BLOCKER example

Same layout as PASS, plus a `## Blockers` section listing every gate check still failing with a one-line reason:

```
## Blockers

- **Gate 1 — quick_validate.py**: still rejecting top-level key `architecture`. Field encodes no runtime info; author decision needed: drop it or move under metadata.
- **Gate 2 — testability** (stuck at 6/10): evaluator wants verifiable outputs; skill output is subjective prose. Author decision needed.
- **Gate 2 — safety** (stuck at 7/10): no destructive-action guardrail; add a dry-run or confirmation step.
```

The verdict line on a blocker reads:

```
Verdict: BLOCKER
Gate 1 (skill-creator standard): × failing 1 check
Gate 2 (asm-eval): overallScore 86, min category 6 (below floor)
```

Both gate states are reported even when only one is failing — so a reviewer can see at a glance which gate is the holdup.
