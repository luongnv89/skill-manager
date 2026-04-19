# Evaluation Providers

`asm eval` evaluates a skill against a quality rubric and returns a score, verdict, and structured findings. Behind the command is a **provider framework** that plugs different evaluators into the same `EvalResult` shape.

This doc covers:

- How providers work and why they're versioned on two axes
- The two built-in providers (`quality`, `deterministic`) and how `asm eval` picks between them
- How to pin a provider version
- The `--compare` upgrade safety workflow
- A 5-step checklist for adding a new provider

## How providers work

Every provider implements the [`EvalProvider`](../src/eval/types.ts) contract:

```ts
export interface EvalProvider {
  id: string; // e.g. "quality", "deterministic"
  version: string; // semver — bumps freely
  schemaVersion: number; // integer — only on structural breaks
  description: string;
  requires?: string[];
  externalRequires?: ExternalRequirement;
  applicable(ctx, opts): Promise<ApplicableResult>;
  run(ctx, opts): Promise<EvalResult>;
}
```

The runner in `src/eval/runner.ts` owns three cross-cutting concerns so providers don't have to: **timing** (`startedAt` + `durationMs`), **error normalization** (thrown errors become error-shaped `EvalResult` values), and **timeout enforcement** (both hard timeouts and external `AbortSignal`s).

### Provider resolution

Providers register into a shared registry (`src/eval/registry.ts`) keyed by `id` with an array of versions per id:

```ts
import { register, resolve } from "src/eval/registry";

register(qualityProviderV1); // quality@1.0.0
register(deterministicProviderV1); // deterministic@1.0.0

// Semver-range resolution — picks the highest version in range.
const p = resolve("quality", "^1.0.0");
```

Supported range shapes:

- `*` or `x` — any version
- `X.Y.Z` — exact match (including pre-release)
- `^X.Y.Z` — same major (or minor, when major is 0)
- `~X.Y.Z` — same major.minor

### Two version axes

Providers carry **two** version numbers, and the distinction matters when you plan upgrades:

| Axis            | Meaning                                                     | Bump when                                 |
| --------------- | ----------------------------------------------------------- | ----------------------------------------- |
| `version`       | Provider semver. Participates in `resolve("id", "^1.0.0")`. | You release a new provider build.         |
| `schemaVersion` | Shape version of the `EvalResult` payload.                  | You structurally change the result shape. |

In practice, `schemaVersion` barely moves — once a provider ships v1 with its result shape, downstream parsers lock in. `version` bumps freely across feature/fix releases. Tools that consume `EvalResult` JSON output should key parsers off `schemaVersion`, not `version`.

## Built-in providers

ASM ships two built-in providers and `asm eval` picks one automatically based on what's in the skill directory.

### `deterministic`

Zero-dependency runtime evaluator. **Selected when the skill directory contains an `eval.yaml`.**

It parses the YAML spec and runs three grader kinds against the skill's `SKILL.md` body:

- `contains` — pass if `needle` is a substring of `SKILL.md`.
- `regex` — pass if the pattern matches.
- `not-contains` — pass if `needle` is **not** present.

Per-task `expect:` blocks (`contains`, `regex`, `not-contains` shorthand) are expanded into graders too.

`llm-rubric` graders are reported as `skipped` — they require an LLM judge that this provider intentionally does not invoke. No subprocess, no API key, no Docker — `asm eval ./my-skill` works on a fresh install.

Example `eval.yaml`:

```yaml
name: my-skill
threshold: 0.8

graders:
  - id: heading
    kind: contains
    needle: "## Instructions"
  - id: starts-with-title
    kind: regex
    pattern: "^# "
    flags: m
```

### `quality`

Static linter for `SKILL.md` structure, description quality, prompt engineering, context efficiency, safety, testability, and naming. **Selected when no `eval.yaml` is present.** Also runs in `--fix` mode with a built-in auto-fixer.

## Listing registered providers

```bash
asm eval-providers list
```

Shows id, version, schemaVersion, description, and any `requires` tags. `--json` emits a machine-readable array of the same records.

