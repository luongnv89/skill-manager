import { describe, it, expect, vi } from "vitest";
import { parseSkillsFromJson } from "./tauri-commands";

describe("parseSkillsFromJson", () => {
  it("parses a JSON array of skills", () => {
    const json = JSON.stringify([
      { name: "skill1", description: "A test skill" },
      { name: "skill2", description: "Another test skill" },
    ]);
    const result = parseSkillsFromJson(json);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("skill1");
  });

  it("parses skills from object with skills array", () => {
    const json = JSON.stringify({
      skills: [
        { name: "skill1", description: "A test skill" },
        { name: "skill2" },
      ],
    });
    const result = parseSkillsFromJson(json);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("skill1");
  });

  it("returns empty array for invalid JSON", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = parseSkillsFromJson("not valid json");
    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("returns empty array for unexpected format", () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseSkillsFromJson(JSON.stringify({ foo: "bar" }));
    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
