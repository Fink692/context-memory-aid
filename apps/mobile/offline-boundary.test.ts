import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("offline runtime boundary", () => {
  it("contains no remote URL or general-purpose network request in mobile source", () => {
    const source = ["app", "lib", "store"]
      .flatMap((directory) => sourceFiles(resolve(process.cwd(), directory)))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(source).not.toMatch(/https?:\/\//i);
    expect(source).not.toContain("EXPO_PUBLIC_API_URL");

    // Browser document pickers expose selected local files as blob URLs. That
    // platform read is the only permitted fetch call in the mobile source.
    const withoutLocalDocumentReads = source.replaceAll("fetch(asset.uri)", "LOCAL_DOCUMENT_READ");
    expect(withoutLocalDocumentReads).not.toMatch(/\bfetch\s*\(/);
  });

  it("ships without the former API client", () => {
    expect(existsSync(resolve(process.cwd(), "lib", "api.ts"))).toBe(false);
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(packageJson.dependencies).not.toHaveProperty("expo-audio");
    expect(packageJson.dependencies).not.toHaveProperty("@tanstack/react-query");
  });
});