## Pinning a provider version

### Via `~/.asm/config.yml`

```yaml
eval:
  defaults:
    threshold: 70
    timeoutMs: 60000
  providers:
    deterministic:
      version: "^1.0.0" # pin the range
      threshold: 0.9
```

The `version` key is a semver range that future CLI upgrades honor. Today `asm eval` picks the highest version in range; explicit pinning is what keeps CI stable when a new provider version ships.

### Via `--compare` (one-off)

`--compare` is the **upgrade safety mechanism**: run two pinned provider versions against the same skill and diff the results before promoting a new version.

```bash
asm eval ./my-skill --compare quality@1.0.0,quality@1.0.0
```

The diff covers:

- **Score** — delta, with a clear `+`/`-` sign
- **Verdict** — pass→fail / fail→pass flips flagged as regressions
- **Categories** — per-category score/max deltas, plus added/removed categories
- **Findings** — keyed by `code` (or message as fallback); added shown with `+`, removed with `-`
- **Schema** — a visible warning when `schemaVersion` differs between versions

Both versions have to exist in the registry. If the second one doesn't, you get a clean error:

```
Error: resolve: no version of "quality" satisfies "2.0.0-next"
       (have: 1.0.0)
```

### Output modes

| Mode       | Flag        | Use case                              |
| ---------- | ----------- | ------------------------------------- |
| Human      | _(default)_ | Terminal reading; colors by default   |
| JSON       | `--json`    | Ad-hoc scripting; `{ before, after }` |
| Machine v1 | `--machine` | CI pipelines; stable envelope schema  |

Exit code reflects the newer (`after`) version's `passed` field so CI can wire `--compare` into an upgrade gate without parsing output.

## 5-step checklist: add a new provider

Follow these steps when wiring a new evaluator into the framework.

### 1. Create the provider module

Scaffold under `src/eval/providers/<id>/v<N>/`:

```
src/eval/providers/myprovider/v1/
├── index.ts        // exports myProviderV1: EvalProvider
├── index.test.ts   // adapter unit tests
└── (optional) adapter.ts, spawn.ts, fixtures/
```

Export a constant named `<id>ProviderV<N>` implementing `EvalProvider`. Keep every external dependency (network, subprocess, filesystem writes) behind an injectable seam so tests can run without them.

### 2. Implement `applicable()` cheaply

Return `{ ok: false, reason }` with an actionable message when the provider can't run (missing config, missing files, wrong version). `applicable()` runs synchronously-fast — no LLM calls, no long IO.

### 3. Implement `run()` against the contract

- Return `score` in `[0..100]`, not whatever scale your underlying tool uses.
- Set `passed` per your provider's threshold semantics.
- Emit at least one category (`"overall"` is fine for providers without a breakdown).
- Leave `startedAt`/`durationMs` as placeholders — the runner stamps them.
- Put raw tool output in `raw` so downstream consumers can reach the full payload.
- Don't catch your own errors. The runner wraps them into error-shaped results.

### 4. Register the provider

Edit [`src/eval/providers/index.ts`](../src/eval/providers/index.ts):

```ts
import { register } from "../registry";
import { myProviderV1 } from "./myprovider/v1";

export function registerBuiltins(): void {
  // ...existing...
  register(myProviderV1);
}
```

Providers register unconditionally. Environment checks belong in `applicable()`, not at registration time — `asm eval-providers list` must be deterministic across machines.

### 5. Add tests and docs

- Unit tests co-located at `index.test.ts`.
- An integration test in `src/cli.test.ts` (if the provider needs CLI plumbing).
- A short paragraph in `docs/eval-providers.md` and an entry in `docs/ARCHITECTURE.md`.

## See also

- [`src/eval/types.ts`](../src/eval/types.ts) — contract definitions
- [`src/eval/registry.ts`](../src/eval/registry.ts) — semver range matching
- [`src/eval/runner.ts`](../src/eval/runner.ts) — timing + error normalization
- [`src/eval/compare.ts`](../src/eval/compare.ts) — `--compare` diff rendering
- [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) — `src/eval/` module overview
