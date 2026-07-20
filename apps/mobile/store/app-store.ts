import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActionItemSchema,
  ConnectionSuggestionDecisionSchema,
  ContactSchema,
  ContactEntityRelationshipSchema,
  EventSchema,
  ExportBundleSchema,
  ImportContactSchema,
  KnowledgeEntitySchema,
  MAX_EVENT_ATTENDEES,
  MAX_WORKSPACE_ACTIONS,
  MAX_WORKSPACE_CONTACTS,
  MAX_WORKSPACE_EVENTS,
  MAX_WORKSPACE_MEMORIES,
  MAX_WORKSPACE_MEMORY_NEXT_STEPS,
  MemorySchema,
  seededContacts,
  seededEvents,
  type ActionItem,
  type ConnectionSuggestionDecision,
  type Contact,
  type ContactEntityRelationship,
  type Event,
  type ExportBundle,
  type ImportContact,
  type KnowledgeEntity,
  type Memory,
} from "@context/shared";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// Hydration status is runtime-only. Writing it through Zustand's persist
// middleware would rewrite the whole workspace—even when the initial
// AsyncStorage read failed. Suppression is depth-counted so the synchronous
// transient-state path and the async legacy-migration path cannot accidentally
// re-enable persistence while either scope is still active.
let persistenceSuppressionDepth = 0;
let suppressedPersistenceWriteCount = 0;
const appStoreStorage = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => {
    if (persistenceSuppressionDepth > 0) {
      suppressedPersistenceWriteCount += 1;
      return Promise.resolve();
    }
    return AsyncStorage.setItem(key, value);
  },
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};

export interface ImportSummary {
  added: number;
  linked: number;
  skipped: number;
}

export interface ActionDraft {
  title: string;
  dueAt?: string;
  eventId?: string;
}

export interface ActionUpdate {
  title?: string;
  dueAt?: string | null;
  eventId?: string | null;
}

export interface EventUpdate {
  name?: string;
  startsAt?: string;
  endsAt?: string | null;
  locationLabel?: string | null;
}

export interface WorkspaceReplacement {
  contacts: Contact[];
  events: Event[];
  actions: ActionItem[];
  entities: KnowledgeEntity[];
  relationships: ContactEntityRelationship[];
  connectionDecisions: ConnectionSuggestionDecision[];
}

export interface WorkspaceReplacementSnapshot {
  contacts: Contact[];
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
  actions: ActionItem[];
  entities: KnowledgeEntity[];
  relationships: ContactEntityRelationship[];
  connectionDecisions: ConnectionSuggestionDecision[];
  systemContactLinks: Record<string, string>;
  setHydrated: (value: boolean) => void;
  completeOnboarding: (localToolsEnabled: boolean, loadSample: boolean) => Promise<void>;
  setHasSeenContactImportPrompt: (value: boolean) => void;
  setAppLockEnabled: (value: boolean) => Promise<void>;
  setLocalToolsEnabled: (value: boolean) => Promise<void>;
  setUpdateWatchUsed: (value: boolean) => void;
  setCurrentEventId: (eventId: string) => Promise<void>;
  addEvent: (event: Event) => Promise<void>;
  updateEvent: (eventId: string, updates: EventUpdate) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;
  addMemory: (memory: Memory, actions?: ActionDraft[]) => Promise<void>;
  updateMemory: (
    contactId: string,
    memoryId: string,
    updates: Partial<Omit<Memory, "id" | "contactId" | "createdAt">>,
    actions?: ActionDraft[],
  ) => Promise<void>;
  deleteMemory: (contactId: string, memoryId: string) => Promise<void>;
  addAction: (action: ActionItem) => Promise<void>;
  updateAction: (actionId: string, updates: ActionUpdate) => Promise<void>;
  setActionCompleted: (actionId: string, completed: boolean) => Promise<void>;
  deleteAction: (actionId: string) => Promise<void>;
  addEntity: (entity: KnowledgeEntity) => void;
  updateEntity: (entityId: string, updates: Partial<Pick<KnowledgeEntity, "kind" | "name" | "notes">>) => void;
  deleteEntity: (entityId: string) => void;
  addRelationship: (relationship: ContactEntityRelationship) => void;
  updateRelationship: (
    relationshipId: string,
    updates: Partial<Pick<ContactEntityRelationship, "kind" | "label" | "evidenceMemoryIds">>,
  ) => void;
  deleteRelationship: (relationshipId: string) => void;
  setConnectionDecision: (decision: ConnectionSuggestionDecision) => void;
  deleteConnectionDecision: (suggestionId: string) => void;
  acceptConnectionSuggestion: (
    entity: KnowledgeEntity,
    relationship: ContactEntityRelationship,
    decision: ConnectionSuggestionDecision,
  ) => void;
  addContact: (contact: Contact, eventId?: string | null) => Promise<void>;
  addContactToEvent: (contactId: string, eventId: string) => Promise<void>;
  removeContactFromEvent: (contactId: string, eventId: string) => Promise<void>;
  updateContact: (contactId: string, updates: Partial<Omit<Contact, "id" | "timeline">>) => Promise<void>;
  setConversationTopics: (contactId: string, topics: string[]) => Promise<void>;
  setRecognitionEnabled: (contactId: string, value: boolean) => void;
  importContacts: (contacts: ImportContact[], eventId?: string | null) => Promise<ImportSummary>;
  deleteContact: (contactId: string) => Promise<void>;
  resetSample: () => Promise<void>;
  replaceBundle: (bundle: ExportBundle) => Promise<void>;
  commitWorkspaceRestore: (workspace: WorkspaceReplacement) => Promise<WorkspaceReplacementSnapshot>;
  deleteAllData: () => Promise<void>;
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
const MAX_OPEN_ACTIONS_PER_MEMORY = 5;

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

function normalizeActionForStorage(action: ActionItem): ActionItem | undefined {
  const parsed = ActionItemSchema.safeParse(action);
  return parsed.success ? parsed.data : undefined;
}

function eventWithAddedAttendee(event: Event, contactId: string): Event {
  if (event.attendeeContactIds.includes(contactId)
    || event.attendeeContactIds.length >= MAX_EVENT_ATTENDEES) return event;
  const parsed = EventSchema.safeParse({
    ...event,
    attendeeContactIds: [...event.attendeeContactIds, contactId],
  });
  return parsed.success ? parsed.data : event;
}

function normalizeActionDrafts(drafts: ActionDraft[]): ActionDraft[] {
  return drafts.slice(0, MAX_OPEN_ACTIONS_PER_MEMORY).flatMap((draft) => {
    const title = boundedRequiredText(draft.title, 160);
    if (!title) return [];
    const dueAt = draft.dueAt && !Number.isNaN(new Date(draft.dueAt).getTime())
      ? new Date(draft.dueAt).toISOString()
      : undefined;
    return [{
      title,
      ...(dueAt ? { dueAt } : {}),
      ...(draft.eventId ? { eventId: draft.eventId } : {}),
    }];
  });
}

function contactWithDerivedMemoryFields(contact: Contact, timeline: Memory[]): Contact {
  if (timeline.length > MAX_TIMELINE_LENGTH) {
    throw new Error(`A person can contain at most ${MAX_TIMELINE_LENGTH.toLocaleString()} memories.`);
  }
  const latest = timeline
    .filter((memory) => memory.source !== "public-update")
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0];
  const base = removeDerivedMemoryFields(contact);
  return latest
    ? {
        ...base,
        timeline,
        lastSpokeAt: latest.occurredAt,
        lastDiscussed: lastDiscussedFrom(latest.summary),
      }
    : { ...base, timeline };
}

