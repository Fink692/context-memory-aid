import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({ os: "ios" }));
const nativeModel = vi.hoisted(() => ({ generateOnDevice: vi.fn() }));

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return runtime.os;
    },
  },
}));

vi.mock("./native-local-model", () => nativeModel);

import { createModelRosterDrafts } from "./roster-import";

describe("on-device roster extraction", () => {
  beforeEach(() => {
    runtime.os = "ios";
    nativeModel.generateOnDevice.mockReset();
    nativeModel.generateOnDevice.mockResolvedValue({
      text: JSON.stringify({ contacts: [{ displayName: "Jordan Patel", company: "Acme" }] }),
      model: "Gemma 4 E2B IT",
      backend: "Metal",
    });
  });

  it("uses one batched native Gemma request and returns only preview drafts", async () => {
    const result = await createModelRosterDrafts("Jordan Patel\nAcme");

    expect(nativeModel.generateOnDevice).toHaveBeenCalledOnce();
    const [systemPrompt, prompt] = nativeModel.generateOnDevice.mock.calls[0] as [string, string];
    expect(systemPrompt).toContain("running entirely on the user's iPhone");
    expect(prompt).toContain("Jordan Patel");
    expect(result).toMatchObject({
      contacts: [{ displayName: "Jordan Patel", company: "Acme" }],
      skipped: 0,
      received: 1,
      model: "Gemma 4 E2B IT (Metal)",
      inputTruncated: false,
    });
  });

  it("never falls back to a network model", async () => {
    runtime.os = "web";
    await expect(createModelRosterDrafts("Jordan Patel"))
      .rejects.toThrow(/iPhone app/);
    expect(nativeModel.generateOnDevice).not.toHaveBeenCalled();
  });
});
