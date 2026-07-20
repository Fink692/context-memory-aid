import { z } from "zod";

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const emptyToUndefined = (value: unknown) =>
  value === null || (typeof value === "string" && value.trim().length === 0)
    ? undefined
    : value;
const optionalNormalizedText = (max: number) => z.preprocess(
  emptyToUndefined,
  boundedText(max).optional(),
);
const optionalEmail = z.preprocess(
  emptyToUndefined,
  z.string().trim().max(254).pipe(z.email()).optional(),
);
const optionalPhone = z.preprocess(
  emptyToUndefined,
  boundedText(40).refine((value) => /\d/.test(value), {
    message: "Phone numbers must contain at least one digit.",
  }).optional(),
);
const optionalHttpsUrl = z.url().max(2_048).refine((value) => value.startsWith("https://"), {
  message: "Only HTTPS provenance URLs are supported.",
}).optional();
const optionalNormalizedHttpsUrl = z.preprocess(
  emptyToUndefined,
  z.url().max(2_048).refine((value) => value.startsWith("https://"), {
    message: "Only HTTPS URLs are supported.",
  }).optional(),
);
const optionalLocalPhotoUri = z.preprocess(
  emptyToUndefined,
  z.url().max(2_048).refine((value) => {
    const normalized = value.toLocaleLowerCase();
    return normalized.startsWith("file://") || normalized.startsWith("content://");
  }, {
    message: "Photos must use a supported file or content URI.",
  }).optional(),
);

export const SocialLinkSchema = z.object({
  platform: boundedText(40),
  handle: optionalNormalizedText(100),
  url: optionalNormalizedHttpsUrl,
}).refine((link) => Boolean(link.handle || link.url), {
  message: "A social link needs a handle or HTTPS URL.",
});

export const MemorySchema = z.object({
  id: boundedText(80),
  contactId: boundedText(80),
  summary: boundedText(500),
  details: optionalText(4_000),
  tags: z.array(boundedText(40)).max(8).default([]),
  nextSteps: z.array(boundedText(160)).max(5).default([]),
  source: z.enum(["voice", "text", "import", "seed", "public-update"]),
  sourceLabel: optionalText(120),
  sourceUrl: optionalHttpsUrl,
  occurredAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime().optional(),
});

export const MemoryDraftSchema = z.object({
  summary: boundedText(500),
  extractedFacts: z.array(boundedText(240)).max(8).default([]),
  suggestedTags: z.array(boundedText(40)).max(8).default([]),
  suggestedFollowUps: z.array(boundedText(160)).max(5).default([]),
  confidence: z.number().min(0).max(1),
});

export const ContactSchema = z.object({
  id: boundedText(80),
  badgeId: z.string().trim().min(16).max(80).optional(),
  displayName: boundedText(100),
  company: optionalText(120),
  role: optionalText(120),
  email: optionalEmail,
  phone: optionalPhone,
  socialLinks: z.array(SocialLinkSchema).max(12).optional(),
  photoUri: optionalLocalPhotoUri,
  metAt: optionalText(160),
  relationshipContext: optionalNormalizedText(500),
  lastSpokeAt: z.iso.datetime().optional(),
  lastDiscussed: optionalText(240),
  recentUpdate: optionalText(240),
  conversationTopics: z.array(boundedText(160)).max(8).default([]),
  recognitionEnabled: z.boolean().default(false),
  timeline: z.array(MemorySchema).max(500).default([]),
});

export const MAX_EVENT_ATTENDEES = 5_000;

const EventObjectSchema = z.object({
  id: boundedText(80),
  name: boundedText(160),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().optional(),
  locationLabel: optionalText(160),
  attendeeContactIds: z.array(boundedText(80)).max(MAX_EVENT_ATTENDEES),
});

export const EventSchema = EventObjectSchema.superRefine((event, context) => {
  if (event.endsAt && event.endsAt < event.startsAt) {
    context.addIssue({
      code: "custom",
      message: "An event cannot end before it starts.",
      path: ["endsAt"],
    });
  }
});

