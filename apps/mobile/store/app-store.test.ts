import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

import type { Contact, Event, Memory } from "@context/shared";
import { ExportBundleSchema, seededContacts, seededEvents } from "@context/shared";
import { useAppStore } from "./app-store";

const event: Event = {
  id: "event-test",
  name: "Test event",
  startsAt: "2026-07-10T18:00:00.000Z",
  attendeeContactIds: [],
};

function contactWithTimeline(timeline: Memory[] = []): Contact {
  return {
    id: "contact-memory-boundary",
    displayName: "Memory Boundary",
    conversationTopics: [],
    recognitionEnabled: false,
    timeline,
  };
}

function memoryWithSummary(id: string, summary: string): Memory {
  return {
    id,
    contactId: "contact-memory-boundary",
    summary,
    tags: [],
    nextSteps: [],
    source: "text",
    occurredAt: "2026-07-10T12:00:00.000Z",
    createdAt: "2026-07-10T12:00:00.000Z",
  };
}

function expectExportSchemaRoundTrip(): void {
  const exported = useAppStore.getState().exportBundle();
  const serialized = JSON.stringify(exported);
  expect(ExportBundleSchema.parse(JSON.parse(serialized))).toEqual(exported);
}

beforeEach(() => {
  useAppStore.setState({
    hydrated: true,
    hydrationError: null,
    hasSeenOnboarding: false,
    hasSeenContactImportPrompt: false,
    appLockEnabled: false,
    localToolsEnabled: false,
    updateWatchUsed: false,
    currentEventId: "",
    contacts: [],
    events: [],
    systemContactLinks: {},
  });
});

