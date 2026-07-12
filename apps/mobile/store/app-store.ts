import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ContactSchema,
  ExportBundleSchema,
  ImportContactSchema,
  MemorySchema,
  seededContacts,
  seededEvents,
  type Contact,
  type Event,
  type ExportBundle,
  type ImportContact,
  type Memory,
} from "@context/shared";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface ImportSummary {
  added: number;
  linked: number;
  skipped: number;
}

interface AppState {
  hydrated: boolean;
  hydrationError: string | null;
  hasSeenOnboarding: boolean;
  hasSeenContactImportPrompt: boolean;
  appLockEnabled: boolean;
  localToolsEnabled: boolean;
  updateWatchUsed: boolean;
  currentEventId: string;
  contacts: Contact[];
  events: Event[];
  systemContactLinks: Record<string, string>;
  setHydrated: (value: boolean) => void;
  completeOnboarding: (localToolsEnabled: boolean, loadSample: boolean) => void;
  setHasSeenContactImportPrompt: (value: boolean) => void;
  setAppLockEnabled: (value: boolean) => void;
  setLocalToolsEnabled: (value: boolean) => void;
  setUpdateWatchUsed: (value: boolean) => void;
  setCurrentEventId: (eventId: string) => void;
  addEvent: (event: Event) => void;
  updateEvent: (eventId: string, updates: Partial<Omit<Event, "id" | "attendeeContactIds">>) => void;
  deleteEvent: (eventId: string) => void;
  addMemory: (memory: Memory) => void;
  deleteMemory: (contactId: string, memoryId: string) => void;
  addContact: (contact: Contact, eventId?: string | null) => void;
  addContactToEvent: (contactId: string, eventId: string) => void;
  removeContactFromEvent: (contactId: string, eventId: string) => void;
  updateContact: (contactId: string, updates: Partial<Omit<Contact, "id" | "timeline">>) => void;
  setConversationTopics: (contactId: string, topics: string[]) => void;
  setRecognitionEnabled: (contactId: string, value: boolean) => void;
  importContacts: (contacts: ImportContact[], eventId?: string | null) => ImportSummary;
  deleteContact: (contactId: string) => void;
  resetSample: () => void;
  replaceBundle: (bundle: ExportBundle) => void;
  deleteAllData: () => void;
  exportBundle: () => ExportBundle;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function uniqueId(prefix: string, value: string): string {
  const random = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${slug(value) || "item"}-${Date.now().toString(36)}-${random}`;
}

function removeDerivedMemoryFields(contact: Contact): Contact {
  const { lastSpokeAt: _lastSpokeAt, lastDiscussed: _lastDiscussed, ...rest } = contact;
  return rest;
}

function normalizedIdentityPart(value?: string): string {
  return (value ?? "").trim().toLocaleLowerCase();
}

function importIdentityKey(contact: Pick<Contact, "displayName" | "company"> | Pick<ImportContact, "displayName" | "company">): string {
  return `${normalizedIdentityPart(contact.displayName)}\u0000${normalizedIdentityPart(contact.company)}`;
}

const MAX_MEMORY_SUMMARY_LENGTH = 500;
const MAX_LAST_DISCUSSED_LENGTH = 240;
const MAX_TIMELINE_LENGTH = 500;

function boundedRequiredText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength).trimEnd();
}

function normalizeMemoryForStorage(memory: Memory): Memory | undefined {
  const parsed = MemorySchema.safeParse({
    ...memory,
    summary: boundedRequiredText(memory.summary, MAX_MEMORY_SUMMARY_LENGTH),
  });
  return parsed.success ? parsed.data : undefined;
}

function normalizeContactForStorage(contact: Contact): Contact | undefined {
  const parsed = ContactSchema.safeParse(contact);
  return parsed.success ? parsed.data : undefined;
}

function importedProfileEnrichment(
  existing: Contact,
  incoming: ImportContact,
): Partial<Contact> {
  return {
    ...(!existing.company && incoming.company ? { company: incoming.company } : {}),
    ...(!existing.role && incoming.role ? { role: incoming.role } : {}),
    ...(!existing.email && incoming.email ? { email: incoming.email } : {}),
    ...(!existing.phone && incoming.phone ? { phone: incoming.phone } : {}),
    ...(!(existing.socialLinks?.length) && incoming.socialLinks?.length
      ? { socialLinks: incoming.socialLinks }
      : {}),
    ...(!existing.photoUri && incoming.photoUri ? { photoUri: incoming.photoUri } : {}),
    ...(!existing.metAt && incoming.metAt ? { metAt: incoming.metAt } : {}),
    ...(!existing.relationshipContext && incoming.relationshipContext
      ? { relationshipContext: incoming.relationshipContext }
      : {}),
  };
}

function lastDiscussedFrom(summary: string): string {
  return boundedRequiredText(summary, MAX_LAST_DISCUSSED_LENGTH);
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      hydrated: false,
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
      setHydrated: (hydrated) => set({ hydrated }),
      completeOnboarding: (localToolsEnabled, loadSample) =>
        set((state) => ({
          hasSeenOnboarding: true,
          localToolsEnabled,
          ...(loadSample && state.contacts.length === 0 && state.events.length === 0
            ? {
                contacts: seededContacts,
                events: seededEvents,
                currentEventId: seededEvents[0]?.id ?? "",
              }
            : {}),
        })),
      setHasSeenContactImportPrompt: (hasSeenContactImportPrompt) => set({ hasSeenContactImportPrompt }),
      setAppLockEnabled: (appLockEnabled) => set({ appLockEnabled }),
      setLocalToolsEnabled: (localToolsEnabled) => set({ localToolsEnabled }),
      setUpdateWatchUsed: (updateWatchUsed) => set({ updateWatchUsed }),
      setCurrentEventId: (eventId) => {
        if (eventId === "" || get().events.some((event) => event.id === eventId)) {
          set({ currentEventId: eventId });
        }
      },
      addEvent: (event) =>
        set((state) => ({
          events: state.events.some((item) => item.id === event.id)
            ? state.events
            : [event, ...state.events],
          currentEventId: event.id,
        })),
      updateEvent: (eventId, updates) =>
        set((state) => ({
          events: state.events.map((event) =>
            event.id === eventId ? { ...event, ...updates } : event,
          ),
        })),
      deleteEvent: (eventId) =>
        set((state) => {
          const events = state.events.filter((event) => event.id !== eventId);
          return {
            events,
            currentEventId:
              state.currentEventId === eventId
                ? ""
                : state.currentEventId,
          };
        }),
      addMemory: (memory) => {
        const normalizedMemory = normalizeMemoryForStorage(memory);
        if (!normalizedMemory) return;
        set((state) => ({
          contacts: state.contacts.map((contact) => {
            if (contact.id !== normalizedMemory.contactId) return contact;
            const existingTimeline = contact.timeline.slice(0, MAX_TIMELINE_LENGTH);
            if (existingTimeline.some((item) => item.id === normalizedMemory.id)) {
              return existingTimeline.length === contact.timeline.length
                ? contact
                : { ...contact, timeline: existingTimeline };
            }
            const timeline = [normalizedMemory, ...existingTimeline].slice(0, MAX_TIMELINE_LENGTH);
            if (normalizedMemory.source === "public-update") {
              return { ...contact, timeline };
            }
            return {
              ...contact,
              lastSpokeAt: normalizedMemory.occurredAt,
              lastDiscussed: lastDiscussedFrom(normalizedMemory.summary),
              timeline,
            };
          }),
        }));
      },
      deleteMemory: (contactId, memoryId) =>
        set((state) => ({
          contacts: state.contacts.map((contact) => {
            if (contact.id !== contactId) return contact;
            const timeline = contact.timeline
              .filter((memory) => memory.id !== memoryId)
              .slice(0, MAX_TIMELINE_LENGTH);
            const latest = timeline.filter((memory) => memory.source !== "public-update").sort((left, right) =>
              right.occurredAt.localeCompare(left.occurredAt),
            )[0];
            const base = removeDerivedMemoryFields(contact);
            return latest
              ? {
                  ...base,
                  timeline,
                  lastSpokeAt: latest.occurredAt,
                  lastDiscussed: lastDiscussedFrom(latest.summary),
                }
              : { ...base, timeline };
          }),
        })),
      addContact: (contact, eventId) => {
        const normalizedContact = normalizeContactForStorage(contact);
        if (!normalizedContact) return;
        set((state) => {
          const targetEventId = eventId === null ? "" : eventId ?? state.currentEventId;
          return {
            contacts: state.contacts.some((item) => item.id === normalizedContact.id)
              ? state.contacts
              : [...state.contacts, normalizedContact],
            events: state.events.map((event) =>
              event.id === targetEventId && !event.attendeeContactIds.includes(normalizedContact.id)
                ? { ...event, attendeeContactIds: [...event.attendeeContactIds, normalizedContact.id] }
                : event,
            ),
          };
        });
      },
      addContactToEvent: (contactId, eventId) =>
        set((state) => {
          if (!state.contacts.some((contact) => contact.id === contactId)) return state;
          return {
            events: state.events.map((event) =>
              event.id === eventId && !event.attendeeContactIds.includes(contactId)
                ? { ...event, attendeeContactIds: [...event.attendeeContactIds, contactId] }
                : event,
            ),
          };
        }),
      removeContactFromEvent: (contactId, eventId) =>
        set((state) => ({
          events: state.events.map((event) =>
            event.id === eventId && event.attendeeContactIds.includes(contactId)
              ? {
                  ...event,
                  attendeeContactIds: event.attendeeContactIds.filter((id) => id !== contactId),
                }
              : event,
          ),
        })),
      updateContact: (contactId, updates) =>
        set((state) => ({
          contacts: state.contacts.map((contact) => {
            if (contact.id !== contactId) return contact;
            return normalizeContactForStorage({ ...contact, ...updates }) ?? contact;
          }),
        })),
      setConversationTopics: (contactId, conversationTopics) =>
        set((state) => ({
          contacts: state.contacts.map((contact) =>
            contact.id === contactId ? { ...contact, conversationTopics } : contact,
          ),
        })),
      setRecognitionEnabled: (contactId, recognitionEnabled) =>
        set((state) => ({
          contacts: state.contacts.map((contact) =>
            contact.id === contactId ? { ...contact, recognitionEnabled } : contact,
          ),
        })),
      importContacts: (incoming, eventId) => {
        const state = get();
        const targetEventId = eventId === null ? null : eventId ?? state.currentEventId;
        const targetEvent = targetEventId
          ? state.events.find((event) => event.id === targetEventId)
          : undefined;
        if (targetEventId !== null && !targetEvent) {
          return { added: 0, linked: 0, skipped: incoming.length };
        }

        const knownContacts = [...state.contacts];
        const systemContactLinks = { ...state.systemContactLinks };
        const systemLinkedContactIds = new Set(Object.values(systemContactLinks));
        const contactById = new Map(knownContacts.map((contact) => [contact.id, contact]));
        const contactIndexById = new Map(knownContacts.map((contact, index) => [contact.id, index]));
        const firstByIdentity = new Map<string, Contact>();
        const unlinkedByIdentity = new Map<string, Contact[]>();
        knownContacts.forEach((contact) => {
          const key = importIdentityKey(contact);
          if (!firstByIdentity.has(key)) firstByIdentity.set(key, contact);
          if (!systemLinkedContactIds.has(contact.id)) {
            unlinkedByIdentity.set(key, [...(unlinkedByIdentity.get(key) ?? []), contact]);
          }
        });
        const attendeeIds = new Set(targetEvent?.attendeeContactIds ?? []);
        let linked = 0;
        let skipped = 0;

        for (const candidate of incoming) {
          const parsedContact = ImportContactSchema.safeParse(candidate);
          if (!parsedContact.success) {
            skipped += 1;
            continue;
          }
          const contact = parsedContact.data;
          const linkedContactId = contact.sourceId ? systemContactLinks[contact.sourceId] : undefined;
          let existing = linkedContactId
            ? contactById.get(linkedContactId)
            : undefined;
          if (!existing) {
            const key = importIdentityKey(contact);
            existing = contact.sourceId
              ? unlinkedByIdentity.get(key)?.shift()
              : firstByIdentity.get(key);
          }
          if (existing) {
            if (contact.sourceId) {
              systemContactLinks[contact.sourceId] = existing.id;
              systemLinkedContactIds.add(existing.id);
            }
            const existingIndex = contactIndexById.get(existing.id);
            const enrichment = importedProfileEnrichment(existing, contact);
            if (existingIndex !== undefined && Object.keys(enrichment).length) {
              const enriched = { ...existing, ...enrichment };
              knownContacts[existingIndex] = enriched;
              contactById.set(existing.id, enriched);
            }
            if (targetEvent && !attendeeIds.has(existing.id)) {
              attendeeIds.add(existing.id);
              linked += 1;
            } else {
              skipped += 1;
            }
            continue;
          }
          const id = uniqueId("contact", contact.displayName);
          const noteSummary = contact.notes
            ? boundedRequiredText(contact.notes, MAX_MEMORY_SUMMARY_LENGTH)
            : undefined;
          const importedMemory = noteSummary
            ? normalizeMemoryForStorage({
                id: uniqueId("memory", contact.displayName),
                contactId: id,
                summary: noteSummary,
                tags: ["imported"],
                nextSteps: [],
                source: "import",
                occurredAt: contact.lastSpokeAt ?? new Date().toISOString(),
                createdAt: new Date().toISOString(),
              })
            : undefined;
          const timeline: Memory[] = importedMemory ? [importedMemory] : [];
          const createdContact = ContactSchema.safeParse({
            id,
            displayName: contact.displayName,
            ...(contact.company ? { company: contact.company } : {}),
            ...(contact.role ? { role: contact.role } : {}),
            ...(contact.email ? { email: contact.email } : {}),
            ...(contact.phone ? { phone: contact.phone } : {}),
            ...(contact.socialLinks?.length ? { socialLinks: contact.socialLinks } : {}),
            ...(contact.photoUri ? { photoUri: contact.photoUri } : {}),
            ...(contact.metAt ? { metAt: contact.metAt } : {}),
            ...(contact.relationshipContext
              ? { relationshipContext: contact.relationshipContext }
              : {}),
            ...(contact.lastSpokeAt ? { lastSpokeAt: contact.lastSpokeAt } : {}),
            ...(noteSummary ? { lastDiscussed: lastDiscussedFrom(noteSummary) } : {}),
            recognitionEnabled: false,
            conversationTopics: [],
            timeline,
          });
          if (!createdContact.success) {
            skipped += 1;
            continue;
          }
          const storedContact = createdContact.data;
          knownContacts.push(storedContact);
          contactById.set(id, storedContact);
          contactIndexById.set(id, knownContacts.length - 1);
          const key = importIdentityKey(storedContact);
          if (!firstByIdentity.has(key)) firstByIdentity.set(key, storedContact);
          if (contact.sourceId) {
            systemContactLinks[contact.sourceId] = id;
            systemLinkedContactIds.add(id);
          } else {
            unlinkedByIdentity.set(key, [...(unlinkedByIdentity.get(key) ?? []), storedContact]);
          }
          if (targetEvent) attendeeIds.add(id);
        }

        const added = knownContacts.length - state.contacts.length;
        if (incoming.length) {
          set({
            contacts: knownContacts,
            systemContactLinks,
            events: state.events.map((event) =>
              targetEvent && event.id === targetEvent.id
                ? { ...event, attendeeContactIds: [...attendeeIds] }
                : event,
            ),
          });
        }
        return { added, linked, skipped };
      },
      deleteContact: (contactId) =>
        set((state) => {
          const systemContactLinks = Object.fromEntries(
            Object.entries(state.systemContactLinks).filter(([, linkedContactId]) => linkedContactId !== contactId),
          );
          return {
            contacts: state.contacts.filter((contact) => contact.id !== contactId),
            events: state.events.map((event) => ({
              ...event,
              attendeeContactIds: event.attendeeContactIds.filter((id) => id !== contactId),
            })),
            systemContactLinks,
          };
        }),
      resetSample: () =>
        set({
          contacts: seededContacts,
          events: seededEvents,
          currentEventId: seededEvents[0]?.id ?? "",
          hasSeenOnboarding: true,
          updateWatchUsed: false,
          systemContactLinks: {},
        }),
      replaceBundle: (bundle) =>
        set({
          contacts: bundle.contacts,
          events: bundle.events,
          currentEventId: bundle.events[0]?.id ?? "",
          hasSeenOnboarding: true,
          updateWatchUsed: false,
          systemContactLinks: {},
        }),
      deleteAllData: () =>
        set({
          contacts: [],
          events: [],
          currentEventId: "",
          appLockEnabled: false,
          localToolsEnabled: false,
          updateWatchUsed: false,
          hasSeenOnboarding: false,
          hasSeenContactImportPrompt: false,
          hydrationError: null,
          systemContactLinks: {},
        }),
      exportBundle: () => ({
        version: 1,
        exportedAt: new Date().toISOString(),
        contacts: get().contacts,
        events: get().events,
      }),
    }),
    {
      name: "context-memory-store-v1",
      storage: createJSONStorage(() => AsyncStorage),
      skipHydration: true,
      partialize: (state) => ({
        hasSeenOnboarding: state.hasSeenOnboarding,
        hasSeenContactImportPrompt: state.hasSeenContactImportPrompt,
        appLockEnabled: state.appLockEnabled,
        localToolsEnabled: state.localToolsEnabled,
        updateWatchUsed: state.updateWatchUsed,
        currentEventId: state.currentEventId,
        contacts: state.contacts,
        events: state.events,
        systemContactLinks: state.systemContactLinks,
      }),
      version: 2,
      migrate: (persisted, version) => {
        const legacy = persisted as Partial<AppState> & { aiEnabled?: boolean };
        let localToolsEnabled = legacy.localToolsEnabled ?? false;
        if (version === 0) {
          localToolsEnabled = legacy.aiEnabled ?? false;
        }
        const { aiEnabled: _aiEnabled, ...rest } = legacy;
        return {
          ...rest,
          localToolsEnabled,
          hasSeenContactImportPrompt: legacy.hasSeenContactImportPrompt ?? false,
          systemContactLinks: legacy.systemContactLinks ?? {},
        } as AppState;
      },
    },
  ),
);

export async function hydrateAppStore(): Promise<void> {
  try {
    await useAppStore.persist.rehydrate();
    const state = useAppStore.getState();
    const parsed = ExportBundleSchema.safeParse({
      version: 1,
      exportedAt: new Date().toISOString(),
      contacts: state.contacts,
      events: state.events,
    });
    if (!parsed.success) throw new Error("Stored workspace is invalid.");
    const currentEventId = state.currentEventId === ""
      ? ""
      : state.events.some((event) => event.id === state.currentEventId)
        ? state.currentEventId
        : state.events[0]?.id ?? "";
    const contactIds = new Set(state.contacts.map((contact) => contact.id));
    const systemContactLinks = Object.fromEntries(
      Object.entries(state.systemContactLinks).filter(([, contactId]) => contactIds.has(contactId)),
    );
    useAppStore.setState({
      hydrated: true,
      hydrationError: null,
      contacts: parsed.data.contacts,
      events: parsed.data.events,
      currentEventId,
      systemContactLinks,
    });
  } catch {
    useAppStore.setState({
      hydrated: true,
      hydrationError: "Your saved workspace could not be opened. You can start again without losing the backup file on this device.",
    });
  }
}
