import AsyncStorage from "@react-native-async-storage/async-storage";
import {
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

interface AppState {
  hydrated: boolean;
  hasSeenOnboarding: boolean;
  aiEnabled: boolean;
  currentEventId: string;
  demoTargetId: string | null;
  contacts: Contact[];
  events: Event[];
  setHydrated: (value: boolean) => void;
  completeOnboarding: (aiEnabled: boolean) => void;
  setAiEnabled: (value: boolean) => void;
  setCurrentEventId: (eventId: string) => void;
  setDemoTargetId: (contactId: string | null) => void;
  addMemory: (memory: Memory) => void;
  addContact: (contact: Contact) => void;
  setRecognitionEnabled: (contactId: string, value: boolean) => void;
  importContacts: (contacts: ImportContact[]) => number;
  deleteContact: (contactId: string) => void;
  resetDemo: () => void;
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
  return `${prefix}-${slug(value) || "item"}-${Date.now().toString(36)}`;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      hasSeenOnboarding: false,
      aiEnabled: false,
      currentEventId: seededEvents[0]!.id,
      demoTargetId: "jordan-patel",
      contacts: seededContacts,
      events: seededEvents,
      setHydrated: (hydrated) => set({ hydrated }),
      completeOnboarding: (aiEnabled) => set({ hasSeenOnboarding: true, aiEnabled }),
      setAiEnabled: (aiEnabled) => set({ aiEnabled }),
      setCurrentEventId: (currentEventId) => set({ currentEventId }),
      setDemoTargetId: (demoTargetId) => set({ demoTargetId }),
      addMemory: (memory) =>
        set((state) => ({
          contacts: state.contacts.map((contact) =>
            contact.id === memory.contactId
              ? {
                  ...contact,
                  lastSpokeAt: memory.occurredAt,
                  lastDiscussed: memory.summary,
                  timeline: [memory, ...contact.timeline],
                }
              : contact,
          ),
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
      setRecognitionEnabled: (contactId, recognitionEnabled) =>
        set((state) => ({
          contacts: state.contacts.map((contact) =>
            contact.id === contactId ? { ...contact, recognitionEnabled } : contact,
          ),
        })),
      importContacts: (incoming) => {
        const state = get();
        const known = new Set(state.contacts.map((contact) => contact.displayName.toLowerCase()));
        const created: Contact[] = incoming
          .filter((contact) => !known.has(contact.displayName.toLowerCase()))
          .map((contact) => {
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
            return {
              id,
              displayName: contact.displayName,
              ...(contact.company ? { company: contact.company } : {}),
              ...(contact.role ? { role: contact.role } : {}),
              ...(contact.metAt ? { metAt: contact.metAt } : {}),
              ...(contact.lastSpokeAt ? { lastSpokeAt: contact.lastSpokeAt } : {}),
              recognitionEnabled: false,
              conversationTopics: [],
              timeline,
            };
          });

        if (!created.length) return 0;
        const createdIds = created.map((contact) => contact.id);
        set((current) => ({
          contacts: [...current.contacts, ...created],
          events: current.events.map((event) =>
            event.id === current.currentEventId
              ? { ...event, attendeeContactIds: [...event.attendeeContactIds, ...createdIds] }
              : event,
          ),
        }));
        return created.length;
      },
      deleteContact: (contactId) =>
        set((state) => ({
          contacts: state.contacts.filter((contact) => contact.id !== contactId),
          events: state.events.map((event) => ({
            ...event,
            attendeeContactIds: event.attendeeContactIds.filter((id) => id !== contactId),
          })),
          demoTargetId: state.demoTargetId === contactId ? null : state.demoTargetId,
        })),
      resetDemo: () =>
        set({
          contacts: seededContacts,
          events: seededEvents,
          currentEventId: seededEvents[0]!.id,
          demoTargetId: "jordan-patel",
        }),
      deleteAllData: () =>
        set({
          contacts: [],
          events: [],
          currentEventId: "",
          demoTargetId: null,
          aiEnabled: false,
          hasSeenOnboarding: false,
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
        aiEnabled: state.aiEnabled,
        currentEventId: state.currentEventId,
        demoTargetId: state.demoTargetId,
        contacts: state.contacts,
        events: state.events,
      }),
    },
  ),
);

export async function hydrateAppStore(): Promise<void> {
  await useAppStore.persist.rehydrate();
  useAppStore.getState().setHydrated(true);
}
