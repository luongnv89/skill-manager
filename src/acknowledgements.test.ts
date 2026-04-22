import { fileURLToPath } from "url";
import { describe, test, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve, join, dirname } from "path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const README = join(ROOT, "README.md");
const ACK_JSON = join(ROOT, "website", "data", "acknowledgements.json");

// ─── acknowledgements.json (single source of truth) ────────────────────────

describe("acknowledgements: data file", () => {
  const data = JSON.parse(readFileSync(ACK_JSON, "utf-8"));

  test("acknowledgements.json has contributors array", () => {
    expect(Array.isArray(data.contributors)).toBe(true);
    expect(data.contributors.length).toBeGreaterThanOrEqual(1);
  });

  test("acknowledgements.json has dependencies array", () => {
    expect(Array.isArray(data.dependencies)).toBe(true);
    expect(data.dependencies.length).toBeGreaterThanOrEqual(1);
  });

  test("each contributor has login and prs", () => {
    for (const c of data.contributors) {
      expect(typeof c.login).toBe("string");
      expect(Array.isArray(c.prs)).toBe(true);
      expect(c.prs.length).toBeGreaterThanOrEqual(1);
    }
  });

  test("each dependency has name, url, and desc", () => {
    for (const d of data.dependencies) {
      expect(typeof d.name).toBe("string");
      expect(typeof d.url).toBe("string");
      expect(typeof d.desc).toBe("string");
    }
  });
});

// ─── README.md acknowledgements section ─────────────────────────────────────

describe("acknowledgements: README.md", () => {
  const readme = readFileSync(README, "utf-8");
  const data = JSON.parse(readFileSync(ACK_JSON, "utf-8"));

  test("README contains Acknowledgements heading", () => {
    expect(readme).toContain("## Acknowledgements");
  });

  test("README contains all contributor handles", () => {
    for (const c of data.contributors) {
      expect(readme).toContain(`@${c.login}`);
    }
  });

  test("README contains all dependency names", () => {
    for (const d of data.dependencies) {
      expect(readme).toContain(d.name);
    }
  });

  test("README PR count matches JSON data for each contributor", () => {
    for (const c of data.contributors) {
      const prCount = c.prs.length;
      // For contributors with more than 1 PR, the README shows "N merged PRs"
      if (prCount > 1) {
        expect(readme).toContain(`${prCount} merged PR`);
      }
    }
  });
});

// ─── website acknowledgements section ──────────────────────────────────────
// Note: The legacy `website/index.html` Acknowledgements page was retired
// as part of the React refactor (#229). The `data/acknowledgements.json`
// file remains the single source of truth and will be consumed by the
// React port of the Acknowledgements surface — see the out-of-scope
// follow-up list in the #229 PR body. The HTML-contents tests that used
// to live here are intentionally removed; parity is checked via the
// JSON + README tests above.
