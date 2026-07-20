import { describe, expect, it } from "vitest";
import type { Contact } from "@context/shared";
import { eventAssistantRefresher, sortEventAssistantContacts } from "./event-assistant";

function contact(overrides: Partial<Contact> & Pick<Contact, "id" | "displayName">): Contact {
  return {
    conversationTopics: [],
    recognitionEnabled: false,
    timeline: [],
    ...overrides,
  };
}

describe("event assistant refreshers", () => {
  it("keeps the most useful saved context and only one topic", () => {
    expect(eventAssistantRefresher(contact({
      id: "alex",
      displayName: "Alex",
      recentUpdate: "  Starting a new role  ",
      lastDiscussed: "The accessibility launch",
      conversationTopics: ["", "Their first week", "A second topic"],
    }))).toEqual({
      recentUpdate: "Starting a new role",
      lastDiscussed: "The accessibility launch",
      topic: "Their first week",
    });
  });

  it("prioritizes richer refreshers, then people not spoken with recently", () => {
    const sorted = sortEventAssistantContacts([
      contact({ id: "new", displayName: "New", recentUpdate: "New job", lastSpokeAt: "2026-07-15T00:00:00.000Z" }),
      contact({ id: "old", displayName: "Old", recentUpdate: "New city", lastSpokeAt: "2025-01-01T00:00:00.000Z" }),
      contact({ id: "plain", displayName: "Plain", lastSpokeAt: "2024-01-01T00:00:00.000Z" }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual(["old", "new", "plain"]);
  });
});