describe("workspace lifecycle", () => {
  it("migrates the former AI preference into local smart tools", async () => {
    const migrate = useAppStore.persist.getOptions().migrate;
    expect(migrate).toBeTypeOf("function");
    const migrated = await migrate?.({ aiEnabled: true }, 0) as {
      aiEnabled?: boolean;
      localToolsEnabled?: boolean;
      hasSeenContactImportPrompt?: boolean;
      systemContactLinks?: Record<string, string>;
    };
    expect(migrated.localToolsEnabled).toBe(true);
    expect(migrated.aiEnabled).toBeUndefined();
    expect(migrated.hasSeenContactImportPrompt).toBe(false);
    expect(migrated.systemContactLinks).toEqual({});
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

  it("persists the App Lock preference and clears it with all local data", () => {
    useAppStore.getState().setAppLockEnabled(true);
    useAppStore.getState().setHasSeenContactImportPrompt(true);
    expect(useAppStore.getState().appLockEnabled).toBe(true);
    expect(useAppStore.getState().hasSeenContactImportPrompt).toBe(true);

    useAppStore.getState().deleteAllData();
    expect(useAppStore.getState().appLockEnabled).toBe(false);
    expect(useAppStore.getState().hasSeenContactImportPrompt).toBe(false);
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

  it("can save a person globally without adding them to the active event", () => {
    useAppStore.getState().addEvent(event);
    const contact: Contact = {
      id: "contact-global",
      displayName: "Morgan Lee",
      conversationTopics: [],
      recognitionEnabled: false,
      timeline: [],
    };

    useAppStore.getState().addContact(contact, null);

    expect(useAppStore.getState().contacts).toContainEqual(contact);
    expect(useAppStore.getState().events[0]?.attendeeContactIds).toEqual([]);
  });

  it("deduplicates repeated exact people in one import", () => {
    useAppStore.getState().addEvent(event);
    const result = useAppStore.getState().importContacts([
      { displayName: "Taylor Reed", company: "Northstar" },
      { displayName: "  taylor reed  ", company: " northstar " },
    ]);

    expect(result).toEqual({ added: 1, linked: 0, skipped: 1 });
    expect(useAppStore.getState().contacts).toHaveLength(1);
    expect(useAppStore.getState().events[0]?.attendeeContactIds).toHaveLength(1);
  });

  it("links an existing exact person to the active event", () => {
    const contact: Contact = {
      id: "contact-taylor",
      displayName: "Taylor Reed",
      company: "Northstar",
      conversationTopics: [],
      recognitionEnabled: false,
      timeline: [],
    };
    useAppStore.setState({ contacts: [contact] });
    useAppStore.getState().addEvent(event);

    const result = useAppStore.getState().importContacts([
      { displayName: " taylor reed ", company: "NORTHSTAR", role: "Product lead" },
    ]);

    expect(result).toEqual({ added: 0, linked: 1, skipped: 0 });
    expect(useAppStore.getState().contacts).toEqual([{ ...contact, role: "Product lead" }]);
    expect(useAppStore.getState().events[0]?.attendeeContactIds).toEqual([contact.id]);
  });

  it("allows same-name people at different companies", () => {
    useAppStore.getState().addEvent(event);

    const result = useAppStore.getState().importContacts([
      { displayName: "Taylor Reed", company: "Northstar" },
      { displayName: "Taylor Reed", company: "Contoso" },
    ]);

    expect(result).toEqual({ added: 2, linked: 0, skipped: 0 });
    expect(useAppStore.getState().contacts.map((contact) => contact.company)).toEqual([
      "Northstar",
      "Contoso",
    ]);
    expect(useAppStore.getState().events[0]?.attendeeContactIds).toHaveLength(2);
  });

  it("imports selected system contacts globally without requiring an event", () => {
    const result = useAppStore.getState().importContacts([
      { sourceId: "system-contact:ios:one", displayName: "Avery Chen", company: "Northstar" },
      { sourceId: "system-contact:ios:two", displayName: "Morgan Lee" },
    ], null);

    expect(result).toEqual({ added: 2, linked: 0, skipped: 0 });
    expect(useAppStore.getState().contacts).toHaveLength(2);
    expect(useAppStore.getState().events).toEqual([]);
    expect(Object.keys(useAppStore.getState().systemContactLinks)).toHaveLength(2);
  });

  it("stores rich imported profiles and preserves them in a backup", () => {
    const result = useAppStore.getState().importContacts([{
      sourceId: "system-contact:ios:rich-profile",
      displayName: "Avery Chen",
      company: "Northstar",
      role: "Designer",
      email: "avery@example.com",
      phone: "+1 204 555 0188",
      photoUri: "file:///app/photos/avery.jpg",
      relationshipContext: "Neighbour I run into at the grocery store.",
      socialLinks: [{
        platform: "LinkedIn",
        handle: "avery-chen",
        url: "https://linkedin.com/in/avery-chen",
      }],
    }], null);

    expect(result).toEqual({ added: 1, linked: 0, skipped: 0 });
    expect(useAppStore.getState().contacts[0]).toMatchObject({
      email: "avery@example.com",
      phone: "+1 204 555 0188",
      photoUri: "file:///app/photos/avery.jpg",
      relationshipContext: "Neighbour I run into at the grocery store.",
      socialLinks: [{ platform: "LinkedIn", handle: "avery-chen" }],
    });
    expectExportSchemaRoundTrip();
  });

  it("fills missing imported details without overwriting curated profile fields", () => {
    const manual: Contact = {
      id: "manual-morgan",
      displayName: "Morgan Lee",
      email: "curated@example.com",
      conversationTopics: [],
      recognitionEnabled: false,
      timeline: [],
    };
    useAppStore.setState({ contacts: [manual] });

    useAppStore.getState().importContacts([{
      sourceId: "system-contact:ios:morgan",
      displayName: "Morgan Lee",
      email: "device@example.com",
      phone: "+12045550199",
      relationshipContext: "Friend from the community garden.",
      socialLinks: [{ platform: "Instagram", handle: "morgan.grows" }],
    }], null);

    expect(useAppStore.getState().contacts[0]).toMatchObject({
      email: "curated@example.com",
      phone: "+12045550199",
      relationshipContext: "Friend from the community garden.",
      socialLinks: [{ platform: "Instagram", handle: "morgan.grows" }],
    });
  });

  it("links an import only to the explicitly requested event", () => {
    const otherEvent: Event = { ...event, id: "event-other", name: "Other event" };
    useAppStore.setState({ events: [event, otherEvent], currentEventId: event.id });

    const result = useAppStore.getState().importContacts([
      { sourceId: "system-contact:ios:one", displayName: "Avery Chen" },
    ], otherEvent.id);

    expect(result).toEqual({ added: 1, linked: 0, skipped: 0 });
    expect(useAppStore.getState().events[0]?.attendeeContactIds).toEqual([]);
    expect(useAppStore.getState().events[1]?.attendeeContactIds).toHaveLength(1);
  });

  it("does not mutate data for an invalid explicit event", () => {
    useAppStore.getState().addEvent(event);
    const before = useAppStore.getState();
    const result = before.importContacts([
      { sourceId: "system-contact:ios:one", displayName: "Avery Chen" },
    ], "missing-event");

    expect(result).toEqual({ added: 0, linked: 0, skipped: 1 });
    expect(useAppStore.getState().contacts).toEqual(before.contacts);
    expect(useAppStore.getState().systemContactLinks).toEqual({});
  });

  it("uses system identifiers for repeat-safe imports even after a name changes", () => {
    useAppStore.getState().importContacts([
      { sourceId: "system-contact:ios:one", displayName: "Avery Chen", company: "Northstar" },
    ], null);
    const firstId = useAppStore.getState().contacts[0]?.id;

    const result = useAppStore.getState().importContacts([
      { sourceId: "system-contact:ios:one", displayName: "Avery Chen-Smith", company: "Northstar" },
    ], null);

    expect(result).toEqual({ added: 0, linked: 0, skipped: 1 });
    expect(useAppStore.getState().contacts).toHaveLength(1);
    expect(useAppStore.getState().contacts[0]?.id).toBe(firstId);
    expect(useAppStore.getState().contacts[0]?.displayName).toBe("Avery Chen");
  });

  it("preserves distinct same-name system contacts", () => {
    const result = useAppStore.getState().importContacts([
      { sourceId: "system-contact:ios:one", displayName: "Jordan Smith" },
      { sourceId: "system-contact:ios:two", displayName: "Jordan Smith" },
    ], null);

    expect(result).toEqual({ added: 2, linked: 0, skipped: 0 });
    expect(useAppStore.getState().contacts).toHaveLength(2);
  });

  it("links a manual exact match without overwriting curated fields", () => {
    const manual: Contact = {
      id: "manual-avery",
      displayName: "Avery Chen",
      company: "Northstar",
      role: "Curated role",
      conversationTopics: [],
      recognitionEnabled: false,
      timeline: [],
    };
    useAppStore.setState({ contacts: [manual] });

    const result = useAppStore.getState().importContacts([
      { sourceId: "system-contact:ios:one", displayName: "Avery Chen", company: "Northstar", role: "Phone role" },
    ], null);

    expect(result).toEqual({ added: 0, linked: 0, skipped: 1 });
    expect(useAppStore.getState().contacts).toEqual([manual]);
    expect(useAppStore.getState().systemContactLinks).toEqual({ "system-contact:ios:one": manual.id });
  });

  it("removes system links when their local person is deleted", () => {
    useAppStore.getState().importContacts([
      { sourceId: "system-contact:ios:one", displayName: "Avery Chen" },
    ], null);
    const contactId = useAppStore.getState().contacts[0]!.id;

    useAppStore.getState().deleteContact(contactId);

    expect(useAppStore.getState().systemContactLinks).toEqual({});
  });

  it("keeps device contact identifiers out of portable exports", () => {
    useAppStore.getState().importContacts([
      { sourceId: "system-contact:ios:one", displayName: "Avery Chen" },
    ], null);

    const exported = useAppStore.getState().exportBundle();
    const serialized = JSON.stringify(exported);
    expect(serialized).not.toContain("system-contact:ios:one");
    expect(serialized).not.toContain("systemContactLinks");
  });

  it("adds and removes existing people from any event without deleting them", () => {
    const secondEvent: Event = { ...event, id: "event-second", name: "Second event" };
    const contact: Contact = {
      id: "contact-taylor",
      displayName: "Taylor Reed",
      conversationTopics: [],
      recognitionEnabled: false,
      timeline: [],
    };
    useAppStore.setState({ contacts: [contact], events: [event, secondEvent] });

    useAppStore.getState().addContactToEvent(contact.id, secondEvent.id);
    useAppStore.getState().addContactToEvent(contact.id, secondEvent.id);
    expect(useAppStore.getState().events[1]?.attendeeContactIds).toEqual([contact.id]);

    useAppStore.getState().removeContactFromEvent(contact.id, secondEvent.id);
    expect(useAppStore.getState().events[1]?.attendeeContactIds).toEqual([]);
    expect(useAppStore.getState().contacts).toEqual([contact]);
  });

  it("keeps people reachable after their event is deleted", () => {
    const contact: Contact = {
      id: "contact-taylor",
      displayName: "Taylor Reed",
      conversationTopics: [],
      recognitionEnabled: false,
      timeline: [],
    };
    useAppStore.setState({ contacts: [contact], events: [{ ...event, attendeeContactIds: [contact.id] }], currentEventId: event.id });

    useAppStore.getState().deleteEvent(event.id);

    expect(useAppStore.getState().events).toEqual([]);
    expect(useAppStore.getState().contacts).toEqual([contact]);
  });

  it("allows saved events without forcing one onto Today", () => {
    useAppStore.setState({ events: [event], currentEventId: event.id });

    useAppStore.getState().setCurrentEventId("");

    expect(useAppStore.getState().currentEventId).toBe("");
    expect(useAppStore.getState().events).toEqual([event]);
    useAppStore.getState().setCurrentEventId("missing-event");
    expect(useAppStore.getState().currentEventId).toBe("");
  });

  it.each([240, 241, 500, 501, 1_000])(
    "normalizes a %i-character memory at every persistence boundary",
    (length) => {
      useAppStore.setState({ contacts: [contactWithTimeline()] });
      const summary = "M".repeat(length);

      useAppStore.getState().addMemory(memoryWithSummary(`memory-length-${length}`, summary));

      const stored = useAppStore.getState().contacts[0];
      expect(stored?.timeline).toHaveLength(1);
      expect(stored?.timeline[0]?.summary).toBe("M".repeat(Math.min(length, 500)));
      expect(stored?.lastDiscussed).toBe("M".repeat(Math.min(length, 240)));
      expectExportSchemaRoundTrip();
    },
  );

  it.each([240, 241, 500, 501, 1_000])(
    "normalizes a %i-character imported note before creating a contact memory",
    (length) => {
      const notes = "I".repeat(length);

      const result = useAppStore.getState().importContacts([{
        sourceId: `system-contact:ios:note-${length}`,
        displayName: `Imported Note ${length}`,
        notes,
      }], null);

      expect(result).toEqual({ added: 1, linked: 0, skipped: 0 });
      const stored = useAppStore.getState().contacts[0];
      expect(stored?.timeline).toHaveLength(1);
      expect(stored?.timeline[0]?.summary).toBe("I".repeat(Math.min(length, 500)));
      expect(stored?.lastDiscussed).toBe("I".repeat(Math.min(length, 240)));
      expectExportSchemaRoundTrip();
    },
  );

  it("keeps the 500th memory and bounds the timeline when a 501st memory is added", () => {
    const existing = Array.from({ length: 499 }, (_, index) =>
      memoryWithSummary(`memory-existing-${index}`, `Existing memory ${index}`));
    useAppStore.setState({ contacts: [contactWithTimeline(existing)] });

    useAppStore.getState().addMemory(memoryWithSummary("memory-500", "Five hundred"));
    expect(useAppStore.getState().contacts[0]?.timeline).toHaveLength(500);
    expect(useAppStore.getState().contacts[0]?.timeline[0]?.id).toBe("memory-500");
    expectExportSchemaRoundTrip();

    useAppStore.getState().addMemory(memoryWithSummary("memory-501", "Five hundred and one"));
    const timeline = useAppStore.getState().contacts[0]?.timeline ?? [];
    expect(timeline).toHaveLength(500);
    expect(timeline[0]?.id).toBe("memory-501");
    expect(timeline.some((memory) => memory.id === "memory-500")).toBe(true);
    expect(timeline.some((memory) => memory.id === "memory-existing-498")).toBe(false);
    expectExportSchemaRoundTrip();
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
    useAppStore.getState().addMemory(memory);
    expect(useAppStore.getState().contacts[0]?.recentUpdate).toBe("Promoted to product lead");
    expect(useAppStore.getState().contacts[0]?.timeline).toEqual([memory]);
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
