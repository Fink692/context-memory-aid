import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  os: "ios",
  nativeModules: {
    ContextPDFTextExtractor: { extractText: vi.fn() },
  } as Record<string, { extractText: ReturnType<typeof vi.fn> } | undefined>,
}));

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return runtime.os;
    },
  },
  NativeModules: runtime.nativeModules,
}));

import {
  extractTextFromPDF,
  isPDFTextExtractionAvailable,
} from "./native-pdf-text";

describe("native PDF text boundary", () => {
  beforeEach(() => {
    runtime.os = "ios";
    runtime.nativeModules.ContextPDFTextExtractor = { extractText: vi.fn() };
  });

  it("accepts a bounded native extraction result", async () => {
    runtime.nativeModules.ContextPDFTextExtractor!.extractText.mockResolvedValue({
      text: "Jordan Patel\nAcme",
      pageCount: 2,
      processedPages: 2,
      characterCount: 18,
      truncated: false,
    });

    await expect(extractTextFromPDF("file:///private/roster.pdf")).resolves.toEqual({
      text: "Jordan Patel\nAcme",
      pageCount: 2,
      processedPages: 2,
      characterCount: 18,
      truncated: false,
    });
    expect(isPDFTextExtractionAvailable()).toBe(true);
  });

  it("rejects missing native support and inconsistent bridge results", async () => {
    runtime.nativeModules.ContextPDFTextExtractor!.extractText.mockResolvedValue({
      text: "Jordan",
      pageCount: 1,
      processedPages: 2,
      characterCount: 6,
      truncated: false,
    });
    await expect(extractTextFromPDF("file:///private/roster.pdf")).rejects.toThrow(/inconsistent page counts/);

    runtime.nativeModules.ContextPDFTextExtractor = undefined;
    await expect(extractTextFromPDF("file:///private/roster.pdf")).rejects.toThrow(/does not include private PDF import/);
  });

  it("never offers native PDF extraction outside iOS", async () => {
    runtime.os = "web";
    expect(isPDFTextExtractionAvailable()).toBe(false);
    await expect(extractTextFromPDF("file:///private/roster.pdf")).rejects.toThrow(/native iPhone app/);
  });

  it("ships a local-only, bounded PDFKit module through its own plugin", () => {
    const nativeSource = readFileSync(resolve(process.cwd(), "native", "ContextPDFTextExtractor.swift"), "utf8");
    const plugin = readFileSync(resolve(process.cwd(), "plugins", "with-context-pdf-import.js"), "utf8");
    const appConfig = readFileSync(resolve(process.cwd(), "app.json"), "utf8");

    expect(nativeSource).toContain("import PDFKit");
    expect(nativeSource).toContain("20 * 1_024 * 1_024");
    expect(nativeSource).toContain("maximumPDFPages = 100");
    expect(nativeSource).toContain("maximumPDFTextCharacters = 18_000");
    expect(nativeSource).toContain("sourceURL.isFileURL");
    expect(nativeSource).not.toMatch(/URLSession|dataTask|downloadTask|uploadTask/);
    expect(plugin).toContain("ContextPDFTextExtractor.swift");
    expect(plugin).toContain("ContextPDFTextExtractorBridge.m");
    expect(plugin).toContain("PDFKit.framework");
    expect(appConfig).toContain('"./plugins/with-context-pdf-import"');
  });
});
