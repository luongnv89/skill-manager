## v1.0.0 — 2025-03-11

Initial release of **agent-skill-manager** — the universal skill manager for AI coding agents.

### Features

- Interactive TUI dashboard built with OpenTUI and Bun
- Multi-agent support: Claude Code, Codex, OpenClaw, and generic Agents
- Configurable providers via `~/.config/agent-skill-manager/config.json`
- Global and project scope filtering with Tab cycling
- Real-time search and sort (by name, version, location)
- Detailed skill view with SKILL.md frontmatter metadata
- Safe uninstall with confirmation dialog and full removal plan
- In-TUI config editor — toggle providers on/off or open in `$EDITOR`
- CLI entry point with `--help` and `--version` flags
- Neon green logo suite and brand kit

### Infrastructure

- Pre-commit hooks (Prettier, TypeScript type-checking)
- GitHub Actions CI pipeline (type-check + tests)
- 63 unit tests covering config, scanner, uninstaller, and frontmatter modules
- OSS-ready: LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue/PR templates

### Install

```bash
bun install -g agent-skill-manager
```

**Full Changelog**: https://github.com/luongnv89/agent-skill-manager/commits/v1.0.0
