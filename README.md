# skill-manager

Interactive TUI for managing installed skills for AI coding agents — [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Codex](https://github.com/openai/codex), [OpenClaw](https://github.com/openclaw), and more.

Built with [OpenTUI](https://github.com/nicholasgasior/opentui) and [Bun](https://bun.sh).

## Features

- **Multi-agent support** — Manage skills for Claude Code, Codex, OpenClaw, and custom agent tools from one TUI
- **Configurable providers** — Define which agent tool directories to scan via `~/.config/skill-manager/config.json`
- **Global & project scopes** — Filter skills by global (`~/.<tool>/skills/`) or project-level (`./<tool>/skills/`)
- **Real-time search** — Filter skills by name, description, or provider
- **Sort** — By name, version, or location
- **Detailed skill view** — Metadata from SKILL.md frontmatter including provider, path, symlink info
- **Safe uninstall** — Confirmation dialog, removes skill directories, rule files, and AGENTS.md blocks
- **In-TUI config editor** — Toggle providers on/off, or open config in `$EDITOR`

## Install

```bash
# Requires Bun >= 1.0.0
bun install -g skill-manager
```

Or run directly from this repo:

```bash
git clone https://github.com/luongnv89/skill-manager.git
cd skill-manager
bun install
bun run start
```

## Usage

```bash
skill-manager              # Launch the interactive TUI
skill-manager --help       # Show help
skill-manager --version    # Show version
```

## Configuration

On first run, a config file is created at `~/.config/skill-manager/config.json` with default providers:

```json
{
  "version": 1,
  "providers": [
    {
      "name": "claude",
      "label": "Claude Code",
      "global": "~/.claude/skills",
      "project": ".claude/skills",
      "enabled": true
    },
    {
      "name": "codex",
      "label": "Codex",
      "global": "~/.codex/skills",
      "project": ".codex/skills",
      "enabled": true
    },
    {
      "name": "openclaw",
      "label": "OpenClaw",
      "global": "~/.openclaw/skills",
      "project": ".openclaw/skills",
      "enabled": true
    },
    {
      "name": "agents",
      "label": "Agents",
      "global": "~/.agents/skills",
      "project": ".agents/skills",
      "enabled": true
    }
  ],
  "customPaths": [],
  "preferences": {
    "defaultScope": "both",
    "defaultSort": "name"
  }
}
```

- **Add providers** — Add new entries to the `providers` array for any agent tool
- **Custom paths** — Add arbitrary directories via `customPaths`
- **Disable providers** — Set `enabled: false` to skip scanning a provider
- **Preferences** — Set default scope and sort order

You can also toggle providers on/off directly in the TUI by pressing `c`.

## Keyboard Shortcuts

| Key            | Action                                |
| -------------- | ------------------------------------- |
| `↑/↓` or `j/k` | Navigate skill list                   |
| `Enter`        | View skill details                    |
| `d`            | Uninstall selected skill              |
| `/`            | Search / filter skills                |
| `Esc`          | Back / clear filter / close dialog    |
| `Tab`          | Cycle scope: Global → Project → Both  |
| `s`            | Cycle sort: Name → Version → Location |
| `r`            | Refresh / rescan skills               |
| `c`            | Open configuration                    |
| `q`            | Quit                                  |
| `?`            | Toggle help overlay                   |

## Supported Agent Tools

| Tool             | Global Path           | Project Path        |
| ---------------- | --------------------- | ------------------- |
| Claude Code      | `~/.claude/skills/`   | `.claude/skills/`   |
| Codex            | `~/.codex/skills/`    | `.codex/skills/`    |
| OpenClaw         | `~/.openclaw/skills/` | `.openclaw/skills/` |
| Agents (generic) | `~/.agents/skills/`   | `.agents/skills/`   |

Additional tools can be added via the config file.

## License

MIT
