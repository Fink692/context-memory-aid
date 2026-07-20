import { describe, expect, it } from "vitest";
import { eventEndsAt, eventHasEnded } from "./event-lifecycle";

describe("event lifecycle", () => {
  it("uses the saved end when one exists", () => {
    const event = {
      startsAt: "2026-07-17T14:00:00.000Z",
      endsAt: "2026-07-17T16:00:00.000Z",
    };
    expect(eventEndsAt(event)).toBe(new Date(event.endsAt).getTime());
    expect(eventHasEnded(event, new Date("2026-07-17T17:00:00.000Z"))).toBe(true);
  });

  it("does not treat a just-started event without an end as finished", () => {
    const event = { startsAt: "2026-07-17T14:00:00.000Z" };
    expect(eventHasEnded(event, new Date("2026-07-17T15:00:00.000Z"))).toBe(false);
    expect(eventHasEnded(event, new Date("2026-07-18T03:00:00.000Z"))).toBe(true);
  });
});