export const ActionItemSchema = z.object({
  id: boundedText(80),
  contactId: boundedText(80),
  memoryId: boundedText(80).optional(),
  eventId: boundedText(80).optional(),
  title: boundedText(160),
  dueAt: z.iso.datetime().optional(),
  status: z.enum(["open", "completed"]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().optional(),
}).superRefine((action, context) => {
  if (action.status === "completed" && !action.completedAt) {
    context.addIssue({
      code: "custom",
      message: "Completed actions need a completion date.",
      path: ["completedAt"],
    });
  }
  if (action.status === "open" && action.completedAt) {
    context.addIssue({
      code: "custom",
      message: "Open actions cannot have a completion date.",
      path: ["completedAt"],
    });
  }
});

export const KnowledgeEntityKindSchema = z.enum(["project", "idea", "organization"]);

export const KnowledgeEntitySchema = z.object({
  id: boundedText(80),
  kind: KnowledgeEntityKindSchema,
  name: boundedText(160),
  notes: optionalText(500),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const ContactEntityRelationshipKindSchema = z.enum([
  "works_at",
  "works_on",
  "interested_in",
  "discussed",
  "custom",
]);

export const ContactEntityRelationshipSchema = z.object({
  id: boundedText(80),
  contactId: boundedText(80),
  entityId: boundedText(80),
  kind: ContactEntityRelationshipKindSchema,
  label: optionalText(80),
  evidenceMemoryIds: z.array(boundedText(80)).max(50).default([]),
  source: z.enum(["manual", "accepted-suggestion"]),
  sourceSuggestionId: boundedText(300).optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).superRefine((relationship, context) => {
  if (relationship.source === "accepted-suggestion" && !relationship.sourceSuggestionId) {
    context.addIssue({
      code: "custom",
      message: "Accepted suggestions need their source suggestion ID.",
      path: ["sourceSuggestionId"],
    });
  }
});

export const ConnectionSuggestionDecisionSchema = z.object({
  suggestionId: boundedText(300),
  decision: z.enum(["accepted", "dismissed"]),
  entityId: boundedText(80).optional(),
  relationshipId: boundedText(80).optional(),
  decidedAt: z.iso.datetime(),
}).superRefine((decision, context) => {
  if (decision.decision === "accepted" && (!decision.entityId || !decision.relationshipId)) {
    context.addIssue({
      code: "custom",
      message: "Accepted suggestions need an entity and relationship.",
      path: ["decision"],
    });
  }
});

export const ContactContextSchema = ContactSchema.omit({
  badgeId: true,
  photoUri: true,
  recognitionEnabled: true,
});

export const MemoryExtractionRequestSchema = z.object({
  transcript: boundedText(4_000),
  contact: ContactContextSchema,
  event: EventObjectSchema.pick({ id: true, name: true, startsAt: true }).optional(),
});

export const TopicSuggestionRequestSchema = z.object({
  contact: ContactContextSchema,
  event: EventObjectSchema.pick({ id: true, name: true, startsAt: true }).optional(),
});

export const TopicSuggestionSchema = z.object({
  topics: z.array(boundedText(160)).min(1).max(4),
});

export const LocalModelHealthSchema = z.object({
  ok: z.boolean(),
  provider: z.enum(["ollama", "litert-lm", "rules"]),
  model: boundedText(120),
  status: z.enum(["ready", "model-missing", "runtime-unavailable"]),
  message: boundedText(500),
});

export const LocalMemoryDraftResponseSchema = z.object({
  model: boundedText(120),
  draft: MemoryDraftSchema,
});

export const LocalTopicSuggestionResponseSchema = z.object({
  model: boundedText(120),
  topics: z.array(boundedText(160)).min(1).max(4),
});

export const ImportContactSchema = z.object({
  sourceId: boundedText(300).optional(),
  displayName: boundedText(100),
  company: optionalText(120),
  role: optionalText(120),
  email: optionalEmail,
  phone: optionalPhone,
  socialLinks: z.array(SocialLinkSchema).max(12).optional(),
  photoUri: optionalLocalPhotoUri,
  metAt: optionalText(160),
  relationshipContext: optionalNormalizedText(500),
  lastSpokeAt: z.iso.datetime().optional(),
  notes: optionalText(1_000),
});

const optionalDraftText = (max: number) => z.preprocess(
  emptyToUndefined,
  boundedText(max).optional(),
);

export const ContactDraftSchema = z.object({
  displayName: optionalDraftText(100),
  company: optionalDraftText(120),
  role: optionalDraftText(120),
  email: optionalEmail,
  phone: optionalPhone,
  metAt: optionalDraftText(160),
  relationshipContext: optionalDraftText(500),
  notes: optionalDraftText(1_000),
  socialLinks: z.preprocess(
    (value) => value === null ? undefined : value,
    z.array(SocialLinkSchema).max(12).default([]),
  ),
  photoUri: optionalLocalPhotoUri,
}).refine((draft) => Boolean(
  draft.displayName
  || draft.company
  || draft.role
  || draft.email
  || draft.phone
  || draft.metAt
  || draft.relationshipContext
  || draft.notes
  || draft.socialLinks.length
), {
  message: "A contact draft needs at least one meaningful profile field.",
});

export const ContactDraftRequestSchema = z.object({
  transcript: boundedText(4_000),
});

export const LocalContactDraftResponseSchema = z.object({
  model: boundedText(120),
  draft: ContactDraftSchema,
});

export const MAX_WORKSPACE_CONTACTS = 10_000;
export const MAX_WORKSPACE_EVENTS = 10_000;
export const MAX_WORKSPACE_ACTIONS = 50_000;
export const MAX_WORKSPACE_MEMORIES = 50_000;
export const MAX_WORKSPACE_MEMORY_NEXT_STEPS = 50_000;

export function workspaceAggregateLimitMessages(
  contacts: readonly { timeline: readonly { nextSteps: readonly unknown[] }[] }[],
  limits: { memories: number; memoryNextSteps: number } = {
    memories: MAX_WORKSPACE_MEMORIES,
    memoryNextSteps: MAX_WORKSPACE_MEMORY_NEXT_STEPS,
  },
): string[] {
  let memories = 0;
  let memoryNextSteps = 0;
  for (const contact of contacts) {
    memories += contact.timeline.length;
    for (const memory of contact.timeline) memoryNextSteps += memory.nextSteps.length;
  }
  return [
    ...(memories > limits.memories
      ? [`Workspaces can contain at most ${limits.memories.toLocaleString()} ${limits.memories === 1 ? "memory" : "memories"}.`]
      : []),
    ...(memoryNextSteps > limits.memoryNextSteps
      ? [`Workspace memories can contain at most ${limits.memoryNextSteps.toLocaleString()} follow-up ${limits.memoryNextSteps === 1 ? "reference" : "references"}.`]
      : []),
  ];
}

export const ExportBundleSchema = z.object({
  version: z.literal(1),
  exportedAt: z.iso.datetime(),
  contacts: z.array(ContactSchema).max(MAX_WORKSPACE_CONTACTS),
  events: z.array(EventSchema).max(MAX_WORKSPACE_EVENTS),
}).superRefine((bundle, context) => {
  const contactIds = new Set<string>();
  const badgeIds = new Set<string>();
  const memoryIds = new Set<string>();
  bundle.contacts.forEach((contact, contactIndex) => {
    if (contactIds.has(contact.id)) {
      context.addIssue({
        code: "custom",
        message: "Contact IDs must be unique.",
        path: ["contacts", contactIndex, "id"],
      });
    }
    contactIds.add(contact.id);
    if (contact.badgeId) {
      if (badgeIds.has(contact.badgeId)) {
        context.addIssue({
          code: "custom",
          message: "Badge IDs must be unique.",
          path: ["contacts", contactIndex, "badgeId"],
        });
      }
      badgeIds.add(contact.badgeId);
    }

    contact.timeline.forEach((memory, memoryIndex) => {
      if (memory.contactId !== contact.id) {
        context.addIssue({
          code: "custom",
          message: "Each memory must belong to its containing contact.",
          path: ["contacts", contactIndex, "timeline", memoryIndex, "contactId"],
        });
      }
      if (memoryIds.has(memory.id)) {
        context.addIssue({
          code: "custom",
          message: "Memory IDs must be unique.",
          path: ["contacts", contactIndex, "timeline", memoryIndex, "id"],
        });
      }
      memoryIds.add(memory.id);
    });
  });

  workspaceAggregateLimitMessages(bundle.contacts).forEach((message) => {
    context.addIssue({
      code: "custom",
      message,
      path: ["contacts"],
    });
  });

  const eventIds = new Set<string>();
  bundle.events.forEach((event, eventIndex) => {
    if (eventIds.has(event.id)) {
      context.addIssue({
        code: "custom",
        message: "Event IDs must be unique.",
        path: ["events", eventIndex, "id"],
      });
    }
    eventIds.add(event.id);

    const attendeeIds = new Set<string>();
    event.attendeeContactIds.forEach((contactId, attendeeIndex) => {
      if (attendeeIds.has(contactId)) {
        context.addIssue({
          code: "custom",
          message: "An event cannot contain the same attendee more than once.",
          path: ["events", eventIndex, "attendeeContactIds", attendeeIndex],
        });
      }
      if (!contactIds.has(contactId)) {
        context.addIssue({
          code: "custom",
          message: "Every event attendee must reference a saved contact.",
          path: ["events", eventIndex, "attendeeContactIds", attendeeIndex],
        });
      }
      attendeeIds.add(contactId);
    });
  });
});

export type Memory = z.infer<typeof MemorySchema>;
export type MemoryDraft = z.infer<typeof MemoryDraftSchema>;
export type Contact = z.infer<typeof ContactSchema>;
export type ContactContext = z.infer<typeof ContactContextSchema>;
export type ContactDraft = z.infer<typeof ContactDraftSchema>;
export type Event = z.infer<typeof EventSchema>;
export type ActionItem = z.infer<typeof ActionItemSchema>;
export type KnowledgeEntityKind = z.infer<typeof KnowledgeEntityKindSchema>;
export type KnowledgeEntity = z.infer<typeof KnowledgeEntitySchema>;
export type ContactEntityRelationshipKind = z.infer<typeof ContactEntityRelationshipKindSchema>;
export type ContactEntityRelationship = z.infer<typeof ContactEntityRelationshipSchema>;
export type ConnectionSuggestionDecision = z.infer<typeof ConnectionSuggestionDecisionSchema>;
export type ImportContact = z.infer<typeof ImportContactSchema>;
export type SocialLink = z.infer<typeof SocialLinkSchema>;
export type ExportBundle = z.infer<typeof ExportBundleSchema>;
export type LocalModelHealth = z.infer<typeof LocalModelHealthSchema>;

export function toContactContext(contact: Contact): ContactContext {
  const {
    badgeId: _badgeId,
    photoUri: _photoUri,
    recognitionEnabled: _recognitionEnabled,
    ...context
  } = contact;
  return context;
}