function assertWorkspaceMemoryLimits(contacts: Contact[]): void {
  let memoryCount = 0;
  let followUpReferenceCount = 0;
  for (const contact of contacts) {
    if (contact.timeline.length > MAX_TIMELINE_LENGTH) {
      throw new Error(`A person can contain at most ${MAX_TIMELINE_LENGTH.toLocaleString()} memories.`);
    }
    memoryCount += contact.timeline.length;
    for (const memory of contact.timeline) followUpReferenceCount += memory.nextSteps.length;
  }
  if (memoryCount > MAX_WORKSPACE_MEMORIES) {
    throw new Error(`A workspace can contain at most ${MAX_WORKSPACE_MEMORIES.toLocaleString()} memories.`);
  }
  if (followUpReferenceCount > MAX_WORKSPACE_MEMORY_NEXT_STEPS) {
    throw new Error(`Workspace memories can contain at most ${MAX_WORKSPACE_MEMORY_NEXT_STEPS.toLocaleString()} follow-up references.`);
  }
}

function assertWorkspaceActionLimit(actions: ActionItem[]): void {
  if (actions.length > MAX_WORKSPACE_ACTIONS) {
    throw new Error(`A workspace can contain at most ${MAX_WORKSPACE_ACTIONS.toLocaleString()} follow-ups.`);
  }
}

function syncMemoryActions(
  actions: ActionItem[],
  memory: Memory,
  drafts: ActionDraft[],
): ActionItem[] {
  const normalizedDrafts = normalizeActionDrafts(drafts);
  const existing = actions
    .filter((action) => action.memoryId === memory.id && action.status === "open")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  const unrelated = actions.filter((action) => action.memoryId !== memory.id || action.status === "completed");
  const now = new Date().toISOString();
  const linked = normalizedDrafts.flatMap((draft, index) => {
    const current = existing[index];
    const candidate: ActionItem = current
      ? (({ dueAt: _dueAt, eventId: _eventId, ...rest }) => ({
          ...rest,
          title: draft.title,
          ...(draft.dueAt ? { dueAt: draft.dueAt } : {}),
          ...(draft.eventId ? { eventId: draft.eventId } : {}),
          updatedAt: now,
        }))(current)
      : {
          id: uniqueId("action", `${memory.id}-${draft.title}`),
          contactId: memory.contactId,
          memoryId: memory.id,
          ...(draft.eventId ? { eventId: draft.eventId } : {}),
          title: draft.title,
          ...(draft.dueAt ? { dueAt: draft.dueAt } : {}),
          status: "open",
          createdAt: now,
          updatedAt: now,
        };
    const normalized = normalizeActionForStorage(candidate);
    return normalized ? [normalized] : [];
  });
  const nextActions = [...unrelated, ...linked];
  assertWorkspaceActionLimit(nextActions);
  return nextActions;
}

function contactsWithSyncedMemoryNextSteps(
  contacts: Contact[],
  actions: ActionItem[],
  memoryIds: Set<string>,
): Contact[] {
  if (!memoryIds.size) return contacts;
  const now = new Date().toISOString();
  const openTitlesByMemory = new Map<string, string[]>();
  actions
    .filter((action) => action.status === "open" && action.memoryId && memoryIds.has(action.memoryId))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
    .forEach((action) => {
      const memoryId = action.memoryId!;
      const titles = openTitlesByMemory.get(memoryId) ?? [];
      if (titles.length < MAX_OPEN_ACTIONS_PER_MEMORY) titles.push(action.title);
      openTitlesByMemory.set(memoryId, titles);
    });
  return contacts.map((contact) => {
    let changed = false;
    const timeline = contact.timeline.map((memory) => {
      if (!memoryIds.has(memory.id)) return memory;
      const nextSteps = openTitlesByMemory.get(memory.id) ?? [];
      if (memory.nextSteps.length === nextSteps.length
        && memory.nextSteps.every((title, index) => title === nextSteps[index])) return memory;
      changed = true;
      return { ...memory, nextSteps, updatedAt: now };
    });
    return changed ? { ...contact, timeline } : contact;
  });
}

function deterministicHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function legacyActionsFromContacts(contacts: Contact[]): ActionItem[] {
  const actions: ActionItem[] = [];
  const usedIds = new Set<string>();
  actionMigration:
  for (const contact of contacts) {
    for (const memory of contact.timeline) {
      for (const [index, title] of memory.nextSteps.slice(0, MAX_OPEN_ACTIONS_PER_MEMORY).entries()) {
        if (actions.length >= MAX_WORKSPACE_ACTIONS) break actionMigration;
        const baseId = `action-${deterministicHash(`${memory.id}\u0000${index}\u0000${title}`)}`;
        let id = baseId;
        let collision = 2;
        while (usedIds.has(id)) {
          id = `${baseId}-${collision}`;
          collision += 1;
        }
        const now = memory.updatedAt ?? memory.createdAt;
        const candidate: ActionItem = {
          id,
          contactId: contact.id,
          memoryId: memory.id,
          title,
          status: "open",
          createdAt: now,
          updatedAt: now,
        };
        const normalized = normalizeActionForStorage(candidate);
        if (normalized) {
          usedIds.add(normalized.id);
          actions.push(normalized);
        }
      }
    }
  }
  return actions;
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
    (set, get) => {
      type StoreUpdate = AppState | Partial<AppState> | ((state: AppState) => AppState | Partial<AppState>);
      interface DurableTransaction<TResult> {
        update: StoreUpdate | null;
        result: TResult;
      }
      let durableMutationTail: Promise<void> = Promise.resolve();
      const applyStoreUpdate = (update: StoreUpdate) => set(
        update as AppState | ((state: AppState) => AppState),
      );
      const transactDurably = <TResult>(
        transaction: (state: AppState) => DurableTransaction<TResult>,
      ): Promise<TResult> => {
        const operation = durableMutationTail.then(async () => {
          const previous = get();
          const { update, result } = transaction(previous);
          if (update === null) return result;
          try {
            await Promise.resolve(applyStoreUpdate(update));
          } catch (error) {
            await Promise.resolve(set(previous)).catch(() => undefined);
            throw error;
          }
          return result;
        });
        durableMutationTail = operation.then(() => undefined, () => undefined);
        return operation;
      };
      const setDurably = (update: StoreUpdate): Promise<void> =>
        transactDurably(() => ({ update, result: undefined }));
      const setBestEffort = (update: StoreUpdate): void => {
        void Promise.resolve(applyStoreUpdate(update)).catch(() => undefined);
      };

      return {
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
      actions: [],
      entities: [],
      relationships: [],
      connectionDecisions: [],
      systemContactLinks: {},
      setHydrated: (hydrated) => setBestEffort({ hydrated }),
      completeOnboarding: (localToolsEnabled, loadSample) =>
        setDurably((state) => ({
          hasSeenOnboarding: true,
          localToolsEnabled,
          ...(loadSample && state.contacts.length === 0 && state.events.length === 0
            ? {
                contacts: seededContacts,
                events: seededEvents,
                actions: legacyActionsFromContacts(seededContacts),
                entities: [],
                relationships: [],
                connectionDecisions: [],
                currentEventId: seededEvents[0]?.id ?? "",
              }
            : {}),
        })),
      setHasSeenContactImportPrompt: (hasSeenContactImportPrompt) => setBestEffort({ hasSeenContactImportPrompt }),
      setAppLockEnabled: (appLockEnabled) => setDurably({ appLockEnabled }),
      setLocalToolsEnabled: (localToolsEnabled) => setDurably({ localToolsEnabled }),
      setUpdateWatchUsed: (updateWatchUsed) => setBestEffort({ updateWatchUsed }),
      setCurrentEventId: async (eventId) => {
        await setDurably((state) => eventId === "" || state.events.some((event) => event.id === eventId)
          ? { currentEventId: eventId }
          : state);
      },
      addEvent: async (event) => {
        const parsed = EventSchema.safeParse(event);
        if (!parsed.success) return;
        await setDurably((state) => {
          const exists = state.events.some((item) => item.id === parsed.data.id);
          if (!exists && state.events.length >= MAX_WORKSPACE_EVENTS) {
            throw new Error(`A workspace can contain at most ${MAX_WORKSPACE_EVENTS.toLocaleString()} events.`);
          }
          return {
            events: exists ? state.events : [parsed.data, ...state.events],
            currentEventId: parsed.data.id,
          };
        });
      },
      updateEvent: (eventId, updates) =>
        setDurably((state) => ({
          events: state.events.map((event) => {
            if (event.id !== eventId) return event;
            const { endsAt: _endsAt, locationLabel: _locationLabel, ...base } = event;
            const parsed = EventSchema.safeParse({
              ...base,
              name: updates.name ?? event.name,
              startsAt: updates.startsAt ?? event.startsAt,
              ...(updates.endsAt === undefined && event.endsAt ? { endsAt: event.endsAt } : {}),
              ...(typeof updates.endsAt === "string" ? { endsAt: updates.endsAt } : {}),
              ...(updates.locationLabel === undefined && event.locationLabel ? { locationLabel: event.locationLabel } : {}),
              ...(typeof updates.locationLabel === "string" ? { locationLabel: updates.locationLabel } : {}),
            });
            return parsed.success ? parsed.data : event;
          }),
        })),
      deleteEvent: (eventId) =>
        setDurably((state) => {
          const events = state.events.filter((event) => event.id !== eventId);
          return {
            events,
            actions: state.actions.map((action) => action.eventId === eventId
              ? (({ eventId: _eventId, ...rest }) => ({ ...rest, updatedAt: new Date().toISOString() }))(action)
              : action),
            currentEventId:
              state.currentEventId === eventId
                ? ""
                : state.currentEventId,
          };
        }),
      addMemory: async (memory, actionDrafts) => {
        const drafts = normalizeActionDrafts(actionDrafts ?? memory.nextSteps.map((title) => ({ title })));
        const normalizedMemory = normalizeMemoryForStorage({
          ...memory,
          nextSteps: drafts.map((draft) => draft.title),
        });
        if (!normalizedMemory) return;
        await setDurably((state) => {
          const owner = state.contacts.find((contact) => contact.id === normalizedMemory.contactId);
          if (!owner || owner.timeline.some((item) => item.id === normalizedMemory.id)) return state;
          if (owner.timeline.length >= MAX_TIMELINE_LENGTH) {
            throw new Error(`This person already has ${MAX_TIMELINE_LENGTH.toLocaleString()} memories. Delete one before adding another.`);
          }
          const contacts = state.contacts.map((contact) => {
            if (contact.id !== normalizedMemory.contactId) return contact;
            const timeline = [normalizedMemory, ...contact.timeline];
            return normalizedMemory.source === "public-update"
              ? { ...contact, timeline }
              : contactWithDerivedMemoryFields(contact, timeline);
          });
          assertWorkspaceMemoryLimits(contacts);
          return {
            contacts,
            actions: syncMemoryActions(state.actions, normalizedMemory, drafts),
          };
        });
      },
      updateMemory: (contactId, memoryId, updates, actionDrafts) =>
        setDurably((state) => {
          const contact = state.contacts.find((item) => item.id === contactId);
          const current = contact?.timeline.find((memory) => memory.id === memoryId);
          if (!contact || !current) return state;
          const shouldSyncActions = actionDrafts !== undefined || updates.nextSteps !== undefined;
          const drafts = shouldSyncActions
            ? normalizeActionDrafts(actionDrafts ?? (updates.nextSteps ?? current.nextSteps).map((title) => ({ title })))
            : undefined;
          const normalizedMemory = normalizeMemoryForStorage({
            ...current,
            ...updates,
            ...(drafts ? { nextSteps: drafts.map((draft) => draft.title) } : {}),
            id: current.id,
            contactId: current.contactId,
            createdAt: current.createdAt,
            updatedAt: new Date().toISOString(),
          });
          if (!normalizedMemory) return state;
          const contacts = state.contacts.map((item) => item.id === contactId
              ? contactWithDerivedMemoryFields(item, item.timeline.map((memory) =>
                  memory.id === memoryId ? normalizedMemory : memory))
              : item);
          assertWorkspaceMemoryLimits(contacts);
          return {
            contacts,
            ...(drafts ? { actions: syncMemoryActions(state.actions, normalizedMemory, drafts) } : {}),
          };
        }),
      deleteMemory: (contactId, memoryId) =>
        setDurably((state) => ({
          contacts: state.contacts.map((contact) => {
            if (contact.id !== contactId) return contact;
            const timeline = contact.timeline
              .filter((memory) => memory.id !== memoryId)
              .slice(0, MAX_TIMELINE_LENGTH);
            return contactWithDerivedMemoryFields(contact, timeline);
          }),
          actions: state.actions.filter((action) => action.memoryId !== memoryId),
          relationships: state.relationships.map((relationship) => ({
            ...relationship,
            evidenceMemoryIds: relationship.evidenceMemoryIds.filter((id) => id !== memoryId),
          })),
        })),
      addAction: (action) => {
        const normalized = normalizeActionForStorage(action);
        if (!normalized) return Promise.resolve();
        return setDurably((state) => {
          if (!state.contacts.some((contact) => contact.id === normalized.contactId)) return state;
          if (normalized.eventId && !state.events.some((event) => event.id === normalized.eventId)) return state;
          if (normalized.memoryId && !state.contacts.some((contact) =>
            contact.id === normalized.contactId && contact.timeline.some((memory) => memory.id === normalized.memoryId))) {
            return state;
          }
          if (state.actions.some((item) => item.id === normalized.id)) return state;
          const actions = [...state.actions, normalized];
          assertWorkspaceActionLimit(actions);
          const contacts = normalized.memoryId
            ? contactsWithSyncedMemoryNextSteps(state.contacts, actions, new Set([normalized.memoryId]))
            : state.contacts;
          assertWorkspaceMemoryLimits(contacts);
          return {
            actions,
            ...(normalized.memoryId ? { contacts } : {}),
          };
        });
      },
      updateAction: (actionId, updates) =>
        setDurably((state) => {
          const current = state.actions.find((action) => action.id === actionId);
          if (!current) return state;
          const actions = state.actions.map((action) => {
            if (action.id !== actionId) return action;
            const { dueAt: _dueAt, eventId: _eventId, ...base } = action;
            const normalized = normalizeActionForStorage({
              ...base,
              title: updates.title ?? action.title,
              ...(updates.dueAt === undefined && action.dueAt ? { dueAt: action.dueAt } : {}),
              ...(typeof updates.dueAt === "string" ? { dueAt: updates.dueAt } : {}),
              ...(updates.eventId === undefined && action.eventId ? { eventId: action.eventId } : {}),
              ...(typeof updates.eventId === "string" ? { eventId: updates.eventId } : {}),
              updatedAt: new Date().toISOString(),
            });
            if (!normalized) return action;
            if (normalized.eventId && !state.events.some((event) => event.id === normalized.eventId)) return action;
            return normalized;
          });
          const contacts = current.memoryId
            ? contactsWithSyncedMemoryNextSteps(state.contacts, actions, new Set([current.memoryId]))
            : state.contacts;
          assertWorkspaceMemoryLimits(contacts);
          return {
            actions,
            ...(current.memoryId ? { contacts } : {}),
          };
        }),
      setActionCompleted: (actionId, completed) =>
        setDurably((state) => {
          const current = state.actions.find((action) => action.id === actionId);
          if (!current) return state;
          if (!completed
            && current.status === "completed"
            && current.memoryId
            && state.actions.filter((action) =>
              action.memoryId === current.memoryId && action.status === "open").length >= MAX_OPEN_ACTIONS_PER_MEMORY) {
            throw new Error("This memory already has five open follow-ups. Complete or remove one before reopening another.");
          }
          const now = new Date().toISOString();
          const actions = state.actions.map((action) => {
            if (action.id !== actionId) return action;
            const { completedAt: _completedAt, ...base } = action;
            return {
              ...base,
              status: completed ? "completed" as const : "open" as const,
              ...(completed ? { completedAt: now } : {}),
              updatedAt: now,
            };
          });
          const contacts = current.memoryId
            ? contactsWithSyncedMemoryNextSteps(state.contacts, actions, new Set([current.memoryId]))
            : state.contacts;
          assertWorkspaceMemoryLimits(contacts);
          return {
            actions,
            ...(current.memoryId ? { contacts } : {}),
          };
        }),
      deleteAction: (actionId) => setDurably((state) => {
        const current = state.actions.find((action) => action.id === actionId);
        if (!current) return state;
        const actions = state.actions.filter((action) => action.id !== actionId);
        return {
          actions,
          ...(current.memoryId
            ? { contacts: contactsWithSyncedMemoryNextSteps(state.contacts, actions, new Set([current.memoryId])) }
            : {}),
        };
      }),
      addEntity: (entity) => {
        const parsed = KnowledgeEntitySchema.safeParse(entity);
        if (!parsed.success) return;
        setBestEffort((state) => ({
          entities: state.entities.some((item) => item.id === parsed.data.id)
            ? state.entities
            : [...state.entities, parsed.data],
        }));
      },
      updateEntity: (entityId, updates) =>
        setBestEffort((state) => ({
          entities: state.entities.map((entity) => {
            if (entity.id !== entityId) return entity;
            const parsed = KnowledgeEntitySchema.safeParse({ ...entity, ...updates, updatedAt: new Date().toISOString() });
            return parsed.success ? parsed.data : entity;
          }),
        })),
      deleteEntity: (entityId) =>
        setBestEffort((state) => {
          const deletedRelationshipIds = new Set(state.relationships
            .filter((relationship) => relationship.entityId === entityId)
            .map((relationship) => relationship.id));
          const now = new Date().toISOString();
          return {
            entities: state.entities.filter((entity) => entity.id !== entityId),
            relationships: state.relationships.filter((relationship) => relationship.entityId !== entityId),
            connectionDecisions: state.connectionDecisions.map((decision) =>
              decision.entityId === entityId || (decision.relationshipId && deletedRelationshipIds.has(decision.relationshipId))
                ? { suggestionId: decision.suggestionId, decision: "dismissed" as const, decidedAt: now }
                : decision),
          };
        }),
      addRelationship: (relationship) => {
        const parsed = ContactEntityRelationshipSchema.safeParse(relationship);
        if (!parsed.success) return;
        setBestEffort((state) => {
          if (!state.contacts.some((contact) => contact.id === parsed.data.contactId)) return state;
          if (!state.entities.some((entity) => entity.id === parsed.data.entityId)) return state;
          const owner = state.contacts.find((contact) => contact.id === parsed.data.contactId);
          if (parsed.data.evidenceMemoryIds.some((memoryId) =>
            !owner?.timeline.some((memory) => memory.id === memoryId))) return state;
          return {
            relationships: state.relationships.some((item) => item.id === parsed.data.id)
              ? state.relationships
              : [...state.relationships, parsed.data],
          };
        });
      },
      updateRelationship: (relationshipId, updates) =>
        setBestEffort((state) => ({
          relationships: state.relationships.map((relationship) => {
            if (relationship.id !== relationshipId) return relationship;
            const parsed = ContactEntityRelationshipSchema.safeParse({
              ...relationship,
              ...updates,
              updatedAt: new Date().toISOString(),
            });
            if (!parsed.success) return relationship;
            const owner = state.contacts.find((contact) => contact.id === parsed.data.contactId);
            return parsed.data.evidenceMemoryIds.some((memoryId) =>
              !owner?.timeline.some((memory) => memory.id === memoryId))
              ? relationship
              : parsed.data;
          }),
        })),
      deleteRelationship: (relationshipId) =>
        setBestEffort((state) => {
          const now = new Date().toISOString();
          return {
            relationships: state.relationships.filter((relationship) => relationship.id !== relationshipId),
            connectionDecisions: state.connectionDecisions.map((decision) =>
              decision.relationshipId === relationshipId
                ? { suggestionId: decision.suggestionId, decision: "dismissed" as const, decidedAt: now }
                : decision),
          };
        }),
      setConnectionDecision: (decision) => {
        const parsed = ConnectionSuggestionDecisionSchema.safeParse(decision);
        if (!parsed.success) return;
        setBestEffort((state) => ({
          connectionDecisions: [
            ...state.connectionDecisions.filter((item) => item.suggestionId !== parsed.data.suggestionId),
            parsed.data,
          ],
        }));
      },
      deleteConnectionDecision: (suggestionId) => setBestEffort((state) => ({
        connectionDecisions: state.connectionDecisions.filter((decision) => decision.suggestionId !== suggestionId),
      })),
      acceptConnectionSuggestion: (entity, relationship, decision) => {
        const parsedEntity = KnowledgeEntitySchema.safeParse(entity);
        const parsedRelationship = ContactEntityRelationshipSchema.safeParse(relationship);
        const parsedDecision = ConnectionSuggestionDecisionSchema.safeParse(decision);
        if (!parsedEntity.success || !parsedRelationship.success || !parsedDecision.success) return;
        if (parsedDecision.data.decision !== "accepted"
          || parsedDecision.data.entityId !== parsedEntity.data.id
          || parsedDecision.data.relationshipId !== parsedRelationship.data.id
          || parsedRelationship.data.entityId !== parsedEntity.data.id
          || parsedRelationship.data.source !== "accepted-suggestion"
          || parsedRelationship.data.sourceSuggestionId !== parsedDecision.data.suggestionId) return;
        setBestEffort((state) => {
          if (!state.contacts.some((contact) => contact.id === parsedRelationship.data.contactId)) return state;
          const owner = state.contacts.find((contact) => contact.id === parsedRelationship.data.contactId);
          if (parsedRelationship.data.evidenceMemoryIds.some((memoryId) =>
            !owner?.timeline.some((memory) => memory.id === memoryId))) return state;
          return {
            entities: [
              ...state.entities.filter((item) => item.id !== parsedEntity.data.id),
              parsedEntity.data,
            ],
            relationships: [
              ...state.relationships.filter((item) => item.id !== parsedRelationship.data.id),
              parsedRelationship.data,
            ],
            connectionDecisions: [
              ...state.connectionDecisions.filter((item) => item.suggestionId !== parsedDecision.data.suggestionId),
              parsedDecision.data,
            ],
          };
        });
      },
      addContact: async (contact, eventId) => {
        const normalizedContact = normalizeContactForStorage(contact);
        if (!normalizedContact) return;
        await setDurably((state) => {
          const targetEventId = eventId === null ? "" : eventId ?? state.currentEventId;
          const exists = state.contacts.some((item) => item.id === normalizedContact.id);
          if (!exists && state.contacts.length >= MAX_WORKSPACE_CONTACTS) {
            throw new Error(`A workspace can contain at most ${MAX_WORKSPACE_CONTACTS.toLocaleString()} people.`);
          }
          return {
            contacts: exists ? state.contacts : [...state.contacts, normalizedContact],
            events: state.events.map((event) =>
              event.id === targetEventId
                ? eventWithAddedAttendee(event, normalizedContact.id)
                : event,
            ),
          };
        });
      },
      addContactToEvent: (contactId, eventId) =>
        setDurably((state) => {
          if (!state.contacts.some((contact) => contact.id === contactId)) return state;
          const targetEvent = state.events.find((event) => event.id === eventId);
          if (!targetEvent || targetEvent.attendeeContactIds.includes(contactId)) return state;
          if (targetEvent.attendeeContactIds.length >= MAX_EVENT_ATTENDEES) {
            throw new Error(`An event can contain at most ${MAX_EVENT_ATTENDEES.toLocaleString()} people.`);
          }
          return {
            events: state.events.map((event) =>
              event.id === eventId
                ? eventWithAddedAttendee(event, contactId)
                : event),
          };
        }),
      removeContactFromEvent: (contactId, eventId) =>
        setDurably((state) => ({
          events: state.events.map((event) =>
            event.id === eventId && event.attendeeContactIds.includes(contactId)
              ? {
                  ...event,
                  attendeeContactIds: event.attendeeContactIds.filter((id) => id !== contactId),
                }
              : event,
          ),
        })),
      updateContact: async (contactId, updates) => {
        await setDurably((state) => ({
          contacts: state.contacts.map((contact) => {
            if (contact.id !== contactId) return contact;
            return normalizeContactForStorage({ ...contact, ...updates }) ?? contact;
          }),
        }));
      },
      setConversationTopics: (contactId, conversationTopics) =>
        setDurably((state) => ({
          contacts: state.contacts.map((contact) => {
            if (contact.id !== contactId) return contact;
            return normalizeContactForStorage({ ...contact, conversationTopics }) ?? contact;
          }),
        })),
      setRecognitionEnabled: (contactId, recognitionEnabled) =>
        setBestEffort((state) => ({
          contacts: state.contacts.map((contact) =>
            contact.id === contactId ? { ...contact, recognitionEnabled } : contact,
          ),
        })),
      importContacts: (incoming, eventId) =>
        transactDurably((state) => {
        const targetEventId = eventId === null ? null : eventId ?? state.currentEventId;
        const targetEvent = targetEventId
          ? state.events.find((event) => event.id === targetEventId)
          : undefined;
        if (targetEventId !== null && !targetEvent) {
          return {
            update: null,
            result: { added: 0, linked: 0, skipped: incoming.length },
          };
        }
        if (targetEvent && !EventSchema.safeParse(targetEvent).success) {
          return {
            update: null,
            result: { added: 0, linked: 0, skipped: incoming.length },
          };
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
            existing = contactById.get(existing.id) ?? existing;
            const existingId = existing.id;
            if (contact.sourceId) {
              systemContactLinks[contact.sourceId] = existingId;
              systemLinkedContactIds.add(existingId);
            }
            const existingIndex = contactIndexById.get(existingId);
            const enrichment = importedProfileEnrichment(existing, contact);
            if (existingIndex !== undefined && Object.keys(enrichment).length) {
              const enriched = { ...existing, ...enrichment };
              knownContacts[existingIndex] = enriched;
              contactById.set(existingId, enriched);
              const previousIdentity = importIdentityKey(existing);
              const enrichedIdentity = importIdentityKey(enriched);
              if (firstByIdentity.get(previousIdentity)?.id === existingId) {
                firstByIdentity.set(previousIdentity, enriched);
              }
              if (!firstByIdentity.has(enrichedIdentity)
                || firstByIdentity.get(enrichedIdentity)?.id === existingId) {
                firstByIdentity.set(enrichedIdentity, enriched);
              }
              for (const identity of new Set([previousIdentity, enrichedIdentity])) {
                const unlinked = unlinkedByIdentity.get(identity);
                if (unlinked?.some((candidate) => candidate.id === existingId)) {
                  unlinkedByIdentity.set(identity, unlinked.map((candidate) =>
                    candidate.id === existingId ? enriched : candidate));
                }
              }
              existing = enriched;
            }
            if (targetEvent && !attendeeIds.has(existing.id)) {
              if (attendeeIds.size >= MAX_EVENT_ATTENDEES) {
                skipped += 1;
              } else {
                attendeeIds.add(existing.id);
                linked += 1;
              }
            } else {
              skipped += 1;
            }
            continue;
          }
          if (targetEvent && attendeeIds.size >= MAX_EVENT_ATTENDEES) {
            skipped += 1;
            continue;
          }
          if (knownContacts.length >= MAX_WORKSPACE_CONTACTS) {
            skipped += 1;
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
        let events = state.events;
        if (targetEvent) {
          const parsedEvent = EventSchema.safeParse({
            ...targetEvent,
            attendeeContactIds: [...attendeeIds],
          });
          if (!parsedEvent.success) {
            return {
              update: null,
              result: { added: 0, linked: 0, skipped: incoming.length },
            };
          }
          events = state.events.map((event) =>
            event.id === parsedEvent.data.id ? parsedEvent.data : event);
        }
        if (incoming.length) {
          assertWorkspaceMemoryLimits(knownContacts);
        }
        return {
          update: incoming.length
            ? {
                contacts: knownContacts,
                systemContactLinks,
                events,
              }
            : null,
          result: { added, linked, skipped },
        };
      }),
      deleteContact: async (contactId) => {
        await setDurably((state) => {
          const systemContactLinks = Object.fromEntries(
            Object.entries(state.systemContactLinks).filter(([, linkedContactId]) => linkedContactId !== contactId),
          );
          const deletedRelationshipIds = new Set(state.relationships
            .filter((relationship) => relationship.contactId === contactId)
            .map((relationship) => relationship.id));
          return {
            contacts: state.contacts.filter((contact) => contact.id !== contactId),
            events: state.events.map((event) => ({
              ...event,
              attendeeContactIds: event.attendeeContactIds.filter((id) => id !== contactId),
            })),
            actions: state.actions.filter((action) => action.contactId !== contactId),
            relationships: state.relationships.filter((relationship) => relationship.contactId !== contactId),
            connectionDecisions: state.connectionDecisions.filter((decision) =>
              !decision.relationshipId || !deletedRelationshipIds.has(decision.relationshipId)),
            systemContactLinks,
          };
        });
      },
      resetSample: async () => {
        await setDurably({
            contacts: seededContacts,
            events: seededEvents,
            actions: legacyActionsFromContacts(seededContacts),
            entities: [],
            relationships: [],
            connectionDecisions: [],
            currentEventId: seededEvents[0]?.id ?? "",
            hasSeenOnboarding: true,
            updateWatchUsed: false,
            systemContactLinks: {},
        });
      },
      replaceBundle: async (bundle) => {
        await setDurably({
            contacts: bundle.contacts,
            events: bundle.events,
            actions: legacyActionsFromContacts(bundle.contacts),
            entities: [],
            relationships: [],
            connectionDecisions: [],
            currentEventId: bundle.events[0]?.id ?? "",
            hasSeenOnboarding: true,
            updateWatchUsed: false,
            systemContactLinks: {},
        });
      },
      commitWorkspaceRestore: async (workspace) => {
        let previousContacts: Contact[] = [];
        await setDurably((state) => {
          previousContacts = state.contacts;
          return {
            ...workspace,
            currentEventId: workspace.events[0]?.id ?? "",
            hasSeenOnboarding: true,
            updateWatchUsed: false,
            systemContactLinks: {},
            hydrationError: null,
          };
        });
        return { contacts: previousContacts };
      },
      deleteAllData: async () => {
        await setDurably({
            contacts: [],
            events: [],
            actions: [],
            entities: [],
            relationships: [],
            connectionDecisions: [],
            currentEventId: "",
            appLockEnabled: false,
            localToolsEnabled: false,
            updateWatchUsed: false,
            hasSeenOnboarding: false,
            hasSeenContactImportPrompt: false,
            hydrationError: null,
            systemContactLinks: {},
        });
      },
      exportBundle: () => ({
        version: 1,
        exportedAt: new Date().toISOString(),
        contacts: get().contacts,
        events: get().events,
      }),
      };
    },
    {
      name: "context-memory-store-v1",
      storage: createJSONStorage(() => appStoreStorage),
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
        actions: state.actions,
        entities: state.entities,
        relationships: state.relationships,
        connectionDecisions: state.connectionDecisions,
        systemContactLinks: state.systemContactLinks,
      }),
      version: 3,
      migrate: (persisted, version) => {
        if (!Number.isInteger(version) || version < 0 || version > 2) {
          throw new Error("Stored workspace version is not supported by this Context build.");
        }
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
          actions: version < 3
            ? legacyActionsFromContacts(legacy.contacts ?? [])
            : legacy.actions ?? [],
          entities: legacy.entities ?? [],
          relationships: legacy.relationships ?? [],
          connectionDecisions: legacy.connectionDecisions ?? [],
          systemContactLinks: legacy.systemContactLinks ?? {},
        } as AppState;
      },
    },
  ),
);

