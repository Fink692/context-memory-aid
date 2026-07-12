import { describe, expect, it } from "vitest";
import type { Event } from "@context/shared";
import { activeEventForContact } from "./contact-event-context";

const events: Event[] = [{
  id: "event-one",
  name: "Event One",
  startsAt: "2026-07-11T00:00:00.000Z",
  attendeeContactIds: ["alex"],
}];

describe("contact event context", () => {
  it("returns the active event only for an attendee", () => {
    expect(activeEventForContact(events, "event-one", "alex")?.id).toBe("event-one");
    expect(activeEventForContact(events, "event-one", "sam")).toBeUndefined();
  });

  it("omits inactive and missing event context", () => {
    expect(activeEventForContact(events, "another-event", "alex")).toBeUndefined();
    expect(activeEventForContact(events, "event-one", undefined)).toBeUndefined();
  });
});
