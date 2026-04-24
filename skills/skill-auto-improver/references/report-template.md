# Report template

The final `.asm-improver/report.md` produced by this skill. PASS layout first, BLOCKER layout second.

## PASS example

```
# Skill improvement report

Skill: skills/my-skill
Verdict: PASS (overallScore 91, min category 8)
Iterations: 3 of 8

## Before vs after

| Category            | Baseline | Final | Delta |
|---------------------|----------|-------|-------|
| structure           | 10       | 10    | 0     |
| description         | 4        | 9     | +5    |
| prompt-engineering  | 3        | 10    | +7    |
| context-efficiency  | 6        | 9     | +3    |
| safety              | 5        | 8     | +3    |
| testability         | 2        | 8     | +6    |
| naming              | 10       | 10    | 0     |
| **Overall**         | **57**   | **91**| **+34** |

## Files changed
- SKILL.md
- references/examples.md (new)
- references/prerequisites.md (new)
```

## BLOCKER example

Same layout as PASS, plus a `## Blockers` section listing every category still below 8 with a one-line reason each:

```
## Blockers

- **testability** (stuck at 6/10): evaluator wants verifiable outputs; skill output is subjective prose. Author decision needed.
- **safety** (stuck at 7/10): no destructive-action guardrail; add a dry-run or confirmation step.
```
