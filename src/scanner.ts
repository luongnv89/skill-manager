import {
  readdir,
  stat,
  lstat,
  readlink,
  readFile,
  realpath,
} from "fs/promises";
import { join, resolve } from "path";
import { parseFrontmatter } from "./utils/frontmatter";
import { resolveProviderPath } from "./config";
import type { SkillInfo, Scope, SortBy, AppConfig } from "./utils/types";

interface ScanLocation {
  dir: string;
  location: string;
  scope: "global" | "project";
  providerName: string;
  providerLabel: string;
}

function buildScanLocations(config: AppConfig, scope: Scope): ScanLocation[] {
  const locations: ScanLocation[] = [];

  for (const provider of config.providers) {
    if (!provider.enabled) continue;

    if (scope === "global" || scope === "both") {
      locations.push({
        dir: resolveProviderPath(provider.global),
        location: `global-${provider.name}`,
        scope: "global",
        providerName: provider.name,
        providerLabel: provider.label,
      });
    }

    if (scope === "project" || scope === "both") {
      locations.push({
        dir: resolveProviderPath(provider.project),
        location: `project-${provider.name}`,
        scope: "project",
        providerName: provider.name,
        providerLabel: provider.label,
      });
    }
  }

  for (const custom of config.customPaths) {
    if (scope === custom.scope || scope === "both") {
      locations.push({
        dir: resolveProviderPath(custom.path),
        location: `${custom.scope}-custom`,
        scope: custom.scope,
        providerName: "custom",
        providerLabel: custom.label,
      });
    }
  }

  return locations;
}

async function countFiles(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir, { recursive: true } as any);
    return entries.length;
  } catch {
    return 0;
  }
}

async function scanDirectory(loc: ScanLocation): Promise<SkillInfo[]> {
  const skills: SkillInfo[] = [];

  let entries: string[];
  try {
    entries = await readdir(loc.dir);
  } catch {
    return skills;
  }

  for (const entry of entries) {
    const entryPath = join(loc.dir, entry);

    try {
      const entryStat = await stat(entryPath);
      if (!entryStat.isDirectory()) continue;
    } catch {
      continue;
    }

    const skillMdPath = join(entryPath, "SKILL.md");
    let content: string;
    try {
      content = await readFile(skillMdPath, "utf-8");
    } catch {
      continue;
    }

    const fm = parseFrontmatter(content);

    let isSymlink = false;
    let symlinkTarget: string | null = null;
    try {
      const lstats = await lstat(entryPath);
      if (lstats.isSymbolicLink()) {
        isSymlink = true;
        symlinkTarget = await readlink(entryPath);
      }
    } catch {
      // not a symlink
    }

    const resolvedPath = resolve(entryPath);
    let resolvedRealPath: string;
    try {
      resolvedRealPath = await realpath(entryPath);
    } catch {
      resolvedRealPath = resolvedPath;
    }

    const fileCount = await countFiles(entryPath);

    skills.push({
      name: fm.name || entry,
      version: fm.version || "0.0.0",
      description: (fm.description || "").replace(/\s*\n\s*/g, " ").trim(),
      dirName: entry,
      path: resolvedPath,
      originalPath: entryPath,
      location: loc.location,
      scope: loc.scope,
      provider: loc.providerName,
      providerLabel: loc.providerLabel,
      isSymlink,
      symlinkTarget,
      realPath: resolvedRealPath,
      fileCount,
    });
  }

  return skills;
}

export async function scanAllSkills(
  config: AppConfig,
  scope: Scope,
): Promise<SkillInfo[]> {
  const locations = buildScanLocations(config, scope);
  const results = await Promise.all(locations.map(scanDirectory));
  return results.flat();
}

export function searchSkills(skills: SkillInfo[], query: string): SkillInfo[] {
  if (!query.trim()) return skills;
  const q = query.toLowerCase();
  return skills.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.location.toLowerCase().includes(q) ||
      s.providerLabel.toLowerCase().includes(q),
  );
}

export function sortSkills(skills: SkillInfo[], by: SortBy): SkillInfo[] {
  const sorted = [...skills];
  switch (by) {
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "version":
      sorted.sort((a, b) => a.version.localeCompare(b.version));
      break;
    case "location":
      sorted.sort((a, b) => a.location.localeCompare(b.location));
      break;
  }
  return sorted;
}
