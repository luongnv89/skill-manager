#!/usr/bin/env bun

import { VERSION, VERSION_STRING } from "../src/utils/version";

const arg = process.argv[2];

if (arg === "--help" || arg === "-h") {
  console.log(`\x1b[1m\x1b[36magent-skill-manager\x1b[0m ${VERSION_STRING}

Interactive TUI for managing installed skills for AI coding agents (Claude Code, Codex, OpenClaw, and more).

\x1b[1mUsage:\x1b[0m
  agent-skill-manager              Launch the interactive TUI dashboard
  agent-skill-manager --help       Show this help message
  agent-skill-manager --version    Show version

\x1b[1mRequirements:\x1b[0m
  Bun >= 1.0.0  (https://bun.sh)

\x1b[1mConfig:\x1b[0m
  ~/.config/agent-skill-manager/config.json

\x1b[1mTUI Keybindings:\x1b[0m
  ↑/↓ or j/k   Navigate skill list
  Enter         View skill details
  d             Uninstall selected skill
  /             Search / filter skills
  Esc           Back / clear filter / close dialog
  Tab           Cycle scope: Global → Project → Both
  s             Cycle sort: Name → Version → Location
  r             Refresh / rescan skills
  c             Open configuration
  q             Quit
  ?             Toggle help overlay`);
  process.exit(0);
}

if (arg === "--version" || arg === "-v") {
  console.log(`agent-skill-manager ${VERSION_STRING}`);
  process.exit(0);
}

// Launch the TUI
await import("../src/index.ts");

export {};
