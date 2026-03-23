# Changelog

## v1.13.0 — 2026-03-23

### Added

- Parse and display all 6 SKILL.md frontmatter fields: `name`, `description`, `license`, `compatibility`, `allowed-tools`, and `metadata` (#14)
- `allowed-tools` risk coloring in CLI and TUI: red for Bash/Write/Edit, yellow for WebFetch/WebSearch, green for Read/Grep/Glob
- Warning line for skills with high-risk tools (e.g., "This skill can execute shell commands and modify files")
- `license`, `compatibility`, and `allowedTools` included in `--json` output for `asm inspect`, `asm list`, and `asm index search`
- Backfill for legacy skill indices missing `compatibility` and `allowedTools` fields

### Fixed

- `asm index search --json` now includes `compatibility` and `allowedTools` fields
- TUI detail overlay height calculation accounts for warning row when high-risk tools are present

## v1.12.0 — 2026-03-23

### Features

- Add MiniMax-AI/skills repo to curated skill index — 10 new skills discoverable via `asm search` (#43, #47)
- Enrich skill-index with license/creator metadata and filter flags (#10, #46)
- Extract curated skill repos into `data/skill-index-resources.json` for maintainability (#13, #45)
- Add `effort` field to SKILL.md frontmatter (#36, #37)

### Bug Fixes

- Stub `bun:ffi` at build time for Node.js compatibility (#35, #44)
- Scope unit-tests CI job to `src/` to exclude E2E tests

### Testing

- Add E2E tests for skill index search via both Bun and Node runtimes
- Add multi-job CI pipeline with E2E validation for Node 18/20/22

### Documentation

- Add effort field documentation to README

**Full Changelog**: https://github.com/luongnv89/agent-skill-manager/compare/v1.11.0...v1.12.0

## v1.11.0 — 2026-03-21

### Features

- Interactive checkbox picker for multi-skill install — navigate with ↑/↓, toggle with Space, select all with `a`, confirm with Enter (#32)
- Search/filter support in checkbox picker for quickly finding skills in long lists (#9)
- Interactive checkbox picker for provider selection during config (#9)
- Support Vercel skills CLI install format (#29)
- Support installing skills from local folder paths (#22)
- Wave 1 provider expansion — add 8 new providers, fix `$EDITOR` config, add creator column (#12)
- Rename user-facing "Provider" to "Tool" in CLI and TUI (#12)
- Reorder install flow and improve CLI colors

### Bug Fixes

- Change shebang to `node` for npm global install compatibility (#30)
- Fix skill detail TUI description overflow (#28)
- Guard ingester/audit against local paths and restrict tilde expansion (#27)
- Fix checkbox picker re-render cursor positioning
- Update README for all-enabled providers, remove dead code
- Address test reliability issues across 7 test files

### Testing

- Add 71 CLI integration tests for all commands and flags
- Expand unit test coverage from 71.8% to 88.2%

### Documentation

- Add screenshots to README for visual feature showcase
- Update README with full 15-provider table and Wave 1 changes
- Transform README into landing-page structure
- Add PRD, tasks, and competitor analysis for v2.0 roadmap

**Full Changelog**: https://github.com/luongnv89/agent-skill-manager/compare/v1.10.0...v1.11.0

## v1.10.0 — 2026-03-18

### Features

- Add `asm index` command with bundled pre-indexed skill data for fast offline skill discovery
- Support nested metadata blocks in SKILL.md frontmatter — parser now handles one-level YAML nesting with dot notation (e.g., `metadata.version`, `metadata.creator`)
- Add `resolveVersion()` helper that prefers `metadata.version` over top-level `version` for consistent version resolution across all commands
- Update `asm init` scaffold template to use new metadata block format with `license` and `creator` fields

### Bug Fixes

- Fix duplicate install names in multi-skill installs
- Fix valid JSON output for `asm audit security --all --json` when no skills are found
- Upgrade `actions/checkout` to v5 to resolve Node.js 20 deprecation warning in CI
- Format `installer.test.ts` to pass CI prettier check
- Fix CLI integration test to use proper semver comparison instead of string comparison

### Documentation

- Add open-source skill collections section to README with 5 new collections
- Add TUI dashboard screenshot

**Full Changelog**: https://github.com/luongnv89/agent-skill-manager/compare/v1.9.0...v1.10.0

## v1.9.0 — 2026-03-14

### Features

- Support GitHub subfolder URLs for `asm install` and `asm audit security` — URLs like `https://github.com/user/skills/tree/main/skills/agent-config` are now automatically parsed to detect the branch and subfolder path
- Add `github:owner/repo#ref:path` shorthand syntax for installing skills from a specific subfolder on a specific branch
- Add `resolveSubpath()` function that uses `git ls-remote` to disambiguate branch names from subfolder paths in `/tree/` URLs
- Subfolder URL support works across all operations: install, security audit, and multi-skill discovery

**Full Changelog**: https://github.com/luongnv89/agent-skill-manager/compare/v1.8.3...v1.9.0

## v1.8.3 — 2026-03-14

### Bug Fixes

- Replace Unicode box-drawing characters with ASCII equivalents for terminal compatibility

**Full Changelog**: https://github.com/luongnv89/agent-skill-manager/compare/v1.8.2...v1.8.3

## v1.8.2 — 2026-03-14

### Improvements

- Redesign security audit report with compact 4-zone layout (header box, threat summary, findings, footer)
- Deduplicate matches so the same file:line appears once per category
- Group matches by file for compact rendering (e.g., `:10, :25, :41`)
- Merge Permission Analysis into Findings section, eliminating redundant file references
- Add aggregate critical/warning/info counts and inline permission labels in threat summary
- Truncate match text to 50 chars for clean terminal display
- Use box-drawing characters for stronger visual hierarchy

**Full Changelog**: https://github.com/luongnv89/agent-skill-manager/compare/v1.8.1...v1.8.2

## v1.8.1 — 2026-03-14

### Bug Fixes

- Fix duplicate skill removal to create symlinks to the kept instance instead of just deleting the folder, so skills remain accessible from all provider locations

**Full Changelog**: https://github.com/luongnv89/agent-skill-manager/compare/v1.8.0...v1.8.1

## v1.8.0 — 2026-03-14

### Features

- Add `--transport <https|ssh|auto>` flag for `asm install` to support private GitHub repos via SSH with automatic fallback (Issue #6)
- Add `asm audit security` subcommand for scanning skills for dangerous patterns (shell execution, network access, credential exposure, obfuscation)
- Add `--all` flag for `asm audit security` to audit all installed skills at once
- Support auditing remote GitHub skills before installing via `asm audit security github:owner/repo`

### Improvements

- Extract shared file utilities (`BINARY_EXTENSIONS`, `readFilesRecursive`) into `src/utils/fs.ts` to eliminate duplication
- Consolidate ANSI color helpers into `formatter.ts` with new `bg*` variants
- Split `cmdAuditSecurity` into focused sub-functions for readability

**Full Changelog**: https://github.com/luongnv89/agent-skill-manager/compare/v1.7.0...v1.8.0

## v1.7.0 — 2026-03-13

### Features

- Add YAML frontmatter validation for SKILL.md files using the `yaml` library
- Detect and report `invalid-yaml` warnings in `asm inspect` and `asm list` health checks

### Dependencies

- Add `yaml` (^2.8.2) as a runtime dependency for strict YAML parsing

**Full Changelog**: https://github.com/luongnv89/agent-skill-manager/compare/v1.6.2...v1.7.0

## v1.6.2 — 2026-03-13

### Bug Fixes

- Suppress "fatal: not a git repository" stderr noise when running outside a git repo
- Fix 7 failing tests to match the new grouped CLI output format from v1.6.0

### Other Changes

- Update README screenshot

**Full Changelog**: https://github.com/luongnv89/agent-skill-manager/compare/v1.6.1...v1.6.2

## v1.6.1 — 2026-03-13

### Bug Fixes

- Replace Unicode bar chart characters with ASCII-safe chars in `asm stats` output

**Full Changelog**: https://github.com/luongnv89/agent-skill-manager/compare/v1.6.0...v1.6.1

## v1.6.0 — 2026-03-13

### Features

- Overhaul CLI output with grouped views, provider colors, and visual stats
- Improve inspect output with grouped multi-provider view

**Full Changelog**: https://github.com/luongnv89/agent-skill-manager/compare/v1.5.1...v1.6.0

## v1.5.1 — 2026-03-12

### Bug Fixes

- Improve batch install UX and replace Unicode with ASCII-safe chars

**Full Changelog**: https://github.com/luongnv89/agent-skill-manager/compare/v1.5.0...v1.5.1
