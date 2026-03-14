import { debug } from "./logger";
import { ansi } from "./formatter";
import { readFilesRecursive } from "./utils/fs";
import type { FileContent } from "./utils/fs";
import type {
  SourceAnalysis,
  CodeScanMatch,
  CodeScanCategory,
  PermissionRequest,
  SecurityAuditReport,
  SecurityVerdict,
} from "./utils/types";

// ─── Code Scan Patterns ─────────────────────────────────────────────────────

interface ScanPattern {
  category: string;
  description: string;
  pattern: RegExp;
  severity: "critical" | "warning" | "info";
  permissionType?: PermissionRequest["type"];
}

const SCAN_PATTERNS: ScanPattern[] = [
  // Network / Data Exfiltration
  {
    category: "Network requests",
    description:
      "Commands or APIs that download or upload data over the network",
    pattern: /\bcurl\b/,
    severity: "critical",
    permissionType: "network",
  },
  {
    category: "Network requests",
    description:
      "Commands or APIs that download or upload data over the network",
    pattern: /\bwget\b/,
    severity: "critical",
    permissionType: "network",
  },
  {
    category: "Network requests",
    description:
      "Commands or APIs that download or upload data over the network",
    pattern: /\bfetch\s*\(/,
    severity: "warning",
    permissionType: "network",
  },
  {
    category: "Network requests",
    description:
      "Commands or APIs that download or upload data over the network",
    pattern: /\baxios\b/,
    severity: "warning",
    permissionType: "network",
  },
  {
    category: "Network requests",
    description:
      "Commands or APIs that download or upload data over the network",
    pattern: /\bhttp\.request\b/,
    severity: "warning",
    permissionType: "network",
  },
  {
    category: "Network requests",
    description:
      "Commands or APIs that download or upload data over the network",
    pattern: /\bXMLHttpRequest\b/,
    severity: "warning",
    permissionType: "network",
  },

  // External URLs
  {
    category: "External URLs",
    description:
      "Hardcoded URLs that may indicate data exfiltration or remote payload loading",
    pattern: /https?:\/\/(?!github\.com|localhost|127\.0\.0\.1|example\.com)/,
    severity: "warning",
    permissionType: "network",
  },

  // Shell Execution
  {
    category: "Shell execution",
    description:
      "Commands that execute shell processes or arbitrary system commands",
    pattern: /\bexec\s*\(/,
    severity: "critical",
    permissionType: "shell",
  },
  {
    category: "Shell execution",
    description:
      "Commands that execute shell processes or arbitrary system commands",
    pattern: /\bexecSync\b/,
    severity: "critical",
    permissionType: "shell",
  },
  {
    category: "Shell execution",
    description:
      "Commands that execute shell processes or arbitrary system commands",
    pattern: /\bchild_process\b/,
    severity: "critical",
    permissionType: "shell",
  },
  {
    category: "Shell execution",
    description:
      "Commands that execute shell processes or arbitrary system commands",
    pattern: /\bspawn\s*\(/,
    severity: "critical",
    permissionType: "shell",
  },
  {
    category: "Shell execution",
    description:
      "Commands that execute shell processes or arbitrary system commands",
    pattern: /\bBun\.spawn\b/,
    severity: "critical",
    permissionType: "shell",
  },
  {
    category: "Shell execution",
    description:
      "Commands that execute shell processes or arbitrary system commands",
    pattern: /\bshelljs\b/,
    severity: "critical",
    permissionType: "shell",
  },
  {
    category: "Shell execution",
    description:
      "Commands that execute shell processes or arbitrary system commands",
    pattern: /\b(?:bash|sh|zsh)\s+-c\b/,
    severity: "critical",
    permissionType: "shell",
  },

  // Code Execution
  {
    category: "Dynamic code execution",
    description:
      "Patterns that execute dynamically constructed code at runtime",
    pattern: /\beval\s*\(/,
    severity: "critical",
    permissionType: "code-execution",
  },
  {
    category: "Dynamic code execution",
    description:
      "Patterns that execute dynamically constructed code at runtime",
    pattern: /\bnew\s+Function\b/,
    severity: "critical",
    permissionType: "code-execution",
  },
  {
    category: "Dynamic code execution",
    description:
      "Patterns that execute dynamically constructed code at runtime",
    pattern: /\bFunction\s*\(/,
    severity: "critical",
    permissionType: "code-execution",
  },
  {
    category: "Dynamic code execution",
    description:
      "Patterns that execute dynamically constructed code at runtime",
    pattern: /\bimport\s*\(\s*[^'"]/,
    severity: "warning",
    permissionType: "code-execution",
  },

  // File System Access
  {
    category: "File system access",
    description: "Operations that read, write, or modify files on disk",
    pattern: /\bfs\.(?:write|append|unlink|rm|mkdir|rename)\b/,
    severity: "warning",
    permissionType: "filesystem",
  },
  {
    category: "File system access",
    description: "Operations that read, write, or modify files on disk",
    pattern: /\bwriteFile(?:Sync)?\b/,
    severity: "warning",
    permissionType: "filesystem",
  },
  {
    category: "File system access",
    description: "Operations that read, write, or modify files on disk",
    pattern: /\brm\s+-rf?\b/,
    severity: "critical",
    permissionType: "filesystem",
  },
  {
    category: "File system access",
    description: "Operations that read, write, or modify files on disk",
    pattern: /\bchmod\b/,
    severity: "warning",
    permissionType: "filesystem",
  },

  // Credentials / Secrets
  {
    category: "Embedded credentials",
    description: "Hardcoded secrets, API keys, tokens, or passwords",
    pattern: /\b(?:API_KEY|SECRET_KEY|ACCESS_TOKEN|PRIVATE_KEY)\s*[=:]/,
    severity: "critical",
  },
  {
    category: "Embedded credentials",
    description: "Hardcoded secrets, API keys, tokens, or passwords",
    pattern: /\bPASSWORD\s*[=:]/,
    severity: "critical",
  },
  {
    category: "Embedded credentials",
    description: "Hardcoded secrets, API keys, tokens, or passwords",
    pattern: /(?:sk|pk)[-_](?:live|test)[-_][a-zA-Z0-9]{20,}/,
    severity: "critical",
  },

  // Environment Access
  {
    category: "Environment variable access",
    description:
      "Reading environment variables which may contain secrets or configuration",
    pattern: /\bprocess\.env\b/,
    severity: "info",
    permissionType: "environment",
  },
  {
    category: "Environment variable access",
    description:
      "Reading environment variables which may contain secrets or configuration",
    pattern: /\bBun\.env\b/,
    severity: "info",
    permissionType: "environment",
  },

  // Obfuscation
  {
    category: "Obfuscation patterns",
    description:
      "Base64 encoding, hex strings, or other obfuscation techniques",
    pattern: /\batob\s*\(/,
    severity: "warning",
  },
  {
    category: "Obfuscation patterns",
    description:
      "Base64 encoding, hex strings, or other obfuscation techniques",
    pattern: /\bBuffer\.from\s*\([^,]+,\s*['"]base64['"]\)/,
    severity: "warning",
  },
  {
    category: "Obfuscation patterns",
    description:
      "Base64 encoding, hex strings, or other obfuscation techniques",
    pattern: /\\x[0-9a-fA-F]{2}(?:\\x[0-9a-fA-F]{2}){5,}/,
    severity: "warning",
  },
];

// ─── Source Analysis ─────────────────────────────────────────────────────────

export async function analyzeSource(
  owner: string,
  repo: string,
): Promise<SourceAnalysis> {
  const result: SourceAnalysis = {
    owner,
    repo,
    profileUrl: `https://github.com/${owner}`,
    reposUrl: `https://github.com/${owner}?tab=repositories`,
    isOrganization: null,
    publicRepos: null,
    accountAge: null,
    fetchError: null,
  };

  try {
    const response = await fetch(`https://api.github.com/users/${owner}`, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "agent-skill-manager",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      result.fetchError = `GitHub API returned ${response.status}`;
      return result;
    }

    const data = (await response.json()) as Record<string, unknown>;
    result.isOrganization = data.type === "Organization";
    result.publicRepos =
      typeof data.public_repos === "number" ? data.public_repos : null;

    if (typeof data.created_at === "string") {
      const created = new Date(data.created_at);
      const now = new Date();
      const years = Math.floor(
        (now.getTime() - created.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
      );
      const months = Math.floor(
        ((now.getTime() - created.getTime()) % (365.25 * 24 * 60 * 60 * 1000)) /
          (30.44 * 24 * 60 * 60 * 1000),
      );
      result.accountAge = years > 0 ? `${years}y ${months}m` : `${months}m`;
    }

    debug(
      `security-audit: source analysis for ${owner} -> repos=${result.publicRepos}, org=${result.isOrganization}, age=${result.accountAge}`,
    );
  } catch (err: any) {
    result.fetchError = err.message || "Failed to fetch GitHub profile";
    debug(`security-audit: source analysis failed -> ${result.fetchError}`);
  }

  return result;
}

// ─── Code Scanning ───────────────────────────────────────────────────────────

export function scanCode(files: FileContent[]): CodeScanCategory[] {
  const categoryMap = new Map<
    string,
    { description: string; matches: CodeScanMatch[] }
  >();

  for (const { relPath, content } of files) {
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      for (const pattern of SCAN_PATTERNS) {
        if (pattern.pattern.test(line)) {
          const key = pattern.category;
          if (!categoryMap.has(key)) {
            categoryMap.set(key, {
              description: pattern.description,
              matches: [],
            });
          }
          const match =
            trimmed.length > 120 ? trimmed.slice(0, 120) + "..." : trimmed;
          categoryMap.get(key)!.matches.push({
            file: relPath,
            line: i + 1,
            match,
            severity: pattern.severity,
          });
        }
      }
    }
  }

  const categories: CodeScanCategory[] = [];
  for (const [category, data] of categoryMap) {
    categories.push({
      category,
      description: data.description,
      matches: data.matches,
    });
  }

  // Sort: critical categories first
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  categories.sort((a, b) => {
    const aMax = Math.min(...a.matches.map((m) => severityOrder[m.severity]));
    const bMax = Math.min(...b.matches.map((m) => severityOrder[m.severity]));
    return aMax - bMax;
  });

  return categories;
}

// ─── Permission Analysis ─────────────────────────────────────────────────────

export function analyzePermissions(
  scanResults: CodeScanCategory[],
): PermissionRequest[] {
  const permMap = new Map<
    PermissionRequest["type"],
    { evidence: PermissionRequest["evidence"]; categories: Set<string> }
  >();

  for (const category of scanResults) {
    for (const match of category.matches) {
      // Find which pattern matched to get permission type
      for (const pattern of SCAN_PATTERNS) {
        if (
          pattern.permissionType &&
          pattern.category === category.category &&
          pattern.pattern.test(match.match)
        ) {
          const type = pattern.permissionType;
          if (!permMap.has(type)) {
            permMap.set(type, { evidence: [], categories: new Set() });
          }
          const entry = permMap.get(type)!;
          entry.evidence.push({
            file: match.file,
            line: match.line,
            match: match.match,
          });
          entry.categories.add(category.category);
          break;
        }
      }
    }
  }

  const PERMISSION_REASONS: Record<PermissionRequest["type"], string> = {
    filesystem:
      "Skill reads, writes, or modifies files on disk. Verify it only accesses intended paths.",
    shell:
      "Skill executes shell commands or spawns processes. This allows arbitrary system access.",
    network:
      "Skill makes network requests or downloads external content. Data may be sent to remote servers.",
    "code-execution":
      "Skill dynamically constructs and executes code. This can bypass static analysis.",
    environment:
      "Skill reads environment variables, which may contain secrets or API keys.",
  };

  const permissions: PermissionRequest[] = [];
  for (const [type, data] of permMap) {
    permissions.push({
      type,
      evidence: data.evidence,
      reason: PERMISSION_REASONS[type],
    });
  }

  // Sort by risk: shell and code-execution first
  const typeOrder: Record<string, number> = {
    shell: 0,
    "code-execution": 1,
    network: 2,
    filesystem: 3,
    environment: 4,
  };
  permissions.sort(
    (a, b) => (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99),
  );

  return permissions;
}

// ─── Verdict Calculation ─────────────────────────────────────────────────────

export function calculateVerdict(
  scanResults: CodeScanCategory[],
  permissions: PermissionRequest[],
  source: SourceAnalysis | null,
): { verdict: SecurityVerdict; reason: string } {
  let criticalCount = 0;
  let warningCount = 0;

  for (const cat of scanResults) {
    for (const match of cat.matches) {
      if (match.severity === "critical") criticalCount++;
      if (match.severity === "warning") warningCount++;
    }
  }

  const hasShell = permissions.some((p) => p.type === "shell");
  const hasCodeExec = permissions.some((p) => p.type === "code-execution");
  const hasNetwork = permissions.some((p) => p.type === "network");

  // Dangerous: shell + network (potential data exfiltration)
  if (hasShell && hasNetwork) {
    return {
      verdict: "dangerous",
      reason:
        "Skill has both shell execution and network access -- potential data exfiltration risk.",
    };
  }

  // Dangerous: code execution + network
  if (hasCodeExec && hasNetwork) {
    return {
      verdict: "dangerous",
      reason:
        "Skill has dynamic code execution and network access -- potential remote code execution risk.",
    };
  }

  // Dangerous: many critical findings
  if (criticalCount >= 10) {
    return {
      verdict: "dangerous",
      reason: `${criticalCount} critical findings detected. High concentration of risky patterns.`,
    };
  }

  // Warning: shell or code execution
  if (hasShell || hasCodeExec) {
    return {
      verdict: "warning",
      reason: hasShell
        ? "Skill executes shell commands. Review commands carefully before installing."
        : "Skill uses dynamic code execution. Review usage carefully.",
    };
  }

  // Warning: critical findings exist
  if (criticalCount > 0) {
    return {
      verdict: "warning",
      reason: `${criticalCount} critical finding${criticalCount > 1 ? "s" : ""} detected. Manual review recommended.`,
    };
  }

  // Caution: warnings exist
  if (warningCount > 0) {
    return {
      verdict: "caution",
      reason: `${warningCount} warning${warningCount > 1 ? "s" : ""} found. Generally acceptable but worth reviewing.`,
    };
  }

  // New/unknown source may lower confidence
  if (source && source.publicRepos !== null && source.publicRepos < 3) {
    return {
      verdict: "caution",
      reason:
        "No code issues found, but the author has very few public repositories.",
    };
  }

  return {
    verdict: "safe",
    reason: "No suspicious patterns detected.",
  };
}

// ─── Main Audit Function ────────────────────────────────────────────────────

export async function auditSkillSecurity(
  skillPath: string,
  skillName: string,
  sourceOwner?: string,
  sourceRepo?: string,
): Promise<SecurityAuditReport> {
  debug(`security-audit: scanning ${skillPath}`);

  // Read all files
  const files = await readFilesRecursive(skillPath);
  const totalLines = files.reduce((sum, f) => sum + f.lineCount, 0);

  // Source analysis (if GitHub source available)
  let source: SourceAnalysis | null = null;
  if (sourceOwner && sourceRepo) {
    source = await analyzeSource(sourceOwner, sourceRepo);
  }

  // Code scanning
  const codeScans = scanCode(files);

  // Permission analysis
  const permissions = analyzePermissions(codeScans);

  // Verdict
  const { verdict, reason } = calculateVerdict(codeScans, permissions, source);

  return {
    scannedAt: new Date().toISOString(),
    skillName,
    skillPath,
    source,
    codeScans,
    permissions,
    totalFiles: files.length,
    totalLines,
    verdict,
    verdictReason: reason,
  };
}

// ─── Report Formatting ──────────────────────────────────────────────────────

// Alias for brevity in formatting functions
const color = ansi;

function verdictBadge(verdict: SecurityVerdict): string {
  switch (verdict) {
    case "safe":
      return color.bgGreen(" SAFE ");
    case "caution":
      return color.bgCyan(" CAUTION ");
    case "warning":
      return color.bgYellow(" WARNING ");
    case "dangerous":
      return color.bgRed(" DANGEROUS ");
  }
}

function severityIcon(severity: "critical" | "warning" | "info"): string {
  switch (severity) {
    case "critical":
      return color.red("!!");
    case "warning":
      return color.yellow("!");
    case "info":
      return color.dim("i");
  }
}

export function formatSecurityReport(report: SecurityAuditReport): string {
  const lines: string[] = [];

  // Header
  lines.push("");
  lines.push(
    `  ${color.bold("Security Audit:")} ${report.skillName}  ${verdictBadge(report.verdict)}`,
  );
  lines.push(color.dim("  " + "─".repeat(50)));
  lines.push("");

  // Summary
  lines.push(
    `  ${color.bold("Scanned:")} ${report.totalFiles} files, ${report.totalLines} lines`,
  );
  lines.push(`  ${color.bold("Verdict:")} ${report.verdictReason}`);
  lines.push("");

  // Source Analysis
  if (report.source) {
    const src = report.source;
    lines.push(color.bold("  1. Source Analysis"));
    lines.push(color.dim("  " + "─".repeat(40)));

    if (src.fetchError) {
      lines.push(
        `     ${color.yellow("!")} Could not fetch profile: ${src.fetchError}`,
      );
    } else {
      lines.push(
        `     Author:       ${src.owner} ${src.isOrganization ? color.cyan("(organization)") : color.dim("(user)")}`,
      );
      lines.push(`     Profile:      ${src.profileUrl}`);
      if (src.publicRepos !== null) {
        const repoCount = src.publicRepos;
        const repoLabel =
          repoCount < 3
            ? color.yellow(`${repoCount} repos`)
            : repoCount < 10
              ? color.cyan(`${repoCount} repos`)
              : color.green(`${repoCount} repos`);
        lines.push(`     Public repos: ${repoLabel}`);
      }
      if (src.accountAge) {
        lines.push(`     Account age:  ${src.accountAge}`);
      }
    }
    lines.push("");
  }

  // Code Scan Results
  const sectionNum = report.source ? 2 : 1;
  lines.push(color.bold(`  ${sectionNum}. Code Scan Results`));
  lines.push(color.dim("  " + "─".repeat(40)));

  if (report.codeScans.length === 0) {
    lines.push(`     ${color.green("No suspicious patterns found.")}`);
  } else {
    for (const category of report.codeScans) {
      const critCount = category.matches.filter(
        (m) => m.severity === "critical",
      ).length;
      const warnCount = category.matches.filter(
        (m) => m.severity === "warning",
      ).length;
      const infoCount = category.matches.filter(
        (m) => m.severity === "info",
      ).length;

      const counts: string[] = [];
      if (critCount > 0) counts.push(color.red(`${critCount} critical`));
      if (warnCount > 0) counts.push(color.yellow(`${warnCount} warning`));
      if (infoCount > 0) counts.push(color.dim(`${infoCount} info`));

      lines.push(
        `\n     ${color.bold(`[${category.category}]`)} (${counts.join(", ")})`,
      );
      lines.push(`     ${color.dim(category.description)}`);

      // Show up to 5 matches per category
      const toShow = category.matches.slice(0, 5);
      for (const match of toShow) {
        lines.push(
          `       ${severityIcon(match.severity)} ${color.dim(match.file)}:${match.line} -- ${match.match}`,
        );
      }
      if (category.matches.length > 5) {
        lines.push(
          `       ${color.dim(`... and ${category.matches.length - 5} more`)}`,
        );
      }
    }
  }
  lines.push("");

  // Permissions
  const permNum = sectionNum + 1;
  lines.push(color.bold(`  ${permNum}. Permission Analysis`));
  lines.push(color.dim("  " + "─".repeat(40)));

  if (report.permissions.length === 0) {
    lines.push(`     ${color.green("No special permissions required.")}`);
  } else {
    for (const perm of report.permissions) {
      const typeLabel =
        perm.type === "code-execution"
          ? "Code Execution"
          : perm.type.charAt(0).toUpperCase() + perm.type.slice(1);

      const icon =
        perm.type === "shell" || perm.type === "code-execution"
          ? color.red("!!")
          : perm.type === "network"
            ? color.yellow("!")
            : color.dim("i");

      lines.push(`\n     ${icon} ${color.bold(typeLabel)}`);
      lines.push(`       ${perm.reason}`);
      lines.push(
        `       ${color.dim(`${perm.evidence.length} occurrence${perm.evidence.length > 1 ? "s" : ""}`)}`,
      );

      // Show up to 3 evidence items
      for (const ev of perm.evidence.slice(0, 3)) {
        lines.push(`         ${color.dim(ev.file)}:${ev.line}`);
      }
      if (perm.evidence.length > 3) {
        lines.push(
          `         ${color.dim(`... and ${perm.evidence.length - 3} more`)}`,
        );
      }
    }
  }

  lines.push("");
  lines.push(color.dim("  " + "─".repeat(50)));
  lines.push(
    `  ${color.bold("Scanned at:")} ${new Date(report.scannedAt).toLocaleString()}`,
  );
  lines.push("");

  return lines.join("\n");
}

export function formatSecurityReportJSON(report: SecurityAuditReport): string {
  return JSON.stringify(report, null, 2);
}