function setTransientAppState(update: Partial<AppState>): void {
  persistenceSuppressionDepth += 1;
  try {
    useAppStore.setState(update);
  } finally {
    persistenceSuppressionDepth -= 1;
  }
}

async function rehydrateWithoutPersistence(): Promise<boolean> {
  const writesBeforeRehydrate = suppressedPersistenceWriteCount;
  persistenceSuppressionDepth += 1;
  try {
    await useAppStore.persist.rehydrate();
  } finally {
    persistenceSuppressionDepth -= 1;
  }
  return suppressedPersistenceWriteCount > writesBeforeRehydrate;
}

async function setValidatedHydratedAppState(update: Partial<AppState>): Promise<void> {
  // Zustand's persist middleware returns the storage promise at runtime even
  // though the public setState type is void. Promise.resolve preserves that
  // runtime promise so a failed post-validation migration write is surfaced.
  await Promise.resolve(useAppStore.setState(update));
}

export async function hydrateAppStore(): Promise<void> {
  try {
    // Zustand normally writes migrated legacy state before rehydrate resolves.
    // Suppress that implicit write until Context has validated the complete
    // workspace and every cross-reference below.
    const migrationWriteWasSuppressed = await rehydrateWithoutPersistence();
    // Zustand reports storage/JSON hydration failures to its callback instead
    // of rejecting rehydrate(). `hasHydrated` is the authoritative result.
    if (!useAppStore.persist.hasHydrated()) {
      throw new Error("Stored workspace could not be read.");
    }
    const state = useAppStore.getState();
    const parsed = ExportBundleSchema.safeParse({
      version: 1,
      exportedAt: new Date().toISOString(),
      contacts: state.contacts,
      events: state.events,
    });
    if (!parsed.success) throw new Error("Stored workspace is invalid.");
    const actions = (state.actions ?? []).map((action) => ActionItemSchema.parse(action));
    const entities = (state.entities ?? []).map((entity) => KnowledgeEntitySchema.parse(entity));
    const relationships = (state.relationships ?? []).map((relationship) =>
      ContactEntityRelationshipSchema.parse(relationship));
    const connectionDecisions = (state.connectionDecisions ?? []).map((decision) =>
      ConnectionSuggestionDecisionSchema.parse(decision));
    const currentEventId = state.currentEventId === ""
      ? ""
      : state.events.some((event) => event.id === state.currentEventId)
        ? state.currentEventId
        : state.events[0]?.id ?? "";
    const contactIds = new Set(state.contacts.map((contact) => contact.id));
    const eventIds = new Set(state.events.map((event) => event.id));
    const memoryOwnerById = new Map(state.contacts.flatMap((contact) =>
      contact.timeline.map((memory) => [memory.id, contact.id] as const)));
    const entityIds = new Set(entities.map((entity) => entity.id));
    const relationshipIds = new Set(relationships.map((relationship) => relationship.id));
    if (actions.some((action) =>
      !contactIds.has(action.contactId)
      || (action.eventId ? !eventIds.has(action.eventId) : false)
      || (action.memoryId ? memoryOwnerById.get(action.memoryId) !== action.contactId : false))) {
      throw new Error("Stored actions are invalid.");
    }
    if (relationships.some((relationship) =>
      !contactIds.has(relationship.contactId)
      || !entityIds.has(relationship.entityId)
      || relationship.evidenceMemoryIds.some((memoryId) => memoryOwnerById.get(memoryId) !== relationship.contactId))) {
      throw new Error("Stored relationships are invalid.");
    }
    if (connectionDecisions.some((decision) => decision.decision === "accepted"
      && (!decision.entityId
        || !entityIds.has(decision.entityId)
        || !decision.relationshipId
        || !relationshipIds.has(decision.relationshipId)))) {
      throw new Error("Stored connection decisions are invalid.");
    }
    const systemContactLinks = Object.fromEntries(
      Object.entries(state.systemContactLinks).filter(([, contactId]) => contactIds.has(contactId)),
    );
    const hydratedState: Partial<AppState> = {
      hydrated: true,
      hydrationError: null,
      contacts: parsed.data.contacts,
      events: parsed.data.events,
      actions,
      entities,
      relationships,
      connectionDecisions,
      currentEventId,
      systemContactLinks,
    };
    if (migrationWriteWasSuppressed) {
      // Persist a legacy migration exactly once, and only after validation.
      await setValidatedHydratedAppState(hydratedState);
    } else {
      setTransientAppState(hydratedState);
    }
  } catch {
    setTransientAppState({
      hydrated: true,
      hydrationError: "Your saved workspace could not be opened. You can start again without changing any backup file you created.",
    });
  }
}
