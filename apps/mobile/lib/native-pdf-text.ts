import { NativeModules, Platform } from "react-native";

export const MAX_PDF_FILE_BYTES = 20 * 1_024 * 1_024;
export const MAX_PDF_PAGES = 100;
export const MAX_PDF_TEXT_CHARACTERS = 18_000;

export interface PDFTextExtractionResult {
  text: string;
  pageCount: number;
  processedPages: number;
  characterCount: number;
  truncated: boolean;
}

interface NativePDFTextExtractorModule {
  extractText(uri: string): Promise<unknown>;
}

function nativeModule(): NativePDFTextExtractorModule {
  if (Platform.OS !== "ios") {
    throw new Error("Private PDF roster import is currently available only in the native iPhone app.");
  }
  const module = NativeModules.ContextPDFTextExtractor as NativePDFTextExtractorModule | undefined;
  if (!module) {
    throw new Error("This app build does not include private PDF import. Rebuild the native iOS app.");
  }
  return module;
}

function boundedInteger(value: unknown, label: string, maximum?: number): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (maximum !== undefined && (value as number) > maximum)) {
    throw new Error(`The native PDF reader returned an invalid ${label}.`);
  }
  return value as number;
}

function parseExtractionResult(value: unknown): PDFTextExtractionResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The native PDF reader returned an invalid result.");
  }
  const result = value as Record<string, unknown>;
  if (typeof result.text !== "string" || !result.text.trim()) {
    throw new Error("Context could not find selectable text in that PDF.");
  }
  if (typeof result.truncated !== "boolean") {
    throw new Error("The native PDF reader returned an invalid truncation state.");
  }
  const pageCount = boundedInteger(result.pageCount, "page count");
  const processedPages = boundedInteger(result.processedPages, "processed page count", MAX_PDF_PAGES);
  const characterCount = boundedInteger(result.characterCount, "character count", MAX_PDF_TEXT_CHARACTERS);
  if (processedPages > pageCount) {
    throw new Error("The native PDF reader returned inconsistent page counts.");
  }
  return {
    text: result.text,
    pageCount,
    processedPages,
    characterCount,
    truncated: result.truncated,
  };
}

export function isPDFTextExtractionAvailable(): boolean {
  return Platform.OS === "ios" && Boolean(NativeModules.ContextPDFTextExtractor);
}

export async function extractTextFromPDF(uri: string): Promise<PDFTextExtractionResult> {
  if (!uri.trim()) throw new Error("Choose a PDF from Files first.");
  return parseExtractionResult(await nativeModule().extractText(uri));
}
