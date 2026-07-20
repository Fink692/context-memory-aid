import { describe, expect, it } from "vitest";
import { displayEventSchedule } from "./date";

const formatOptions = { locale: "en-CA", timeZone: "UTC" } as const;

describe("displayEventSchedule", () => {
  it("shows a start date and time when no end is saved", () => {
    expect(displayEventSchedule({
      startsAt: "2026-07-17T14:00:00.000Z",
    }, formatOptions)).toBe("Jul 17, 2026 · 2:00 p.m.");
  });

  it("shows a compact same-day time range", () => {
    expect(displayEventSchedule({
      startsAt: "2026-07-17T14:00:00.000Z",
      endsAt: "2026-07-17T16:30:00.000Z",
    }, formatOptions)).toBe("Jul 17, 2026 · 2:00 p.m.–4:30 p.m.");
  });

  it("shows both dates and times when an event crosses days", () => {
    expect(displayEventSchedule({
      startsAt: "2026-07-17T23:00:00.000Z",
      endsAt: "2026-07-18T02:00:00.000Z",
    }, formatOptions)).toBe("Jul 17, 2026 · 11:00 p.m. – Jul 18, 2026 · 2:00 a.m.");
  });
});
