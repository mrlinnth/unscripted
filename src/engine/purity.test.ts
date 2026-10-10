import { describe, expect, it } from "vitest";

// Guard for ai/CONSTRAINTS.md: the engine stays independent of the UI and
// deterministic. Sources are loaded as raw text, so no @types/node is needed.
const sources = import.meta.glob<string>(["./**/*.ts", "!./**/*.test.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
});

const forbidden: { name: string; pattern: RegExp }[] = [
  { name: "import from react", pattern: /from\s+["']react(-dom)?(\/[^"']*)?["']/ },
  { name: "import from @mantine/", pattern: /from\s+["']@mantine\// },
  { name: "import from @tauri-apps/", pattern: /from\s+["']@tauri-apps\// },
  { name: "Math.random", pattern: /Math\.random/ },
  { name: "Date.now", pattern: /Date\.now/ },
  { name: "new Date(", pattern: /new\s+Date\s*\(/ },
  { name: "setTimeout", pattern: /\bsetTimeout\b/ },
  { name: "setInterval", pattern: /\bsetInterval\b/ },
];

describe("engine purity", () => {
  it("finds engine source files", () => {
    expect(Object.keys(sources)).toContain("./index.ts");
  });

  it("has no UI imports, randomness, wall-clock time, or timers", () => {
    const violations: string[] = [];
    for (const [file, text] of Object.entries(sources)) {
      for (const { name, pattern } of forbidden) {
        if (pattern.test(text)) {
          violations.push(`${file}: ${name}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
