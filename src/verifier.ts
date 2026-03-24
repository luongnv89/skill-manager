/**
 * Skill verification logic used during the ingestion pipeline.
 *
 * A skill passes verification when it meets all of the following criteria:
 *   1. Valid frontmatter: has both `name` and `description`
 *   2. Meaningful content: SKILL.md has body text beyond just frontmatter
 *   3. No malicious patterns: none of the dangerous code patterns are found
 *   4. Proper structure: the skill directory exists and contains SKILL.md
 *
 * Skills that pass all criteria receive `verified: true` in the index.
 * Skills that fail any criterion are still indexed but with `verified: false`.
 */

import type { DiscoveredSkill } from "./utils/types";

// ─── Malicious Pattern Detection ────────────────────────────────────────────

const MALICIOUS_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "obfuscation:atob", pattern: /\batob\s*\(/ },
  {
    label: "obfuscation:base64",
    pattern: /(?:^|[=:\s])[A-Za-z0-9+/]{40,}={1,2}(?:\s|$)/m,
  },
  {
    label: "obfuscation:hex-escape",
    pattern: /\\x[0-9a-fA-F]{2}(?:\\x[0-9a-fA-F]{2}){3,}/,
  },
  {
    label: "credential-leak:api-key",
    pattern: /\bAPI_KEY\s*=\s*['"][^'"]+['"]/,
  },
  {
    label: "credential-leak:secret",
    pattern: /\bSECRET_KEY\s*=\s*['"][^'"]+['"]/,
  },
  {
    label: "credential-leak:password",
    pattern: /\bPASSWORD\s*=\s*['"][^'"]+['"]/,
  },
];

// ─── Verification Result ────────────────────────────────────────────────────

export interface VerificationResult {
  verified: boolean;
  reasons: string[];
}

// ─── Verify a single skill ──────────────────────────────────────────────────

/**
 * Evaluate a discovered skill against verification criteria.
 *
 * @param skill  The discovered skill metadata (from frontmatter parsing)
 * @param skillMdContent  The raw SKILL.md file content (frontmatter + body)
 * @returns  `{ verified, reasons }` — reasons lists any failed criteria
 */
export function verifySkill(
  skill: DiscoveredSkill,
  skillMdContent: string,
): VerificationResult {
  const reasons: string[] = [];

  // ── Criterion 1: frontmatter has name + description ──
  if (!skill.name || !skill.name.trim()) {
    reasons.push("missing frontmatter field: name");
  }
  if (!skill.description || !skill.description.trim()) {
    reasons.push("missing frontmatter field: description");
  }

  // ── Criterion 2: meaningful body content beyond frontmatter ──
  const body = extractBody(skillMdContent);
  if (body.trim().length < 20) {
    reasons.push(
      "SKILL.md body too short (less than 20 chars of instructions)",
    );
  }

  // ── Criterion 3: no malicious patterns in SKILL.md ──
  for (const { label, pattern } of MALICIOUS_PATTERNS) {
    if (pattern.test(skillMdContent)) {
      reasons.push(`malicious pattern detected: ${label}`);
    }
  }

  return {
    verified: reasons.length === 0,
    reasons,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Strip YAML frontmatter (delimited by `---`) and return the remaining body.
 */
function extractBody(content: string): string {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) return trimmed;

  const endIdx = trimmed.indexOf("\n---", 3);
  if (endIdx === -1) return "";

  return trimmed.slice(endIdx + 4);
}
