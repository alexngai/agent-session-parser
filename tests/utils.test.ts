import { describe, it, expect } from "vitest";
import { stripIDEContextTags, deduplicateStrings } from "../src/utils.js";

describe("stripIDEContextTags", () => {
  it("strips ide_opened_file tags", () => {
    const text = "<ide_opened_file>file.go</ide_opened_file>Hello, world!";
    expect(stripIDEContextTags(text)).toBe("Hello, world!");
  });

  it("strips ide_selection tags", () => {
    const text =
      '<ide_selection>const x = 1;</ide_selection>Fix this code please';
    expect(stripIDEContextTags(text)).toBe("Fix this code please");
  });

  it("strips system-reminder tags", () => {
    const text =
      "<system-reminder>Remember to be helpful</system-reminder>Actual prompt";
    expect(stripIDEContextTags(text)).toBe("Actual prompt");
  });

  it("strips local-command-caveat tags", () => {
    const text =
      "<local-command-caveat>caveat</local-command-caveat>Real content";
    expect(stripIDEContextTags(text)).toBe("Real content");
  });

  it("strips multiple tag types", () => {
    const text =
      "<ide_opened_file>f.ts</ide_opened_file><system-reminder>r</system-reminder>Clean text";
    expect(stripIDEContextTags(text)).toBe("Clean text");
  });

  it("handles multiline tag content", () => {
    const text = `<ide_opened_file>
file1.ts
file2.ts
</ide_opened_file>Hello`;
    expect(stripIDEContextTags(text)).toBe("Hello");
  });

  it("returns original text when no tags present", () => {
    expect(stripIDEContextTags("Hello world")).toBe("Hello world");
  });

  it("trims whitespace", () => {
    expect(stripIDEContextTags("  Hello  ")).toBe("Hello");
  });
});

describe("deduplicateStrings", () => {
  it("removes duplicates preserving order", () => {
    expect(deduplicateStrings(["a", "b", "a", "c", "b"])).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("handles empty array", () => {
    expect(deduplicateStrings([])).toEqual([]);
  });

  it("handles no duplicates", () => {
    expect(deduplicateStrings(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });
});
