import { ansi } from "./formatter";
import type { SkillInfo, DuplicateGroup, AuditReport } from "./utils/types";

// ─── Detection ─────────────────────────────────────────────────────────────

export function detectDuplicates(skills: SkillInfo[]): AuditReport {
  const groups: DuplicateGroup[] = [];
  const coveredPaths = new Set<string>();

  // Rule 1: same dirName across different locations
  const byDirName = new Map<string, SkillInfo[]>();
  for (const s of skills) {
    const bucket = byDirName.get(s.dirName) ?? [];
    bucket.push(s);
    byDirName.set(s.dirName, bucket);
  }

  for (const [dirName, members] of byDirName) {
    const uniqueLocations = new Set(members.map((m) => m.location));
    if (uniqueLocations.size >= 2) {
      groups.push({ key: dirName, reason: "same-dirName", instances: members });
      for (const m of members) coveredPaths.add(m.path);
    }
  }

  // Rule 2: same frontmatter name but different dirName
  const byName = new Map<string, SkillInfo[]>();
  for (const s of skills) {
    if (!s.name) continue;
    const bucket = byName.get(s.name) ?? [];
    bucket.push(s);
    byName.set(s.name, bucket);
  }

  for (const [name, members] of byName) {
    const uniqueDirNames = new Set(members.map((m) => m.dirName));
    if (uniqueDirNames.size < 2) continue;

    // Skip members already covered by Rule 1
    const uncovered = members.filter((m) => !coveredPaths.has(m.path));
    if (uncovered.length < 2) continue;

    // Also need at least 2 distinct dirNames among uncovered
    const uncoveredDirNames = new Set(uncovered.map((m) => m.dirName));
    if (uncoveredDirNames.size < 2) continue;

    groups.push({
      key: name,
      reason: "same-frontmatterName",
      instances: uncovered,
    });
  }

  // Sort: same-dirName groups first, then same-frontmatterName; within each, by key
  groups.sort((a, b) => {
    if (a.reason !== b.reason) {
      return a.reason === "same-dirName" ? -1 : 1;
    }
    return a.key.localeCompare(b.key);
  });

  const totalDuplicateInstances = groups.reduce(
    (sum, g) => sum + g.instances.length,
    0,
  );

  return {
    scannedAt: new Date().toISOString(),
    totalSkills: skills.length,
    duplicateGroups: groups,
    totalDuplicateInstances,
  };
}

// ─── Deterministic sort for "which instance to keep" ───────────────────────

export function sortInstancesForKeep(instances: SkillInfo[]): SkillInfo[] {
  return [...instances].sort((a, b) => {
    // Global before project
    if (a.scope !== b.scope) return a.scope === "global" ? -1 : 1;
    // Then by provider label alphabetically
    const provCmp = a.providerLabel.localeCompare(b.providerLabel);
    if (provCmp !== 0) return provCmp;
    // Then by path
    return a.path.localeCompare(b.path);
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

export function reasonLabel(reason: DuplicateGroup["reason"]): string {
  return reason === "same-dirName" ? "same dirName" : "same name";
}

// ─── CLI Formatters ────────────────────────────────────────────────────────

export function formatAuditReport(report: AuditReport): string {
  if (report.duplicateGroups.length === 0) {
    return ansi.green("No duplicate skills found.");
  }

  const lines: string[] = [];
  lines.push(
    ansi.bold(
      `Found ${report.duplicateGroups.length} duplicate group(s) (${report.totalDuplicateInstances} total instances):`,
    ),
  );
  lines.push("");

  for (const group of report.duplicateGroups) {
    lines.push(
      ansi.yellow(`  Group: "${group.key}" (${reasonLabel(group.reason)})`),
    );
    const sorted = sortInstancesForKeep(group.instances);
    for (let i = 0; i < sorted.length; i++) {
      const s = sorted[i];
      const keepLabel = i === 0 ? ansi.green(" (recommended keep)") : "";
      lines.push(
        `    ${ansi.dim("•")} ${s.path}  [${s.providerLabel}/${s.scope}]${keepLabel}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function formatAuditReportJSON(report: AuditReport): string {
  return JSON.stringify(report, null, 2);
}
