import { describe, expect, it } from "vitest";
import { normalizeConversationStarters } from "./conversation-starters";

describe("conversation starter review", () => {
  it("keeps edited starters while removing empty and duplicate suggestions", () => {
    expect(normalizeConversationStarters([
      "  Ask about the new role  ",
      "",
      "Ask   about   the   new   role",
      "How did the move go?",
    ])).toEqual([
      "Ask about the new role",
      "How did the move go?",
    ]);
  });

  it("enforces the persisted contact limits before a reviewed draft is saved", () => {
    const normalized = normalizeConversationStarters([
      "A".repeat(200),
      ...Array.from({ length: 10 }, (_, index) => `Starter ${index + 1}`),
    ]);
    expect(normalized).toHaveLength(8);
    expect(normalized[0]).toHaveLength(160);
  });
});
