import { beforeEach, describe, expect, it, vi } from "vitest";

const fileMocks = vi.hoisted(() => ({
  writeAsStringAsync: vi.fn(async (
    _uri: string,
    _contents: string,
    _options?: { encoding?: string },
  ) => undefined),
  deleteAsync: vi.fn(async (_uri: string, _options?: { idempotent?: boolean }) => undefined),
}));
const sharingMocks = vi.hoisted(() => ({
  isAvailableAsync: vi.fn(async () => true),
  shareAsync: vi.fn(async (
    _uri: string,
    _options?: { UTI?: string; mimeType?: string; dialogTitle?: string },
  ) => undefined),
}));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "123e4567-e89b-42d3-a456-426614174000" }));
vi.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  EncodingType: { UTF8: "utf8" },
  ...fileMocks,
}));
vi.mock("expo-sharing", () => sharingMocks);

import { shareContactVCard } from "./contact-share-file";

describe("contact-card file sharing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sharingMocks.isAvailableAsync.mockResolvedValue(true);
    sharingMocks.shareAsync.mockResolvedValue(undefined);
  });

  it("shares a temporary public vCard and removes it afterwards", async () => {
    await shareContactVCard("BEGIN:VCARD\r\nEND:VCARD\r\n", "Maya Chen");

    const uri = fileMocks.writeAsStringAsync.mock.calls[0]?.[0];
    expect(uri).toBe("file:///cache/context-share-Maya-Chen-123e4567-e89b-42d3-a456-426614174000.vcf");
    expect(sharingMocks.shareAsync).toHaveBeenCalledWith(uri, expect.objectContaining({
      UTI: "public.vcard",
      mimeType: "text/vcard",
    }));
    expect(fileMocks.deleteAsync).toHaveBeenCalledWith(uri, { idempotent: true });
  });

  it("removes the temporary card when the share provider fails", async () => {
    sharingMocks.shareAsync.mockRejectedValueOnce(new Error("provider failed"));
    await expect(shareContactVCard("BEGIN:VCARD\r\nEND:VCARD\r\n", "Maya"))
      .rejects.toThrow("provider failed");
    expect(fileMocks.deleteAsync).toHaveBeenCalledTimes(1);
  });
});
