# Architecture

## Overview

skill-manager is a terminal UI application that scans, displays, and manages skills installed for various AI coding agents. It follows a simple layered architecture: CLI entry → app bootstrap → core modules → TUI views.

## Components

### CLI Entry (`bin/skill-manager.ts`)

Handles `--help` and `--version` flags, then delegates to the main app entry point.

### App Bootstrap (`src/index.ts`)

Initializes the OpenTUI renderer, wires up keyboard handlers, and manages view state transitions (dashboard, detail, confirm, config, help).

### Core Modules

| Module               | Responsibility                                              |
| -------------------- | ----------------------------------------------------------- |
| `src/config.ts`      | Load/save config from `~/.config/skill-manager/config.json` |
| `src/scanner.ts`     | Walk provider directories, parse SKILL.md, filter & sort    |
| `src/uninstaller.ts` | Build removal plans and execute safe deletions              |

### Views (`src/views/`)

Each view is a factory function that creates OpenTUI components:

- **dashboard.ts** — Main layout with scope tabs, search input, stats bar
- **skill-list.ts** — Scrollable, selectable list of discovered skills
- **skill-detail.ts** — Overlay showing full skill metadata
- **confirm.ts** — Uninstall confirmation dialog with target list
- **config.ts** — Provider toggle UI
- **help.ts** — Keyboard shortcut overlay

### Utilities (`src/utils/`)

- **types.ts** — Shared TypeScript interfaces (`SkillInfo`, `AppConfig`, `Scope`, etc.)
- **colors.ts** — Neon green color palette for the TUI
- **frontmatter.ts** — YAML-like frontmatter parser for SKILL.md files

## Data Flow

```
Config (disk) → Scanner (walk dirs) → SkillInfo[] → Views (render)
                                                   ↕
                                          Keyboard Events → State Machine → View Transitions
                                                   ↓
                                          Uninstaller → Filesystem Mutations → Rescan
```

## State Management

Application state is held in module-level variables in `src/index.ts`:

- `allSkills` / `filteredSkills` — current skill data
- `currentScope` / `currentSort` / `searchQuery` — filter state
- `viewState` — which overlay is active (`dashboard`, `detail`, `confirm`, `config`, `help`)

State transitions are driven by keyboard events and propagated to views via update functions.
