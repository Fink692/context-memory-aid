import { describe, expect, it } from "vitest";
import type { ActionItem, Memory } from "@context/shared";
import {
  editableFollowUpsForMemory,
  isoWithSelectedLocalDate,
  parseMemoryTags,
  suggestedTimelineSummary,
} from "./memory-editor";

describe("memory editor helpers", () => {
  it("keeps the full note separate while preparing a bounded timeline summary", () => {
    const note = `  ${"A".repeat(510)}\nextra detail  `;
    const summary = suggestedTimelineSummary(note);
    expect(summary).toHaveLength(500);
    expect(summary.endsWith("…")).toBe(true);
    expect(note).toContain("extra detail");
  });

  it("normalizes editable tags without duplicates", () => {
    expect(parseMemoryTags("Hiring, AI; hiring\n Winnipeg ")).toEqual(["Hiring", "AI", "Winnipeg"]);
  });

  it("uses open linked actions and does not recreate completed follow-ups", () => {
    const memory = { id: "memory-one", nextSteps: ["Legacy follow-up"] } satisfies Pick<Memory, "id" | "nextSteps">;
    const base = {
      contactId: "person-one",
      memoryId: memory.id,
      createdAt: "2026-07-17T12:00:00.000Z",
      updatedAt: "2026-07-17T12:00:00.000Z",
    };
    const actions: ActionItem[] = [
      { ...base, id: "done", title: "Already done", status: "completed", completedAt: "2026-07-17T13:00:00.000Z" },
      { ...base, id: "open", title: "Send intro", status: "open", dueAt: "2026-07-18T04:59:59.999Z" },
    ];
    expect(editableFollowUpsForMemory(memory, actions)).toEqual([{
      id: "open",
      title: "Send intro",
      dueAt: "2026-07-18T04:59:59.999Z",
    }]);
  });

  it("changes the local calendar day without changing the local time", () => {
    const original = new Date(2026, 6, 17, 14, 35, 20);
    const selected = new Date(2026, 7, 3);
    const result = new Date(isoWithSelectedLocalDate(original.toISOString(), selected));
    expect([result.getFullYear(), result.getMonth(), result.getDate()]).toEqual([2026, 7, 3]);
    expect([result.getHours(), result.getMinutes(), result.getSeconds()]).toEqual([14, 35, 20]);
  });
});
