import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

import type { Contact, Event, Memory } from "@context/shared";
import { seededContacts, seededEvents } from "@context/shared";
import { useAppStore } from "./app-store";

const event: Event = {
  id: "event-test",
  name: "Test event",
  startsAt: "2026-07-10T18:00:00.000Z",
  attendeeContactIds: [],
};

beforeEach(() => {
  useAppStore.setState({
    hydrated: true,
    hydrationError: null,
    hasSeenOnboarding: false,
    localToolsEnabled: false,
    updateWatchUsed: false,
    currentEventId: "",
    contacts: [],
    events: [],
  });
});

describe("workspace lifecycle", () => {
  it("migrates the former AI preference into local smart tools", async () => {
    const migrate = useAppStore.persist.getOptions().migrate;
    expect(migrate).toBeTypeOf("function");
    const migrated = await migrate?.({ aiEnabled: true }, 0) as {
      aiEnabled?: boolean;
      localToolsEnabled?: boolean;
    };
    expect(migrated.localToolsEnabled).toBe(true);
    expect(migrated.aiEnabled).toBeUndefined();
  });

  it("starts empty unless the user chooses the sample workspace", () => {
    useAppStore.getState().completeOnboarding(false, false);
    expect(useAppStore.getState().contacts).toEqual([]);

    useAppStore.setState({ hasSeenOnboarding: false });
    useAppStore.getState().completeOnboarding(true, true);
    expect(useAppStore.getState().contacts).toHaveLength(seededContacts.length);
    expect(useAppStore.getState().events).toHaveLength(seededEvents.length);
    expect(useAppStore.getState().localToolsEnabled).toBe(true);
  });

  it("adds a person to the active event", () => {
    useAppStore.getState().addEvent(event);
    const contact: Contact = {
      id: "contact-test",
      displayName: "Taylor Reed",
      conversationTopics: [],
      recognitionEnabled: false,
      timeline: [],
    };
    useAppStore.getState().addContact(contact);

    expect(useAppStore.getState().contacts).toContainEqual(contact);
    expect(useAppStore.getState().events[0]?.attendeeContactIds).toEqual([contact.id]);
  });

  it("deduplicates both existing people and repeated rows in one import", () => {
    useAppStore.getState().addEvent(event);
    const result = useAppStore.getState().importContacts([
      { displayName: "Taylor Reed", company: "Northstar" },
      { displayName: "  taylor reed  ", company: "Duplicate" },
    ]);

    expect(result).toEqual({ added: 1, skipped: 1 });
    expect(useAppStore.getState().contacts).toHaveLength(1);
    expect(useAppStore.getState().events[0]?.attendeeContactIds).toHaveLength(1);
  });

  it("recomputes derived context after deleting the newest memory", () => {
    const older: Memory = {
      id: "memory-old",
      contactId: "contact-test",
      summary: "Discussed evaluation pipelines.",
      tags: [],
      nextSteps: [],
      source: "text",
      occurredAt: "2026-01-01T12:00:00.000Z",
      createdAt: "2026-01-01T12:00:00.000Z",
    };
    const newest: Memory = {
      ...older,
      id: "memory-new",
      summary: "Started a new role.",
      occurredAt: "2026-06-01T12:00:00.000Z",
      createdAt: "2026-06-01T12:00:00.000Z",
    };
    useAppStore.setState({
      contacts: [{
        id: "contact-test",
        displayName: "Taylor Reed",
        lastSpokeAt: newest.occurredAt,
        lastDiscussed: newest.summary,
        recentUpdate: "Curated profile update",
        conversationTopics: [],
        recognitionEnabled: false,
        timeline: [newest, older],
      }],
    });

    useAppStore.getState().deleteMemory("contact-test", newest.id);
    const contact = useAppStore.getState().contacts[0];
    expect(contact?.timeline).toEqual([older]);
    expect(contact?.lastSpokeAt).toBe(older.occurredAt);
    expect(contact?.lastDiscussed).toBe(older.summary);
    expect(contact?.recentUpdate).toBe("Curated profile update");
  });

  it("does not overwrite a curated profile update when adding a memory", () => {
    useAppStore.setState({
      contacts: [{
        id: "contact-test",
        displayName: "Taylor Reed",
        recentUpdate: "Promoted to product lead",
        conversationTopics: [],
        recognitionEnabled: false,
        timeline: [],
      }],
    });
    const memory: Memory = {
      id: "memory-new",
      contactId: "contact-test",
      summary: "Discussed hiring plans.",
      tags: [],
      nextSteps: [],
      source: "text",
      occurredAt: "2026-06-01T12:00:00.000Z",
      createdAt: "2026-06-01T12:00:00.000Z",
    };

    useAppStore.getState().addMemory(memory);
    expect(useAppStore.getState().contacts[0]?.recentUpdate).toBe("Promoted to product lead");
  });

  it("adds an approved public update without pretending a conversation occurred", () => {
    useAppStore.setState({
      contacts: [{
        id: "contact-test",
        displayName: "Taylor Reed",
        lastSpokeAt: "2026-01-01T12:00:00.000Z",
        lastDiscussed: "Talked about evaluation pipelines.",
        conversationTopics: [],
        recognitionEnabled: false,
        timeline: [],
      }],
    });
    const update: Memory = {
      id: "public-update-1",
      contactId: "contact-test",
      summary: "Taylor joined Northstar.",
      tags: ["public-update"],
      nextSteps: [],
      source: "public-update",
      occurredAt: "2026-07-01T12:00:00.000Z",
      createdAt: "2026-07-10T12:00:00.000Z",
    };

    useAppStore.getState().addMemory(update);
    const contact = useAppStore.getState().contacts[0];
    expect(contact?.timeline).toEqual([update]);
    expect(contact?.lastSpokeAt).toBe("2026-01-01T12:00:00.000Z");
    expect(contact?.lastDiscussed).toBe("Talked about evaluation pipelines.");
  });
});
