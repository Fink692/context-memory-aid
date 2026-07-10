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
  it("permits only the loopback watcher and an explicit user-opened search", () => {
    const files = ["app", "lib", "store"]
      .flatMap((directory) => sourceFiles(resolve(process.cwd(), directory)))
      .map((path) => ({ path: path.replaceAll("\\", "/"), source: readFileSync(path, "utf8") }));
    const source = files.map((file) => file.source).join("\n");

    expect(source).not.toContain("EXPO_PUBLIC_API_URL");
    const urls = [...source.matchAll(/https?:\/\/[^\s"'`]+/gi)].map((match) => match[0]);
    expect(new Set(urls)).toEqual(new Set([
      "http://127.0.0.1:8789",
      "https://example.com/feed.xml",
      "https://www.bing.com/search?q=${encodeURIComponent(searchQuery)}",
    ]));

    const networkFiles = files.filter((file) => /\bfetch\s*\(/.test(file.source)).map((file) => file.path);
    expect(networkFiles.every((path) => path.endsWith("/app/import.tsx") || path.endsWith("/app/settings.tsx") || path.endsWith("/lib/update-watcher.ts"))).toBe(true);
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
