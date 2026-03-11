import { readFile, writeFile, mkdir } from "fs/promises";
import { join, resolve, dirname } from "path";
import { homedir } from "os";
import type { AppConfig, ProviderConfig } from "./utils/types";

const HOME = homedir();
const CONFIG_DIR = join(HOME, ".config", "agent-skill-manager");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    name: "claude",
    label: "Claude Code",
    global: "~/.claude/skills",
    project: ".claude/skills",
    enabled: true,
  },
  {
    name: "codex",
    label: "Codex",
    global: "~/.codex/skills",
    project: ".codex/skills",
    enabled: true,
  },
  {
    name: "openclaw",
    label: "OpenClaw",
    global: "~/.openclaw/skills",
    project: ".openclaw/skills",
    enabled: true,
  },
  {
    name: "agents",
    label: "Agents",
    global: "~/.agents/skills",
    project: ".agents/skills",
    enabled: true,
  },
];

export function getDefaultConfig(): AppConfig {
  return {
    version: 1,
    providers: DEFAULT_PROVIDERS.map((p) => ({ ...p })),
    customPaths: [],
    preferences: {
      defaultScope: "both",
      defaultSort: "name",
    },
  };
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function resolveProviderPath(pathTemplate: string): string {
  if (pathTemplate.startsWith("~/")) {
    return join(HOME, pathTemplate.slice(2));
  }
  if (pathTemplate.startsWith("/")) {
    return pathTemplate;
  }
  // Relative path — resolve from cwd (project-level)
  return resolve(pathTemplate);
}

function mergeWithDefaults(config: Partial<AppConfig>): AppConfig {
  const defaults = getDefaultConfig();
  const providers = config.providers || [];

  // Add any new default providers that don't exist in the saved config
  const existingNames = new Set(providers.map((p) => p.name));
  for (const defaultProvider of defaults.providers) {
    if (!existingNames.has(defaultProvider.name)) {
      providers.push({ ...defaultProvider });
    }
  }

  return {
    version: config.version ?? defaults.version,
    providers,
    customPaths: config.customPaths ?? [],
    preferences: {
      defaultScope:
        config.preferences?.defaultScope ?? defaults.preferences.defaultScope,
      defaultSort:
        config.preferences?.defaultSort ?? defaults.preferences.defaultSort,
    },
  };
}

export async function loadConfig(): Promise<AppConfig> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return mergeWithDefaults(parsed);
  } catch {
    // Config doesn't exist or is invalid — use defaults
    const config = getDefaultConfig();
    await saveConfig(config);
    return config;
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}
