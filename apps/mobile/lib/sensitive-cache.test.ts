import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  deleteAsync: vi.fn(),
  readDirectoryAsync: vi.fn(),
}));

import { isSensitiveCacheEntry } from "./sensitive-cache";

describe("sensitive cache cleanup", () => {
  it("targets only Context import, restore, export, and DocumentPicker cache entries", () => {
    expect(isSensitiveCacheEntry("DocumentPicker")).toBe(true);
    expect(isSensitiveCacheEntry("context-backup-123.json")).toBe(true);
    expect(isSensitiveCacheEntry("context-photo-restore-123.jpg")).toBe(true);
    expect(isSensitiveCacheEntry("context-import-123.csv")).toBe(true);
    expect(isSensitiveCacheEntry("context-share-123.vcf")).toBe(true);
    expect(isSensitiveCacheEntry("image-cache")).toBe(false);
    expect(isSensitiveCacheEntry("unrelated-context-backup-123.json")).toBe(false);
  });
});
