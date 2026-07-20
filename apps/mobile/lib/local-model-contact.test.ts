import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({ os: "ios" }));
const nativeModel = vi.hoisted(() => ({
  generateOnDevice: vi.fn(),
  getOnDeviceModelStatus: vi.fn(),
}));

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return runtime.os;
    },
  },
}));

vi.mock("./native-local-model", () => nativeModel);

import { createModelContactDraft } from "./local-model";

describe("on-device contact extraction", () => {
  beforeEach(() => {
    runtime.os = "ios";
    nativeModel.generateOnDevice.mockReset();
    nativeModel.generateOnDevice.mockResolvedValue({
      text: JSON.stringify({
        displayName: "Jordan Patel",
        company: "Acme",
        email: "jordan@example.com",
        phone: "+1 204 555 0102",
        metAt: "Superstore",
        socialLinks: [{ platform: "Instagram", handle: "@jordan" }],
      }),
      model: "Gemma 4 E2B IT",
      backend: "Metal",
    });
  });

  it("sends the bounded transcript only to the native Gemma runtime", async () => {
    const result = await createModelContactDraft("I met Jordan Patel at Superstore. Jordan works at Acme.");

    expect(nativeModel.generateOnDevice).toHaveBeenCalledOnce();
    const [systemPrompt, prompt] = nativeModel.generateOnDevice.mock.calls[0] as [string, string];
    expect(systemPrompt).toContain("running entirely on the user's iPhone");
    expect(prompt).toContain("I met Jordan Patel at Superstore");
    expect(result).toEqual({
      model: "Gemma 4 E2B IT (Metal)",
      draft: {
        displayName: "Jordan Patel",
        company: "Acme",
        email: "jordan@example.com",
        phone: "+1 204 555 0102",
        metAt: "Superstore",
        socialLinks: [{ platform: "Instagram", handle: "@jordan" }],
      },
    });
  });

  it("rejects oversized input before native inference", async () => {
    await expect(createModelContactDraft("x".repeat(4_001))).rejects.toThrow();
    expect(nativeModel.generateOnDevice).not.toHaveBeenCalled();
  });

  it("does not fall back to a network service outside the native iPhone app", async () => {
    runtime.os = "web";
    await expect(createModelContactDraft("Jordan from the grocery store"))
      .rejects.toThrow(/iPhone app/);
    expect(nativeModel.generateOnDevice).not.toHaveBeenCalled();
  });
});
