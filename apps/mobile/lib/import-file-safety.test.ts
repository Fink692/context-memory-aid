import { describe, expect, it } from "vitest";
import {
  ImportFileSafetyError,
  assertImportFileSize,
  pickerSizeNeedsStat,
  utf8ByteLength,
} from "./import-file-safety";

const options = {
  maximumBytes: 1_000_000,
  tooLargeMessage: "CSV must be smaller than 1 MB.",
  unverifiableMessage: "Context could not verify this CSV’s size.",
};

describe("import file size boundary", () => {
  it("accepts a valid picker-reported size without needing a stat", () => {
    expect(pickerSizeNeedsStat(54_000)).toBe(false);
    expect(assertImportFileSize({ ...options, reportedSize: 54_000 })).toBe(54_000);
  });

  it("uses a local stat when the picker omitted size", () => {
    expect(pickerSizeNeedsStat(undefined)).toBe(true);
    expect(assertImportFileSize({
      ...options,
      reportedSize: undefined,
      stat: { exists: true, isDirectory: false, size: 87_000 },
    })).toBe(87_000);
  });

  it("rejects an oversized stat before a caller reads the file", () => {
    expect(() => assertImportFileSize({
      ...options,
      reportedSize: undefined,
      stat: { exists: true, isDirectory: false, size: 1_000_001 },
    })).toThrow("CSV must be smaller than 1 MB.");
  });

  it("uses the larger actual stat when provider metadata is stale", () => {
    expect(() => assertImportFileSize({
      ...options,
      reportedSize: 10,
      stat: { exists: true, isDirectory: false, size: 1_000_001 },
    })).toThrow("CSV must be smaller than 1 MB.");
  });

  it("rejects files whose size cannot be verified", () => {
    expect(() => assertImportFileSize({
      ...options,
      reportedSize: undefined,
      stat: { exists: false },
    })).toThrow(ImportFileSafetyError);
  });

  it("counts final portable-backup bytes without allocating another payload", () => {
    expect(utf8ByteLength("Context")).toBe(7);
    expect(utf8ByteLength("Maya 🧠")).toBe(9);
  });
});
