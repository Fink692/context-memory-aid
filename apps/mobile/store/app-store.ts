import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ExportBundleSchema,
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
  skipped: number;
}

interface AppState {
  hydrated: boolean;
  hydrationError: string | null;
  hasSeenOnboarding: boolean;
  localToolsEnabled: boolean;
  updateWatchUsed: boolean;
  currentEventId: string;
  contacts: Contact[];
  events: Event[];
  setHydrated: (value: boolean) => void;
  completeOnboarding: (localToolsEnabled: boolean, loadSample: boolean) => void;
  setLocalToolsEnabled: (value: boolean) => void;
  setUpdateWatchUsed: (value: boolean) => void;
  setCurrentEventId: (eventId: string) => void;
  addEvent: (event: Event) => void;
  updateEvent: (eventId: string, updates: Partial<Omit<Event, "id" | "attendeeContactIds">>) => void;
  deleteEvent: (eventId: string) => void;
  addMemory: (memory: Memory) => void;
  deleteMemory: (contactId: string, memoryId: string) => void;
  addContact: (contact: Contact) => void;
  updateContact: (contactId: string, updates: Partial<Omit<Contact, "id" | "timeline">>) => void;
  setConversationTopics: (contactId: string, topics: string[]) => void;
  setRecognitionEnabled: (contactId: string, value: boolean) => void;
  importContacts: (contacts: ImportContact[]) => ImportSummary;
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

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      hydrationError: null,
      hasSeenOnboarding: false,
      localToolsEnabled: false,
      updateWatchUsed: false,
      currentEventId: "",
      contacts: [],
      events: [],
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
      setLocalToolsEnabled: (localToolsEnabled) => set({ localToolsEnabled }),
      setUpdateWatchUsed: (updateWatchUsed) => set({ updateWatchUsed }),
      setCurrentEventId: (eventId) => {
        if (get().events.some((event) => event.id === eventId)) {
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
                ? events[0]?.id ?? ""
                : state.currentEventId,
          };
        }),
      addMemory: (memory) =>
        set((state) => ({
          contacts: state.contacts.map((contact) =>
            contact.id === memory.contactId
              ? memory.source === "public-update"
                ? {
                    ...contact,
                    timeline: [memory, ...contact.timeline],
                  }
                : {
                    ...contact,
                    lastSpokeAt: memory.occurredAt,
                    lastDiscussed: memory.summary,
                    timeline: [memory, ...contact.timeline],
                  }
              : contact,
          ),
        })),
      deleteMemory: (contactId, memoryId) =>
        set((state) => ({
          contacts: state.contacts.map((contact) => {
            if (contact.id !== contactId) return contact;
            const timeline = contact.timeline.filter((memory) => memory.id !== memoryId);
            const latest = timeline.filter((memory) => memory.source !== "public-update").sort((left, right) =>
              right.occurredAt.localeCompare(left.occurredAt),
            )[0];
            const base = removeDerivedMemoryFields(contact);
            return latest
              ? {
                  ...base,
                  timeline,
                  lastSpokeAt: latest.occurredAt,
                  lastDiscussed: latest.summary,
                }
              : { ...base, timeline };
          }),
        })),
      addContact: (contact) =>
        set((state) => ({
          contacts: [...state.contacts, contact],
          events: state.events.map((event) =>
            event.id === state.currentEventId
              ? { ...event, attendeeContactIds: [...event.attendeeContactIds, contact.id] }
              : event,
          ),
        })),
      updateContact: (contactId, updates) =>
        set((state) => ({
          contacts: state.contacts.map((contact) =>
            contact.id === contactId ? { ...contact, ...updates } : contact,
          ),
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
      importContacts: (incoming) => {
        const state = get();
        const activeEvent = state.events.find((event) => event.id === state.currentEventId);
        if (!activeEvent) return { added: 0, skipped: incoming.length };

        const known = new Set(
          state.contacts.map((contact) => contact.displayName.trim().toLocaleLowerCase()),
        );
        let skipped = 0;
        const created: Contact[] = [];

        for (const contact of incoming) {
          const normalizedName = contact.displayName.trim().toLocaleLowerCase();
          if (known.has(normalizedName)) {
            skipped += 1;
            continue;
          }
          known.add(normalizedName);
          const id = uniqueId("contact", contact.displayName);
          const timeline: Memory[] = contact.notes
            ? [{
                id: uniqueId("memory", contact.displayName),
                contactId: id,
                summary: contact.notes,
                tags: ["imported"],
                nextSteps: [],
                source: "import",
                occurredAt: contact.lastSpokeAt ?? new Date().toISOString(),
                createdAt: new Date().toISOString(),
              }]
            : [];
          created.push({
            id,
            displayName: contact.displayName,
            ...(contact.company ? { company: contact.company } : {}),
            ...(contact.role ? { role: contact.role } : {}),
            ...(contact.metAt ? { metAt: contact.metAt } : {}),
            ...(contact.lastSpokeAt ? { lastSpokeAt: contact.lastSpokeAt } : {}),
            ...(contact.notes ? { lastDiscussed: contact.notes } : {}),
            recognitionEnabled: false,
            conversationTopics: [],
            timeline,
          });
        }

        if (created.length) {
          const createdIds = created.map((contact) => contact.id);
          set((current) => ({
            contacts: [...current.contacts, ...created],
            events: current.events.map((event) =>
              event.id === current.currentEventId
                ? { ...event, attendeeContactIds: [...event.attendeeContactIds, ...createdIds] }
                : event,
            ),
          }));
        }
        return { added: created.length, skipped };
      },
      deleteContact: (contactId) =>
        set((state) => ({
          contacts: state.contacts.filter((contact) => contact.id !== contactId),
          events: state.events.map((event) => ({
            ...event,
            attendeeContactIds: event.attendeeContactIds.filter((id) => id !== contactId),
          })),
        })),
      resetSample: () =>
        set({
          contacts: seededContacts,
          events: seededEvents,
          currentEventId: seededEvents[0]?.id ?? "",
          hasSeenOnboarding: true,
          updateWatchUsed: false,
        }),
      replaceBundle: (bundle) =>
        set({
          contacts: bundle.contacts,
          events: bundle.events,
          currentEventId: bundle.events[0]?.id ?? "",
          hasSeenOnboarding: true,
          updateWatchUsed: false,
        }),
      deleteAllData: () =>
        set({
          contacts: [],
          events: [],
          currentEventId: "",
          localToolsEnabled: false,
          updateWatchUsed: false,
          hasSeenOnboarding: false,
          hydrationError: null,
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
        localToolsEnabled: state.localToolsEnabled,
        updateWatchUsed: state.updateWatchUsed,
        currentEventId: state.currentEventId,
        contacts: state.contacts,
        events: state.events,
      }),
      version: 1,
      migrate: (persisted, version) => {
        const legacy = persisted as Partial<AppState> & { aiEnabled?: boolean };
        if (version === 0) {
          const { aiEnabled, ...rest } = legacy;
          return {
            ...rest,
            localToolsEnabled: aiEnabled ?? false,
          } as AppState;
        }
        return legacy as AppState;
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
    const currentEventId = state.events.some((event) => event.id === state.currentEventId)
      ? state.currentEventId
      : state.events[0]?.id ?? "";
    useAppStore.setState({ hydrated: true, hydrationError: null, currentEventId });
  } catch {
    useAppStore.setState({
      hydrated: true,
      hydrationError: "Your saved workspace could not be opened. You can start again without losing the backup file on this device.",
    });
  }
}
