import { describe, expect, it } from "vitest";
import type { ActionItem } from "@context/shared";
import {
  actionDueBucket,
  dueAtForChoice,
  inferredQuickDueChoice,
  sortOpenActions,
} from "./action-schedule";

const now = new Date(2026, 6, 17, 12);

describe("action scheduling", () => {
  it("groups due dates using the device's local day", () => {
    expect(actionDueBucket(undefined, now)).toBe("undated");
    expect(actionDueBucket(new Date(2026, 6, 16, 23, 59, 59).toISOString(), now)).toBe("overdue");
    expect(actionDueBucket(new Date(2026, 6, 17, 18).toISOString(), now)).toBe("today");
    expect(actionDueBucket(new Date(2026, 6, 18, 8).toISOString(), now)).toBe("upcoming");
  });

  it("creates reversible quick due choices", () => {
    const tomorrow = dueAtForChoice("tomorrow", now);
    expect(tomorrow).toBeDefined();
    expect(inferredQuickDueChoice(tomorrow, now)).toBe("tomorrow");
    expect(dueAtForChoice("none", now)).toBeUndefined();
  });

  it("sorts open dated work before undated work and hides completed items", () => {
    const base = {
      contactId: "person-one",
      status: "open" as const,
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T12:00:00.000Z",
    };
    const actions: ActionItem[] = [
      { ...base, id: "undated", title: "Undated" },
      { ...base, id: "later", title: "Later", dueAt: "2026-07-20T12:00:00.000Z" },
      { ...base, id: "earlier", title: "Earlier", dueAt: "2026-07-18T12:00:00.000Z" },
      { ...base, id: "done", title: "Done", status: "completed", completedAt: "2026-07-11T12:00:00.000Z" },
    ];
    expect(sortOpenActions(actions).map((action) => action.id)).toEqual(["earlier", "later", "undated"]);
  });
});
