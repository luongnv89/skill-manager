export function parseFrontmatter(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split("\n");

  let inFrontmatter = false;
  let foundFirst = false;
  let currentKey: string | null = null;
  let currentValue: string[] = [];
  let multilineMode: "none" | "literal" | "folded" = "none";
  let baseIndent = -1;
  let parentKey: string | null = null;

  function flushKey() {
    if (currentKey) {
      const joined = currentValue.join(" ").trim();
      if (joined) result[currentKey] = joined;
      currentKey = null;
      currentValue = [];
      multilineMode = "none";
      baseIndent = -1;
    }
  }

  for (const line of lines) {
    if (line.trim() === "---") {
      if (!foundFirst) {
        foundFirst = true;
        inFrontmatter = true;
        continue;
      } else {
        flushKey();
        break;
      }
    }

    if (!inFrontmatter) continue;

    // Check if this is a continuation line (indented) for a multiline value
    if (multilineMode !== "none" && currentKey) {
      const stripped = line.replace(/^\s*/, "");
      const indent = line.length - stripped.length;

      // Continuation line: must be indented more than the key
      if (indent > 0 && stripped.length > 0) {
        if (baseIndent === -1) baseIndent = indent;
        currentValue.push(stripped);
        continue;
      } else if (stripped.length === 0) {
        // Blank line inside multiline — skip it
        continue;
      } else {
        // Not indented — end of multiline, fall through to parse as new key
        flushKey();
      }
    }

    // Handle nested sub-keys under a parent (one-level nesting with dot notation)
    if (parentKey !== null) {
      const subMatch = line.match(/^\s+(\w[\w-]*):\s*(.*?)\s*$/);
      if (subMatch) {
        const subKey = subMatch[1];
        const rawSubValue = subMatch[2];
        const cleaned = rawSubValue.replace(/^["']|["']$/g, "");
        if (cleaned) result[`${parentKey}.${subKey}`] = cleaned;
        continue;
      }
      // Non-indented or blank line — end of nested block
      if (line.trim().length > 0) {
        parentKey = null;
        // Fall through to parse as top-level key
      } else {
        continue;
      }
    }

    // Try to match a key: value line
    const match = line.match(/^(\w[\w-]*):\s*(.*?)\s*$/);
    if (match) {
      flushKey();
      const key = match[1];
      const rawValue = match[2];

      if (rawValue === "|" || rawValue === ">") {
        // Multiline block scalar
        currentKey = key;
        currentValue = [];
        multilineMode = rawValue === "|" ? "literal" : "folded";
      } else if (
        rawValue === "|+" ||
        rawValue === ">+" ||
        rawValue === "|-" ||
        rawValue === ">-"
      ) {
        currentKey = key;
        currentValue = [];
        multilineMode = rawValue.startsWith("|") ? "literal" : "folded";
      } else {
        // Single-line value — strip surrounding quotes
        const cleaned = rawValue.replace(/^["']|["']$/g, "");
        if (cleaned) {
          result[key] = cleaned;
        } else {
          // Empty value — treat as parent key for potential nested block
          parentKey = key;
        }
      }
    }
  }

  flushKey();
  return result;
}

export function resolveVersion(fm: Record<string, string>): string {
  return fm["metadata.version"] || fm.version || "0.0.0";
}
