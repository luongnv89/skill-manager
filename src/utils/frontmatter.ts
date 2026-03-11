export function parseFrontmatter(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split("\n");

  let inFrontmatter = false;
  let foundFirst = false;
  let currentKey: string | null = null;
  let currentValue: string[] = [];
  let multilineMode: "none" | "literal" | "folded" = "none";
  let baseIndent = -1;

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
        if (cleaned) result[key] = cleaned;
      }
    }
  }

  flushKey();
  return result;
}
