import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  ActionItem,
  ConnectionSuggestionDecision,
  Contact,
  ContactEntityRelationship,
  Event,
  KnowledgeEntity,
  Memory,
} from "@context/shared";
import {
  EventSchema,
  ExportBundleSchema,
  MAX_EVENT_ATTENDEES,
  MAX_WORKSPACE_ACTIONS,
  MAX_WORKSPACE_CONTACTS,
  MAX_WORKSPACE_EVENTS,
  seededContacts,
  seededEvents,
} from "@context/shared";
import { hydrateAppStore, useAppStore } from "./app-store";

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

function deferredWrite(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.mocked(AsyncStorage.getItem).mockReset().mockResolvedValue(null);
  vi.mocked(AsyncStorage.setItem).mockReset().mockResolvedValue(undefined);
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
    actions: [],
    entities: [],
    relationships: [],
    connectionDecisions: [],
    systemContactLinks: {},
  });
});

describe("workspace lifecycle", () => {
  it.each([
    ["storage read", new Error("storage unavailable")],
    ["stored JSON", "{not valid JSON"],
  ])("does not overwrite the workspace when %s hydration fails", async (_case, failure) => {
    useAppStore.setState({ hydrated: false, hydrationError: null });
    vi.mocked(AsyncStorage.setItem).mockClear();
    if (failure instanceof Error) {
      vi.mocked(AsyncStorage.getItem).mockRejectedValueOnce(failure);
    } else {
      vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(failure);
    }

    await hydrateAppStore();

    expect(useAppStore.getState()).toMatchObject({
      hydrated: true,
      hydrationError: "Your saved workspace could not be opened. You can start again without changing any backup file you created.",
    });
    expect(useAppStore.persist.hasHydrated()).toBe(false);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it("can retry a failed hydration without having overwritten the saved workspace", async () => {
    const savedContact = contactWithTimeline();
    savedContact.displayName = "Still Saved";
    const persistedWorkspace = {
      state: {
        hasSeenOnboarding: true,
        hasSeenContactImportPrompt: false,
        appLockEnabled: false,
        localToolsEnabled: false,
        updateWatchUsed: false,
        currentEventId: "",
        contacts: [savedContact],
        events: [],
        actions: [],
        entities: [],
        relationships: [],
        connectionDecisions: [],
        systemContactLinks: {},
      },
      version: 3,
    };
    useAppStore.setState({ hydrated: false, hydrationError: null });
    vi.mocked(AsyncStorage.setItem).mockClear();
    vi.mocked(AsyncStorage.getItem)
      .mockRejectedValueOnce(new Error("temporary storage read failure"))
      .mockResolvedValueOnce(JSON.stringify(persistedWorkspace));

    await hydrateAppStore();
    expect(useAppStore.getState().hydrationError).not.toBeNull();
    await hydrateAppStore();

    expect(useAppStore.getState()).toMatchObject({
      hydrated: true,
      hydrationError: null,
      contacts: [{ id: savedContact.id, displayName: "Still Saved" }],
    });
    expect(useAppStore.persist.hasHydrated()).toBe(true);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it("does not persist an invalid legacy migration before workspace validation", async () => {
    const invalidLegacyWorkspace = {
      state: {
        hasSeenOnboarding: true,
        hasSeenContactImportPrompt: false,
        appLockEnabled: false,
        localToolsEnabled: false,
        updateWatchUsed: false,
        currentEventId: "event-invalid-legacy",
        contacts: [],
        events: [{
          id: "event-invalid-legacy",
          name: "Invalid legacy event",
          startsAt: "not-an-iso-date",
          attendeeContactIds: [],
        }],
        systemContactLinks: {},
      },
      version: 2,
    };
    useAppStore.setState({ hydrated: false, hydrationError: null });
    vi.mocked(AsyncStorage.setItem).mockClear();
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(JSON.stringify(invalidLegacyWorkspace));

    await hydrateAppStore();

    expect(useAppStore.getState().hydrationError).toBe(
      "Your saved workspace could not be opened. You can start again without changing any backup file you created.",
    );
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it("does not downgrade or overwrite a workspace from a newer app version", async () => {
    const futureWorkspace = {
      state: {
        hasSeenOnboarding: true,
        hasSeenContactImportPrompt: false,
        appLockEnabled: true,
        localToolsEnabled: false,
        updateWatchUsed: false,
        currentEventId: "",
        contacts: [],
        events: [],
        actions: [],
        entities: [],
        relationships: [],
        connectionDecisions: [],
        systemContactLinks: {},
        futurePrivateData: { mustRemainUntouched: true },
      },
      version: 4,
    };
    useAppStore.setState({ hydrated: false, hydrationError: null });
    vi.mocked(AsyncStorage.setItem).mockClear();
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(JSON.stringify(futureWorkspace));

    await hydrateAppStore();

    expect(useAppStore.getState().hydrationError).toBe(
      "Your saved workspace could not be opened. You can start again without changing any backup file you created.",
    );
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it("persists a valid legacy migration only after workspace validation succeeds", async () => {
    const savedContact = contactWithTimeline();
    savedContact.displayName = "Migrated Safely";
    const validLegacyWorkspace = {
      state: {
        hasSeenOnboarding: true,
        hasSeenContactImportPrompt: false,
        appLockEnabled: true,
        localToolsEnabled: false,
        updateWatchUsed: false,
        currentEventId: "",
        contacts: [savedContact],
        events: [],
        systemContactLinks: {},
      },
      version: 2,
    };
    useAppStore.setState({ hydrated: false, hydrationError: null });
    vi.mocked(AsyncStorage.setItem).mockClear();
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(JSON.stringify(validLegacyWorkspace));

    await hydrateAppStore();

    expect(useAppStore.getState()).toMatchObject({
      hydrated: true,
      hydrationError: null,
      appLockEnabled: true,
      contacts: [{ id: savedContact.id, displayName: "Migrated Safely" }],
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
    const persisted = JSON.parse(vi.mocked(AsyncStorage.setItem).mock.calls[0]?.[1] ?? "null") as {
      version?: number;
      state?: { contacts?: Contact[]; actions?: ActionItem[] };
    };
    expect(persisted.version).toBe(3);
    expect(persisted.state?.contacts).toEqual([savedContact]);
    expect(persisted.state?.actions).toEqual([]);
  });

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

  it("starts empty unless the user chooses the sample workspace", async () => {
    await useAppStore.getState().completeOnboarding(false, false);
    expect(useAppStore.getState().contacts).toEqual([]);

    useAppStore.setState({ hasSeenOnboarding: false });
    await useAppStore.getState().completeOnboarding(true, true);
    expect(useAppStore.getState().contacts).toHaveLength(seededContacts.length);
    expect(useAppStore.getState().events).toHaveLength(seededEvents.length);
    expect(useAppStore.getState().localToolsEnabled).toBe(true);
  });

  it("persists the App Lock preference and clears it with all local data", async () => {
    await useAppStore.getState().setAppLockEnabled(true);
    useAppStore.getState().setHasSeenContactImportPrompt(true);
    expect(useAppStore.getState().appLockEnabled).toBe(true);
    expect(useAppStore.getState().hasSeenContactImportPrompt).toBe(true);

    await useAppStore.getState().deleteAllData();
    expect(useAppStore.getState().appLockEnabled).toBe(false);
    expect(useAppStore.getState().hasSeenContactImportPrompt).toBe(false);
  });

  it.each([true, false])(
    "rolls the App Lock preference back when saving %s rejects",
    async (nextValue) => {
      useAppStore.setState({ appLockEnabled: !nextValue });
      vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("storage unavailable"));

      await expect(useAppStore.getState().setAppLockEnabled(nextValue)).rejects.toThrow("storage unavailable");

      expect(useAppStore.getState().appLockEnabled).toBe(!nextValue);
    },
  );

  it("adds a person to the active event", async () => {
    await useAppStore.getState().addEvent(event);
    const contact: Contact = {
      id: "contact-test",
      displayName: "Taylor Reed",
      conversationTopics: [],
      recognitionEnabled: false,
      timeline: [],
    };
    await useAppStore.getState().addContact(contact);

    expect(useAppStore.getState().contacts).toContainEqual(contact);
    expect(useAppStore.getState().events[0]?.attendeeContactIds).toEqual([contact.id]);
  });

  it("can save a person globally without adding them to the active event", async () => {
    await useAppStore.getState().addEvent(event);
    const contact: Contact = {
      id: "contact-global",
      displayName: "Morgan Lee",
      conversationTopics: [],
      recognitionEnabled: false,
      timeline: [],
    };

    await useAppStore.getState().addContact(contact, null);

    expect(useAppStore.getState().contacts).toContainEqual(contact);
    expect(useAppStore.getState().events[0]?.attendeeContactIds).toEqual([]);
  });

  it("rolls a profile update back when durable storage rejects it", async () => {
    const contact: Contact = {
      id: "contact-durable-update",
      displayName: "Before Save",
      conversationTopics: [],
      recognitionEnabled: false,
      timeline: [],
    };
    useAppStore.setState({ contacts: [contact] });
    vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(useAppStore.getState().updateContact(contact.id, {
      displayName: "After Save",
    })).rejects.toThrow("storage unavailable");

    expect(useAppStore.getState().contacts).toEqual([contact]);
  });

  it("rolls a person deletion back when durable storage rejects it", async () => {
    const contact: Contact = {
      id: "contact-durable-delete",
      displayName: "Keep Me",
      conversationTopics: [],
      recognitionEnabled: false,
      timeline: [],
    };
    useAppStore.setState({ contacts: [contact] });
    vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(useAppStore.getState().deleteContact(contact.id)).rejects.toThrow("storage unavailable");

    expect(useAppStore.getState().contacts).toEqual([contact]);
  });

  it("rolls an imported person back when durable storage rejects it", async () => {
    vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(useAppStore.getState().importContacts([{
      sourceId: "system-contact:ios:durability",
      displayName: "Keep Out Until Saved",
    }], null)).rejects.toThrow("storage unavailable");

    expect(useAppStore.getState().contacts).toEqual([]);
    expect(useAppStore.getState().systemContactLinks).toEqual({});
  });

  it("merges an import from the workspace committed by a preceding durable mutation", async () => {
    const existing: Contact = {
      id: "contact-before-import-queue",
      displayName: "Before Queued Update",
      conversationTopics: [],
      recognitionEnabled: false,
      timeline: [],
    };
    useAppStore.setState({ contacts: [existing] });
    vi.mocked(AsyncStorage.setItem).mockClear();
    const firstWrite = deferredWrite();
    vi.mocked(AsyncStorage.setItem).mockImplementationOnce(() => firstWrite.promise);

    const updatePromise = useAppStore.getState().updateContact(existing.id, {
      displayName: "After Queued Update",
    });
    const importPromise = useAppStore.getState().importContacts([{
      sourceId: "system-contact:ios:queued-import",
      displayName: "Queued Import",
    }], null);

    await vi.waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));
    firstWrite.resolve();
    await updatePromise;
    const summary = await importPromise;

    expect(summary).toEqual({ added: 1, linked: 0, skipped: 0 });
    expect(useAppStore.getState().contacts.map((contact) => contact.displayName)).toEqual([
      "After Queued Update",
      "Queued Import",
    ]);
  });

  it("computes rapid repeated imports in durable queue order", async () => {
    vi.mocked(AsyncStorage.setItem).mockClear();
    const firstWrite = deferredWrite();
    vi.mocked(AsyncStorage.setItem).mockImplementationOnce(() => firstWrite.promise);
    const incoming = [{
      sourceId: "system-contact:ios:rapid-repeat",
      displayName: "Rapid Repeat",
    }];

    const firstImport = useAppStore.getState().importContacts(incoming, null);
    const repeatedImport = useAppStore.getState().importContacts(incoming, null);

    await vi.waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));
    firstWrite.resolve();
    const [firstSummary, repeatedSummary] = await Promise.all([firstImport, repeatedImport]);

    expect(firstSummary).toEqual({ added: 1, linked: 0, skipped: 0 });
    expect(repeatedSummary).toEqual({ added: 0, linked: 0, skipped: 1 });
    expect(useAppStore.getState().contacts).toHaveLength(1);
    expect(useAppStore.getState().systemContactLinks).toEqual({
      "system-contact:ios:rapid-repeat": useAppStore.getState().contacts[0]?.id,
    });
  });

  it("does not select an event that a preceding queued mutation deleted", async () => {
    useAppStore.setState({ events: [event], currentEventId: event.id });
    vi.mocked(AsyncStorage.setItem).mockClear();
    const deletionWrite = deferredWrite();
    vi.mocked(AsyncStorage.setItem).mockImplementationOnce(() => deletionWrite.promise);

    const deletion = useAppStore.getState().deleteEvent(event.id);
    const staleSelection = useAppStore.getState().setCurrentEventId(event.id);

    await vi.waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1));
    deletionWrite.resolve();
    await Promise.all([deletion, staleSelection]);

    expect(useAppStore.getState().events).toEqual([]);
    expect(useAppStore.getState().currentEventId).toBe("");
  });

  it("rolls event, memory, and follow-up changes back when durable storage rejects them", async () => {
    const contact = contactWithTimeline();
    const memory = memoryWithSummary("memory-durable", "Keep this memory");
    useAppStore.setState({ contacts: [contact], events: [event], currentEventId: event.id });

    vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("event storage unavailable"));
    await expect(useAppStore.getState().updateEvent(event.id, { name: "Unsaved event name" }))
      .rejects.toThrow("event storage unavailable");
    expect(useAppStore.getState().events).toEqual([event]);

    vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("memory storage unavailable"));
    await expect(useAppStore.getState().addMemory(memory, [{ title: "Unsaved follow-up" }]))
      .rejects.toThrow("memory storage unavailable");
    expect(useAppStore.getState().contacts[0]?.timeline).toEqual([]);
    expect(useAppStore.getState().actions).toEqual([]);

    const action: ActionItem = {
      id: "action-durable",
      contactId: contact.id,
      title: "Keep this follow-up out",
      status: "open",
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T12:00:00.000Z",
    };
    vi.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error("action storage unavailable"));
    await expect(useAppStore.getState().addAction(action)).rejects.toThrow("action storage unavailable");
    expect(useAppStore.getState().actions).toEqual([]);
  });

  it("rejects invalid conversation starters instead of corrupting persisted contacts", async () => {
    const contact = { ...contactWithTimeline(), conversationTopics: ["A safe starter"] };
    useAppStore.setState({ contacts: [contact] });

    await useAppStore.getState().setConversationTopics(contact.id, ["X".repeat(161)]);

    expect(useAppStore.getState().contacts[0]?.conversationTopics).toEqual(["A safe starter"]);
    expectExportSchemaRoundTrip();
  });

  it("deduplicates repeated exact people in one import", async () => {
    await useAppStore.getState().addEvent(event);
    const result = await useAppStore.getState().importContacts([
      { displayName: "Taylor Reed", company: "Northstar" },
      { displayName: "  taylor reed  ", company: " northstar " },
    ]);

    expect(result).toEqual({ added: 1, linked: 0, skipped: 1 });
    expect(useAppStore.getState().contacts).toHaveLength(1);
    expect(useAppStore.getState().events[0]?.attendeeContactIds).toHaveLength(1);
  });

  it("links an existing exact person to the active event", async () => {
    const contact: Contact = {
      id: "contact-taylor",
      displayName: "Taylor Reed",
      company: "Northstar",
      conversationTopics: [],
      recognitionEnabled: false,
      timeline: [],
    };
    useAppStore.setState({ contacts: [contact] });
    await useAppStore.getState().addEvent(event);

    const result = await useAppStore.getState().importContacts([
      { displayName: " taylor reed ", company: "NORTHSTAR", role: "Product lead" },
    ]);

    expect(result).toEqual({ added: 0, linked: 1, skipped: 0 });
    expect(useAppStore.getState().contacts).toEqual([{ ...contact, role: "Product lead" }]);
    expect(useAppStore.getState().events[0]?.attendeeContactIds).toEqual([contact.id]);
  });

  it("allows same-name people at different companies", async () => {
    await useAppStore.getState().addEvent(event);

    const result = await useAppStore.getState().importContacts([
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

  it("imports selected system contacts globally without requiring an event", async () => {
    const result = await useAppStore.getState().importContacts([
      { sourceId: "system-contact:ios:one", displayName: "Avery Chen", company: "Northstar" },
      { sourceId: "system-contact:ios:two", displayName: "Morgan Lee" },
    ], null);

    expect(result).toEqual({ added: 2, linked: 0, skipped: 0 });
    expect(useAppStore.getState().contacts).toHaveLength(2);
    expect(useAppStore.getState().events).toEqual([]);
    expect(Object.keys(useAppStore.getState().systemContactLinks)).toHaveLength(2);
  });

  it("stores rich imported profiles and preserves them in a backup", async () => {
    const result = await useAppStore.getState().importContacts([{
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

  it("fills missing imported details without overwriting curated profile fields", async () => {
    const manual: Contact = {
      id: "manual-morgan",
      displayName: "Morgan Lee",
      email: "curated@example.com",
      conversationTopics: [],
      recognitionEnabled: false,
      timeline: [],
    };
    useAppStore.setState({ contacts: [manual] });

    await useAppStore.getState().importContacts([{
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

  it("accumulates complementary details from repeated rows for the same person", async () => {
    const manual: Contact = {
      id: "manual-complementary",
      displayName: "Alex Rivera",
      company: "Northstar",
      conversationTopics: [],
      recognitionEnabled: false,
      timeline: [],
    };
    useAppStore.setState({ contacts: [manual] });

    const result = await useAppStore.getState().importContacts([
      { displayName: "Alex Rivera", company: "Northstar", email: "alex@example.com" },
      { displayName: "Alex Rivera", company: "Northstar", phone: "+12045550188" },
    ], null);

    expect(result).toEqual({ added: 0, linked: 0, skipped: 2 });
    expect(useAppStore.getState().contacts[0]).toMatchObject({
      email: "alex@example.com",
      phone: "+12045550188",
    });
  });

  it("links an import only to the explicitly requested event", async () => {
    const otherEvent: Event = { ...event, id: "event-other", name: "Other event" };
    useAppStore.setState({ events: [event, otherEvent], currentEventId: event.id });

    const result = await useAppStore.getState().importContacts([
      { sourceId: "system-contact:ios:one", displayName: "Avery Chen" },
    ], otherEvent.id);

    expect(result).toEqual({ added: 1, linked: 0, skipped: 0 });
    expect(useAppStore.getState().events[0]?.attendeeContactIds).toEqual([]);
    expect(useAppStore.getState().events[1]?.attendeeContactIds).toHaveLength(1);
  });

  it("does not mutate data for an invalid explicit event", async () => {
    await useAppStore.getState().addEvent(event);
    const before = useAppStore.getState();
    const result = await before.importContacts([
      { sourceId: "system-contact:ios:one", displayName: "Avery Chen" },
    ], "missing-event");

    expect(result).toEqual({ added: 0, linked: 0, skipped: 1 });
    expect(useAppStore.getState().contacts).toEqual(before.contacts);
    expect(useAppStore.getState().systemContactLinks).toEqual({});
  });

  it("uses system identifiers for repeat-safe imports even after a name changes", async () => {
    await useAppStore.getState().importContacts([
      { sourceId: "system-contact:ios:one", displayName: "Avery Chen", company: "Northstar" },
    ], null);
    const firstId = useAppStore.getState().contacts[0]?.id;

    const result = await useAppStore.getState().importContacts([
      { sourceId: "system-contact:ios:one", displayName: "Avery Chen-Smith", company: "Northstar" },
    ], null);

    expect(result).toEqual({ added: 0, linked: 0, skipped: 1 });
    expect(useAppStore.getState().contacts).toHaveLength(1);
    expect(useAppStore.getState().contacts[0]?.id).toBe(firstId);
    expect(useAppStore.getState().contacts[0]?.displayName).toBe("Avery Chen");
  });

  it("preserves distinct same-name system contacts", async () => {
    const result = await useAppStore.getState().importContacts([
      { sourceId: "system-contact:ios:one", displayName: "Jordan Smith" },
      { sourceId: "system-contact:ios:two", displayName: "Jordan Smith" },
    ], null);

    expect(result).toEqual({ added: 2, linked: 0, skipped: 0 });
    expect(useAppStore.getState().contacts).toHaveLength(2);
  });

  it("links a manual exact match without overwriting curated fields", async () => {
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

    const result = await useAppStore.getState().importContacts([
      { sourceId: "system-contact:ios:one", displayName: "Avery Chen", company: "Northstar", role: "Phone role" },
    ], null);

    expect(result).toEqual({ added: 0, linked: 0, skipped: 1 });
    expect(useAppStore.getState().contacts).toEqual([manual]);
    expect(useAppStore.getState().systemContactLinks).toEqual({ "system-contact:ios:one": manual.id });
  });

  it("removes system links when their local person is deleted", async () => {
    await useAppStore.getState().importContacts([
      { sourceId: "system-contact:ios:one", displayName: "Avery Chen" },
    ], null);
    const contactId = useAppStore.getState().contacts[0]!.id;

    await useAppStore.getState().deleteContact(contactId);

    expect(useAppStore.getState().systemContactLinks).toEqual({});
  });

  it("keeps device contact identifiers out of portable exports", async () => {
    await useAppStore.getState().importContacts([
      { sourceId: "system-contact:ios:one", displayName: "Avery Chen" },
    ], null);

    const exported = useAppStore.getState().exportBundle();
    const serialized = JSON.stringify(exported);
    expect(serialized).not.toContain("system-contact:ios:one");
    expect(serialized).not.toContain("systemContactLinks");
  });

  it("adds and removes existing people from any event without deleting them", async () => {
    const secondEvent: Event = { ...event, id: "event-second", name: "Second event" };
    const contact: Contact = {
      id: "contact-taylor",
      displayName: "Taylor Reed",
      conversationTopics: [],
      recognitionEnabled: false,
      timeline: [],
    };
    useAppStore.setState({ contacts: [contact], events: [event, secondEvent] });

    await useAppStore.getState().addContactToEvent(contact.id, secondEvent.id);
    await useAppStore.getState().addContactToEvent(contact.id, secondEvent.id);
    expect(useAppStore.getState().events[1]?.attendeeContactIds).toEqual([contact.id]);

    await useAppStore.getState().removeContactFromEvent(contact.id, secondEvent.id);
    expect(useAppStore.getState().events[1]?.attendeeContactIds).toEqual([]);
    expect(useAppStore.getState().contacts).toEqual([contact]);
  });

  it("stops adding attendees at the EventSchema boundary", async () => {
    const contacts = Array.from({ length: MAX_EVENT_ATTENDEES + 1 }, (_, index): Contact => ({
      id: `contact-capacity-${index}`,
      displayName: `Capacity Person ${index}`,
      conversationTopics: [],
      recognitionEnabled: false,
      timeline: [],
    }));
    useAppStore.setState({
      contacts,
      events: [{
        ...event,
        attendeeContactIds: contacts.slice(0, MAX_EVENT_ATTENDEES - 1).map((contact) => contact.id),
      }],
    });

    await useAppStore.getState().addContactToEvent(contacts[MAX_EVENT_ATTENDEES - 1]!.id, event.id);
    expect(useAppStore.getState().events[0]?.attendeeContactIds).toHaveLength(MAX_EVENT_ATTENDEES);

    await expect(useAppStore.getState().addContactToEvent(
      contacts[MAX_EVENT_ATTENDEES]!.id,
      event.id,
    )).rejects.toThrow(`at most ${MAX_EVENT_ATTENDEES.toLocaleString()} people`);
    const storedEvent = useAppStore.getState().events[0]!;
    expect(storedEvent.attendeeContactIds).toHaveLength(MAX_EVENT_ATTENDEES);
    expect(storedEvent.attendeeContactIds).not.toContain(contacts[MAX_EVENT_ATTENDEES]!.id);
    expect(EventSchema.safeParse(storedEvent).success).toBe(true);
  });

  it("saves a new person without overflowing a full active event", async () => {
    useAppStore.setState({
      events: [{
        ...event,
        attendeeContactIds: Array.from(
          { length: MAX_EVENT_ATTENDEES },
          (_, index) => `existing-attendee-${index}`,
        ),
      }],
      currentEventId: event.id,
    });
    const overflowContact: Contact = {
      id: "contact-manual-overflow",
      displayName: "Manual Overflow",
      conversationTopics: [],
      recognitionEnabled: false,
      timeline: [],
    };

    await useAppStore.getState().addContact(overflowContact);

    expect(useAppStore.getState().contacts).toContainEqual(overflowContact);
    const storedEvent = useAppStore.getState().events[0]!;
    expect(storedEvent.attendeeContactIds).toHaveLength(MAX_EVENT_ATTENDEES);
    expect(storedEvent.attendeeContactIds).not.toContain(overflowContact.id);
    expect(EventSchema.safeParse(storedEvent).success).toBe(true);
  });

  it("keeps manual and imported people within the persisted workspace limit", async () => {
    const contacts = Array.from({ length: MAX_WORKSPACE_CONTACTS }, (_, index): Contact => ({
      id: `contact-workspace-cap-${index}`,
      displayName: `Workspace Person ${index}`,
      conversationTopics: [],
      recognitionEnabled: false,
      timeline: [],
    }));
    useAppStore.setState({ contacts });
    const overflow: Contact = {
      id: "contact-workspace-overflow",
      displayName: "Workspace Overflow",
      conversationTopics: [],
      recognitionEnabled: false,
      timeline: [],
    };

    await expect(useAppStore.getState().addContact(overflow, null))
      .rejects.toThrow(`at most ${MAX_WORKSPACE_CONTACTS.toLocaleString()} people`);
    const importResult = await useAppStore.getState().importContacts([
      { displayName: "Imported Overflow" },
    ], null);

    expect(useAppStore.getState().contacts).toHaveLength(MAX_WORKSPACE_CONTACTS);
    expect(useAppStore.getState().contacts).not.toContainEqual(overflow);
    expect(importResult).toEqual({ added: 0, linked: 0, skipped: 1 });
    expect(ExportBundleSchema.safeParse(useAppStore.getState().exportBundle()).success).toBe(true);
  });

  it("keeps saved events within the persisted workspace limit", async () => {
    const events = Array.from({ length: MAX_WORKSPACE_EVENTS }, (_, index): Event => ({
      ...event,
      id: `event-workspace-cap-${index}`,
      name: `Workspace Event ${index}`,
    }));
    useAppStore.setState({ events });

    await expect(useAppStore.getState().addEvent({
      ...event,
      id: "event-workspace-overflow",
      name: "Workspace Event Overflow",
    })).rejects.toThrow(`at most ${MAX_WORKSPACE_EVENTS.toLocaleString()} events`);

    expect(useAppStore.getState().events).toHaveLength(MAX_WORKSPACE_EVENTS);
    expect(useAppStore.getState().events.some((item) => item.id === "event-workspace-overflow")).toBe(false);
  });

  it("caps an event import, reports overflow as skipped, and stores a valid event", async () => {
    useAppStore.setState({
      events: [{
        ...event,
        attendeeContactIds: Array.from(
          { length: MAX_EVENT_ATTENDEES - 1 },
          (_, index) => `existing-attendee-${index}`,
        ),
      }],
      currentEventId: event.id,
    });

    const result = await useAppStore.getState().importContacts([
      { displayName: "Final Capacity Person" },
      { displayName: "Overflow Person" },
    ]);

    expect(result).toEqual({ added: 1, linked: 0, skipped: 1 });
    expect(useAppStore.getState().contacts.map((contact) => contact.displayName)).toEqual(["Final Capacity Person"]);
    const storedEvent = useAppStore.getState().events[0]!;
    expect(storedEvent.attendeeContactIds).toHaveLength(MAX_EVENT_ATTENDEES);
    expect(EventSchema.safeParse(storedEvent).success).toBe(true);
  });

  it("keeps people reachable after their event is deleted", async () => {
    const contact: Contact = {
      id: "contact-taylor",
      displayName: "Taylor Reed",
      conversationTopics: [],
      recognitionEnabled: false,
      timeline: [],
    };
    useAppStore.setState({ contacts: [contact], events: [{ ...event, attendeeContactIds: [contact.id] }], currentEventId: event.id });

    await useAppStore.getState().deleteEvent(event.id);

    expect(useAppStore.getState().events).toEqual([]);
    expect(useAppStore.getState().contacts).toEqual([contact]);
  });

  it("validates event ranges and lets optional event details be cleared", async () => {
    useAppStore.setState({
      events: [{
        ...event,
        endsAt: "2026-07-10T20:00:00.000Z",
        locationLabel: "Hall A",
      }],
    });

    await useAppStore.getState().updateEvent(event.id, { endsAt: null, locationLabel: null });
    expect(useAppStore.getState().events[0]).not.toHaveProperty("endsAt");
    expect(useAppStore.getState().events[0]).not.toHaveProperty("locationLabel");

    await useAppStore.getState().updateEvent(event.id, {
      endsAt: "2026-07-10T10:00:00.000Z",
    });
    expect(useAppStore.getState().events[0]).not.toHaveProperty("endsAt");
  });

  it("allows saved events without forcing one onto Today", async () => {
    useAppStore.setState({ events: [event], currentEventId: event.id });

    await useAppStore.getState().setCurrentEventId("");

    expect(useAppStore.getState().currentEventId).toBe("");
    expect(useAppStore.getState().events).toEqual([event]);
    await useAppStore.getState().setCurrentEventId("missing-event");
    expect(useAppStore.getState().currentEventId).toBe("");
  });

  it.each([240, 241, 500, 501, 1_000])(
    "normalizes a %i-character memory at every persistence boundary",
    async (length) => {
      useAppStore.setState({ contacts: [contactWithTimeline()] });
      const summary = "M".repeat(length);

      await useAppStore.getState().addMemory(memoryWithSummary(`memory-length-${length}`, summary));

      const stored = useAppStore.getState().contacts[0];
      expect(stored?.timeline).toHaveLength(1);
      expect(stored?.timeline[0]?.summary).toBe("M".repeat(Math.min(length, 500)));
      expect(stored?.lastDiscussed).toBe("M".repeat(Math.min(length, 240)));
      expectExportSchemaRoundTrip();
    },
  );

  it.each([240, 241, 500, 501, 1_000])(
    "normalizes a %i-character imported note before creating a contact memory",
    async (length) => {
      const notes = "I".repeat(length);

      const result = await useAppStore.getState().importContacts([{
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

  it("rejects a 501st memory without deleting any of the existing 500", async () => {
    const existing = Array.from({ length: 499 }, (_, index) =>
      memoryWithSummary(`memory-existing-${index}`, `Existing memory ${index}`));
    useAppStore.setState({ contacts: [contactWithTimeline(existing)] });

    await useAppStore.getState().addMemory(memoryWithSummary("memory-500", "Five hundred"));
    expect(useAppStore.getState().contacts[0]?.timeline).toHaveLength(500);
    expect(useAppStore.getState().contacts[0]?.timeline[0]?.id).toBe("memory-500");
    expectExportSchemaRoundTrip();

    await expect(useAppStore.getState().addMemory(
      memoryWithSummary("memory-501", "Five hundred and one"),
    )).rejects.toThrow("already has 500 memories");
    const timeline = useAppStore.getState().contacts[0]?.timeline ?? [];
    expect(timeline).toHaveLength(500);
    expect(timeline[0]?.id).toBe("memory-500");
    expect(timeline.some((memory) => memory.id === "memory-500")).toBe(true);
    expect(timeline.some((memory) => memory.id === "memory-existing-498")).toBe(true);
    expect(timeline.some((memory) => memory.id === "memory-501")).toBe(false);
    expectExportSchemaRoundTrip();
  });

  it("recomputes derived context after deleting the newest memory", async () => {
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

    await useAppStore.getState().deleteMemory("contact-test", newest.id);
    const contact = useAppStore.getState().contacts[0];
    expect(contact?.timeline).toEqual([older]);
    expect(contact?.lastSpokeAt).toBe(older.occurredAt);
    expect(contact?.lastDiscussed).toBe(older.summary);
    expect(contact?.recentUpdate).toBe("Curated profile update");
  });

  it("does not overwrite a curated profile update when adding a memory", async () => {
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

    await useAppStore.getState().addMemory(memory);
    await useAppStore.getState().addMemory(memory);
    expect(useAppStore.getState().contacts[0]?.recentUpdate).toBe("Promoted to product lead");
    expect(useAppStore.getState().contacts[0]?.timeline).toEqual([memory]);
  });

  it("adds an approved public update without pretending a conversation occurred", async () => {
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

    await useAppStore.getState().addMemory(update);
    const contact = useAppStore.getState().contacts[0];
    expect(contact?.timeline).toEqual([update]);
    expect(contact?.lastSpokeAt).toBe("2026-01-01T12:00:00.000Z");
    expect(contact?.lastDiscussed).toBe("Talked about evaluation pipelines.");
  });

  it("turns approved memory follow-ups into durable actions", async () => {
    const contact = contactWithTimeline();
    const memory = {
      ...memoryWithSummary("memory-actions", "Discussed the launch plan."),
      nextSteps: ["Send the launch brief"],
    };
    useAppStore.setState({ contacts: [contact], events: [event] });

    await useAppStore.getState().addMemory(memory, [{
      title: "Send the launch brief",
      dueAt: "2026-07-12T16:00:00.000Z",
      eventId: event.id,
    }]);

    expect(useAppStore.getState().actions).toMatchObject([{
      contactId: contact.id,
      memoryId: memory.id,
      eventId: event.id,
      title: "Send the launch brief",
      dueAt: "2026-07-12T16:00:00.000Z",
      status: "open",
    }]);
    expect(useAppStore.getState().contacts[0]?.timeline[0]?.nextSteps).toEqual(["Send the launch brief"]);
  });

  it("syncs open memory actions while preserving completed history", async () => {
    const memory = {
      ...memoryWithSummary("memory-sync", "Original summary"),
      nextSteps: ["Old follow-up"],
    };
    useAppStore.setState({ contacts: [contactWithTimeline([memory])] });
    await useAppStore.getState().addAction({
      id: "action-complete",
      contactId: memory.contactId,
      memoryId: memory.id,
      title: "Already done",
      status: "completed",
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T13:00:00.000Z",
      completedAt: "2026-07-10T13:00:00.000Z",
    });
    await useAppStore.getState().addAction({
      id: "action-open",
      contactId: memory.contactId,
      memoryId: memory.id,
      title: "Old follow-up",
      status: "open",
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T12:00:00.000Z",
    });

    await useAppStore.getState().updateMemory(
      memory.contactId,
      memory.id,
      { summary: "Revised summary" },
      [{ title: "New follow-up" }],
    );

    expect(useAppStore.getState().actions).toHaveLength(2);
    expect(useAppStore.getState().actions.find((action) => action.id === "action-complete")?.title).toBe("Already done");
    expect(useAppStore.getState().actions.find((action) => action.status === "open")?.title).toBe("New follow-up");
    expect(useAppStore.getState().contacts[0]?.lastDiscussed).toBe("Revised summary");
  });

  it("can clear an action due date and event without deleting the action", async () => {
    const contact = contactWithTimeline();
    const action: ActionItem = {
      id: "action-clear-links",
      contactId: contact.id,
      eventId: event.id,
      title: "Check in",
      dueAt: "2026-07-12T16:00:00.000Z",
      status: "open",
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T12:00:00.000Z",
    };
    useAppStore.setState({ contacts: [contact], events: [event], actions: [action] });

    await useAppStore.getState().updateAction(action.id, { dueAt: null, eventId: null });

    expect(useAppStore.getState().actions[0]).not.toHaveProperty("dueAt");
    expect(useAppStore.getState().actions[0]).not.toHaveProperty("eventId");
  });

  it("rejects follow-ups beyond the workspace limit without dropping existing history", async () => {
    const contact = contactWithTimeline();
    const actions = Array.from({ length: MAX_WORKSPACE_ACTIONS }, (_, index): ActionItem => ({
      id: `action-workspace-cap-${index}`,
      contactId: contact.id,
      title: `Follow-up ${index}`,
      status: "open",
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T12:00:00.000Z",
    }));
    useAppStore.setState({ contacts: [contact], actions });

    await expect(useAppStore.getState().addAction({
      id: "action-workspace-overflow",
      contactId: contact.id,
      title: "Overflow follow-up",
      status: "open",
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T12:00:00.000Z",
    })).rejects.toThrow("at most 50,000 follow-ups");

    expect(useAppStore.getState().actions).toHaveLength(MAX_WORKSPACE_ACTIONS);
    expect(useAppStore.getState().actions.some((action) => action.id === "action-workspace-overflow")).toBe(false);
  });

  it("keeps a memory's visible next steps in sync with its durable actions", async () => {
    const memory = {
      ...memoryWithSummary("memory-action-sync", "Discussed the next demo."),
      nextSteps: ["Schedule the demo"],
    };
    const action: ActionItem = {
      id: "action-memory-sync",
      contactId: memory.contactId,
      memoryId: memory.id,
      title: "Schedule the demo",
      status: "open",
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T12:00:00.000Z",
    };
    useAppStore.setState({ contacts: [contactWithTimeline([memory])], actions: [action] });

    await useAppStore.getState().updateAction(action.id, { title: "Schedule the product demo" });
    expect(useAppStore.getState().contacts[0]?.timeline[0]?.nextSteps).toEqual(["Schedule the product demo"]);

    await useAppStore.getState().setActionCompleted(action.id, true);
    expect(useAppStore.getState().contacts[0]?.timeline[0]?.nextSteps).toEqual([]);

    await useAppStore.getState().setActionCompleted(action.id, false);
    expect(useAppStore.getState().contacts[0]?.timeline[0]?.nextSteps).toEqual(["Schedule the product demo"]);

    await useAppStore.getState().deleteAction(action.id);
    expect(useAppStore.getState().contacts[0]?.timeline[0]?.nextSteps).toEqual([]);
  });

  it("does not reopen a sixth memory follow-up or lose it during a later memory edit", async () => {
    const memory = {
      ...memoryWithSummary("memory-five-open", "Discussed the launch."),
      nextSteps: Array.from({ length: 5 }, (_, index) => `Open follow-up ${index + 1}`),
    };
    const openActions = memory.nextSteps.map((title, index): ActionItem => ({
      id: `action-open-${index}`,
      contactId: memory.contactId,
      memoryId: memory.id,
      title,
      status: "open",
      createdAt: `2026-07-10T12:0${index}:00.000Z`,
      updatedAt: `2026-07-10T12:0${index}:00.000Z`,
    }));
    const completed: ActionItem = {
      id: "action-completed-sixth",
      contactId: memory.contactId,
      memoryId: memory.id,
      title: "Completed history",
      status: "completed",
      createdAt: "2026-07-09T12:00:00.000Z",
      updatedAt: "2026-07-09T13:00:00.000Z",
      completedAt: "2026-07-09T13:00:00.000Z",
    };
    useAppStore.setState({
      contacts: [contactWithTimeline([memory])],
      actions: [...openActions, completed],
    });

    await expect(useAppStore.getState().setActionCompleted(completed.id, false))
      .rejects.toThrow("already has five open follow-ups");
    await useAppStore.getState().updateMemory(
      memory.contactId,
      memory.id,
      { summary: "Revised without losing history" },
      memory.nextSteps.map((title) => ({ title })),
    );

    expect(useAppStore.getState().actions).toHaveLength(6);
    expect(useAppStore.getState().actions.find((action) => action.id === completed.id)?.status).toBe("completed");
    expect(useAppStore.getState().contacts[0]?.timeline[0]?.nextSteps).toEqual(memory.nextSteps);
  });

  it("cascades memory deletion through actions and relationship evidence", async () => {
    const memory = memoryWithSummary("memory-cascade", "Discussed Atlas.");
    const contact = contactWithTimeline([memory]);
    const entity: KnowledgeEntity = {
      id: "entity-atlas",
      kind: "project",
      name: "Atlas",
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T12:00:00.000Z",
    };
    const relationship: ContactEntityRelationship = {
      id: "relationship-atlas",
      contactId: contact.id,
      entityId: entity.id,
      kind: "works_on",
      evidenceMemoryIds: [memory.id],
      source: "manual",
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T12:00:00.000Z",
    };
    const action: ActionItem = {
      id: "action-atlas",
      contactId: contact.id,
      memoryId: memory.id,
      title: "Send Atlas notes",
      status: "open",
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T12:00:00.000Z",
    };
    useAppStore.setState({
      contacts: [contact],
      actions: [action],
      entities: [entity],
      relationships: [relationship],
    });

    await useAppStore.getState().deleteMemory(contact.id, memory.id);

    expect(useAppStore.getState().actions).toEqual([]);
    expect(useAppStore.getState().relationships[0]?.evidenceMemoryIds).toEqual([]);
  });

  it("accepts and later suppresses a connection suggestion atomically", () => {
    const contact = contactWithTimeline();
    const entity: KnowledgeEntity = {
      id: "entity-northstar",
      kind: "organization",
      name: "Northstar",
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T12:00:00.000Z",
    };
    const relationship: ContactEntityRelationship = {
      id: "relationship-northstar",
      contactId: contact.id,
      entityId: entity.id,
      kind: "works_at",
      evidenceMemoryIds: [],
      source: "accepted-suggestion",
      sourceSuggestionId: "company:northstar",
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T12:00:00.000Z",
    };
    const decision: ConnectionSuggestionDecision = {
      suggestionId: "company:northstar",
      decision: "accepted",
      entityId: entity.id,
      relationshipId: relationship.id,
      decidedAt: "2026-07-10T12:00:00.000Z",
    };
    useAppStore.setState({ contacts: [contact] });

    useAppStore.getState().acceptConnectionSuggestion(entity, relationship, decision);
    expect(useAppStore.getState()).toMatchObject({
      entities: [entity],
      relationships: [relationship],
      connectionDecisions: [decision],
    });

    useAppStore.getState().deleteEntity(entity.id);
    expect(useAppStore.getState().relationships).toEqual([]);
    expect(useAppStore.getState().connectionDecisions).toMatchObject([{
      suggestionId: decision.suggestionId,
      decision: "dismissed",
    }]);
  });

  it("migrates legacy memory next steps into stable action records", async () => {
    const migrate = useAppStore.persist.getOptions().migrate;
    const memory = {
      ...memoryWithSummary("memory-legacy-action", "Discussed a pilot."),
      nextSteps: ["Send pilot deck"],
    };
    const persisted = { contacts: [contactWithTimeline([memory])], events: [] };

    const first = await migrate?.(persisted, 2) as { actions: ActionItem[] };
    const second = await migrate?.(persisted, 2) as { actions: ActionItem[] };

    expect(first.actions).toMatchObject([{
      contactId: memory.contactId,
      memoryId: memory.id,
      title: "Send pilot deck",
      status: "open",
    }]);
    expect(first.actions[0]?.id).toBe(second.actions[0]?.id);
  });
});
