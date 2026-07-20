import { describe, expect, it } from "vitest";
import {
  createLocalConversationTopics,
  createLocalMemoryDraft,
  ActionItemSchema,
  ConnectionSuggestionDecisionSchema,
  ContactEntityRelationshipSchema,
  ContactDraftRequestSchema,
  ContactDraftSchema,
  ContactSchema,
  evaluateFaceMatch,
  EventSchema,
  ExportBundleSchema,
  filterEventCandidates,
  MemorySchema,
  KnowledgeEntitySchema,
  LocalContactDraftResponseSchema,
  MAX_EVENT_ATTENDEES,
  parseAttendeeCsv,
  seededContacts,
  seededEvents,
  toContactContext,
  WatchSourceInputSchema,
  WatchUpdateSchema,
  WorkspaceBackupSchema,
  WorkspaceBackupV2Schema,
  workspaceAggregateLimitMessages,
} from "./index";

function validBundle() {
  return {
    version: 1,
    exportedAt: "2026-07-10T12:00:00.000Z",
    contacts: [{
      id: "contact-one",
      displayName: "Taylor Reed",
      conversationTopics: [],
      recognitionEnabled: true,
      timeline: [{
        id: "memory-one",
        contactId: "contact-one",
        summary: "Taylor launched a public project.",
        tags: ["public-update"],
        nextSteps: [],
        source: "public-update",
        sourceLabel: "Taylor's blog",
        sourceUrl: "https://example.com/taylor/project",
        occurredAt: "2026-07-09T12:00:00.000Z",
        createdAt: "2026-07-10T12:00:00.000Z",
      }],
    }],
    events: [{
      id: "event-one",
      name: "Test event",
      startsAt: "2026-07-10T18:00:00.000Z",
      attendeeContactIds: ["contact-one"],
    }],
  };
}

function validWorkspaceBackupV2() {
  return {
    version: 2 as const,
    exportedAt: "2026-07-10T12:00:00.000Z",
    contacts: [{
      id: "contact-one",
      displayName: "Taylor Reed",
      conversationTopics: [],
      timeline: [{
        id: "memory-one",
        contactId: "contact-one",
        summary: "Taylor launched a public project.",
        tags: ["public-update"],
        nextSteps: ["Send a note"],
        source: "public-update" as const,
        occurredAt: "2026-07-09T12:00:00.000Z",
        createdAt: "2026-07-10T12:00:00.000Z",
      }],
      photoAssetId: "photo-one",
    }],
    events: [{
      id: "event-one",
      name: "Test event",
      startsAt: "2026-07-10T18:00:00.000Z",
      attendeeContactIds: ["contact-one"],
    }],
    actions: [{
      id: "action-one",
      contactId: "contact-one",
      memoryId: "memory-one",
      eventId: "event-one",
      title: "Send a note",
      status: "open" as const,
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T12:00:00.000Z",
    }],
    entities: [{
      id: "entity-one",
      kind: "project" as const,
      name: "Project Northstar",
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T12:00:00.000Z",
    }],
    relationships: [{
      id: "relationship-one",
      contactId: "contact-one",
      entityId: "entity-one",
      kind: "works_on" as const,
      evidenceMemoryIds: ["memory-one"],
      source: "accepted-suggestion" as const,
      sourceSuggestionId: "suggestion-one",
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T12:00:00.000Z",
    }],
    connectionDecisions: [{
      suggestionId: "suggestion-one",
      decision: "accepted" as const,
      entityId: "entity-one",
      relationshipId: "relationship-one",
      decidedAt: "2026-07-10T12:00:00.000Z",
    }],
    photoAssets: [{
      id: "photo-one",
      fileName: "profile-1.jpg",
      mediaType: "image/jpeg" as const,
      base64: "/9j/",
    }],
  };
}

describe("event-bounded matching", () => {
  it("excludes saved contacts who are not attending", () => {
    const badgeReadyContacts = seededContacts.map((contact) => ({
      ...contact,
      ...(contact.id !== "sam-rivera" ? { badgeId: `sample-badge-${contact.id}` } : {}),
    }));
    const candidates = filterEventCandidates(badgeReadyContacts, seededEvents[0]!);
    expect(candidates.map((contact) => contact.id)).toEqual([
      "jordan-patel",
      "alex-morgan",
      "maya-chen",
    ]);
  });

  it("excludes attendees until they have an actual badge credential", () => {
    expect(filterEventCandidates(seededContacts, seededEvents[0]!)).toEqual([]);
  });

  it("returns no match below threshold", () => {
    const result = evaluateFaceMatch(
      [1, 0],
      [{ contactId: "jordan-patel", embedding: [0, 1] }],
    );
    expect(result.status).toBe("no_match");
  });

  it("refuses an ambiguous match", () => {
    const result = evaluateFaceMatch(
      [1, 0],
      [
        { contactId: "a", embedding: [1, 0] },
        { contactId: "b", embedding: [0.999, 0.001] },
      ],
    );
    expect(result.status).toBe("ambiguous");
  });
});

describe("closed-loop relationship records", () => {
  it("validates event time ranges", () => {
    expect(EventSchema.safeParse({
      id: "event-valid",
      name: "Valid event",
      startsAt: "2026-07-10T18:00:00.000Z",
      endsAt: "2026-07-10T20:00:00.000Z",
      attendeeContactIds: [],
    }).success).toBe(true);
    expect(EventSchema.safeParse({
      id: "event-invalid",
      name: "Invalid event",
      startsAt: "2026-07-10T20:00:00.000Z",
      endsAt: "2026-07-10T18:00:00.000Z",
      attendeeContactIds: [],
    }).success).toBe(false);
  });

  it("accepts 5,000 event attendees and rejects 5,001", () => {
    const attendeeContactIds = Array.from(
      { length: MAX_EVENT_ATTENDEES },
      (_, index) => `contact-${index}`,
    );
    const base = {
      id: "event-capacity",
      name: "Capacity event",
      startsAt: "2026-07-10T18:00:00.000Z",
    };

    expect(EventSchema.safeParse({ ...base, attendeeContactIds }).success).toBe(true);
    expect(EventSchema.safeParse({
      ...base,
      attendeeContactIds: [...attendeeContactIds, "contact-overflow"],
    }).success).toBe(false);
  });

  it("requires action completion state and date to agree", () => {
    const base = {
      id: "action-one",
      contactId: "contact-one",
      title: "Send notes",
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T12:00:00.000Z",
    };
    expect(ActionItemSchema.safeParse({ ...base, status: "open" }).success).toBe(true);
    expect(ActionItemSchema.safeParse({ ...base, status: "completed" }).success).toBe(false);
    expect(ActionItemSchema.safeParse({
      ...base,
      status: "completed",
      completedAt: "2026-07-10T13:00:00.000Z",
    }).success).toBe(true);
  });

  it("keeps accepted suggestions traceable to their saved relationship", () => {
    expect(KnowledgeEntitySchema.safeParse({
      id: "entity-one",
      kind: "organization",
      name: "Northstar",
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T12:00:00.000Z",
    }).success).toBe(true);
    expect(ContactEntityRelationshipSchema.safeParse({
      id: "relationship-one",
      contactId: "contact-one",
      entityId: "entity-one",
      kind: "works_at",
      evidenceMemoryIds: [],
      source: "accepted-suggestion",
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T12:00:00.000Z",
    }).success).toBe(false);
    expect(ConnectionSuggestionDecisionSchema.safeParse({
      suggestionId: "company:northstar",
      decision: "accepted",
      decidedAt: "2026-07-10T12:00:00.000Z",
    }).success).toBe(false);
  });
});

describe("CSV import", () => {
  it("parses minimal contacts and quoted commas", () => {
    const result = parseAttendeeCsv(
      'name,company,notes\n"Jordan Patel",Stripe,"Developer tools, running"',
    );
    expect(result.errors).toEqual([]);
    expect(result.contacts[0]).toMatchObject({
      displayName: "Jordan Patel",
      company: "Stripe",
      notes: "Developer tools, running",
    });
  });

  it("reports an invalid date without crashing the import", () => {
    const result = parseAttendeeCsv("name,lastSpoke\nJordan Patel,not-a-date");
    expect(result.contacts).toEqual([]);
    expect(result.errors[0]).toContain("not a valid date");
  });

  it("rejects an unclosed quoted field", () => {
    const result = parseAttendeeCsv('name,notes\nJordan,"unfinished');
    expect(result.contacts).toEqual([]);
    expect(result.errors).toEqual(["CSV contains an unclosed quoted field."]);
  });

  it("imports richer profile details without requiring an event", () => {
    const result = parseAttendeeCsv([
      "name,email,phone,relationship,socialPlatform,socialHandle,socialUrl",
      "Avery Chen,avery@example.com,+12045550123,Neighbour,LinkedIn,avery-chen,https://linkedin.com/in/avery-chen",
    ].join("\n"));

    expect(result.errors).toEqual([]);
    expect(result.contacts[0]).toMatchObject({
      displayName: "Avery Chen",
      email: "avery@example.com",
      phone: "+12045550123",
      relationshipContext: "Neighbour",
      socialLinks: [{
        platform: "LinkedIn",
        handle: "avery-chen",
        url: "https://linkedin.com/in/avery-chen",
      }],
    });
  });
});

describe("richer person profiles", () => {
  it("keeps old saved people valid while accepting bounded contact details", () => {
    expect(ContactSchema.safeParse({
      id: "legacy-person",
      displayName: "Legacy Person",
    }).success).toBe(true);

    const contact = ContactSchema.parse({
      id: "avery-chen",
      displayName: "Avery Chen",
      email: "avery@example.com",
      phone: "+1 204 555 0123",
      photoUri: "file:///app/photos/avery.jpg",
      relationshipContext: "Neighbour I often see at the grocery store.",
      socialLinks: [{
        platform: "LinkedIn",
        url: "https://linkedin.com/in/avery-chen",
      }],
    });

    expect(contact.email).toBe("avery@example.com");
    expect(contact.socialLinks).toHaveLength(1);
  });

  it("rejects unsafe or unusable contact details", () => {
    expect(ContactSchema.safeParse({
      id: "bad-email",
      displayName: "Bad Email",
      email: "not-an-email",
    }).success).toBe(false);
    expect(ContactSchema.safeParse({
      id: "bad-phone",
      displayName: "Bad Phone",
      phone: "extension only",
    }).success).toBe(false);
    expect(ContactSchema.safeParse({
      id: "remote-photo",
      displayName: "Remote Photo",
      photoUri: "https://example.com/photo.jpg",
    }).success).toBe(false);
    expect(ContactSchema.safeParse({
      id: "insecure-social",
      displayName: "Insecure Social",
      socialLinks: [{ platform: "LinkedIn", url: "http://example.com/person" }],
    }).success).toBe(false);
  });

  it("normalizes partial model drafts and rejects photo-only output", () => {
    const draft = ContactDraftSchema.parse({
      displayName: null,
      company: "  ",
      email: "avery@example.com",
      phone: null,
      socialLinks: null,
    });
    expect(draft).toMatchObject({ email: "avery@example.com", socialLinks: [] });
    expect(draft.displayName).toBeUndefined();
    expect(draft.company).toBeUndefined();

    expect(ContactDraftSchema.safeParse({
      photoUri: "file:///app/photos/unidentified.jpg",
    }).success).toBe(false);
    expect(ContactDraftRequestSchema.safeParse({ transcript: "Met Avery at the store." }).success).toBe(true);
    expect(LocalContactDraftResponseSchema.safeParse({
      model: "Gemma",
      draft: { notes: "Likes gardening." },
    }).success).toBe(true);
  });
});

describe("local intelligence", () => {
  it("creates a useful draft without a network service", () => {
    const transcript =
      "Alex accepted a new job in New York and is hiring AI engineers.";
    const draft = createLocalMemoryDraft(transcript);
    expect(draft.summary).toContain("New York");
    expect(draft.suggestedTags).toEqual(expect.arrayContaining(["career", "hiring", "location"]));
    expect(draft.suggestedFollowUps).toContain("Offer a relevant introduction");
  });

  it("derives bounded prompts from saved local context", () => {
    const topics = createLocalConversationTopics(seededContacts[0]!, seededEvents[0]);
    expect(topics).toHaveLength(4);
    expect(topics[0]).toContain("Promoted to Engineering Manager");
    expect(topics.every((topic) => topic.length <= 160)).toBe(true);
  });
});

describe("public update review boundary", () => {
  it("accepts only confirmed-style HTTPS source inputs", () => {
    expect(WatchSourceInputSchema.safeParse({
      contactId: "maya-chen",
      contactName: "Maya Chen",
      label: "Maya's blog",
      url: "https://example.com/maya/feed.xml",
      kind: "rss",
    }).success).toBe(true);
    expect(WatchSourceInputSchema.safeParse({
      contactId: "maya-chen",
      contactName: "Maya Chen",
      label: "Local page",
      url: "http://localhost/private",
      kind: "website",
    }).success).toBe(false);
  });

  it("requires discovered updates to remain separate from memories", () => {
    const update = WatchUpdateSchema.parse({
      id: "suggestion-1",
      contactId: "maya-chen",
      sourceId: "source-1",
      sourceLabel: "Public blog",
      title: "Maya launched a new project",
      discoveredAt: "2026-07-10T12:00:00.000Z",
    });
    expect(update).not.toHaveProperty("source", "public-update");
  });

  it("keeps optional HTTPS provenance on an approved memory", () => {
    const memory = MemorySchema.parse(validBundle().contacts[0]!.timeline[0]);
    expect(memory.sourceLabel).toBe("Taylor's blog");
    expect(memory.sourceUrl).toBe("https://example.com/taylor/project");
  });
});

describe("private credentials and backup integrity", () => {
  it("never includes a badge credential in local-assistance context", () => {
    const context = toContactContext({
      ...seededContacts[0]!,
      badgeId: "5e4f8fb1392a4e11b9ec18bf9dafc982",
      photoUri: "file:///app/photos/jordan.jpg",
    });
    expect(context).not.toHaveProperty("badgeId");
    expect(context).not.toHaveProperty("photoUri");
    expect(context).not.toHaveProperty("recognitionEnabled");
  });

  it("accepts a referentially complete backup", () => {
    expect(ExportBundleSchema.safeParse(validBundle()).success).toBe(true);
  });

  it("rejects duplicate contact, event, and memory IDs", () => {
    const bundle = validBundle();
    bundle.contacts.push({
      ...bundle.contacts[0]!,
      timeline: [{ ...bundle.contacts[0]!.timeline[0]!, contactId: "contact-one" }],
    });
    bundle.events.push({ ...bundle.events[0]! });
    const result = ExportBundleSchema.safeParse(bundle);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toEqual(expect.arrayContaining([
        "Contact IDs must be unique.",
        "Event IDs must be unique.",
        "Memory IDs must be unique.",
      ]));
    }
  });

  it("rejects mismatched memories and invalid event attendees", () => {
    const bundle = validBundle();
    bundle.contacts[0]!.timeline[0]!.contactId = "someone-else";
    bundle.events[0]!.attendeeContactIds = ["contact-one", "contact-one", "missing-contact"];
    const result = ExportBundleSchema.safeParse(bundle);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toEqual(expect.arrayContaining([
        "Each memory must belong to its containing contact.",
        "An event cannot contain the same attendee more than once.",
        "Every event attendee must reference a saved contact.",
      ]));
    }
  });

  it("rejects duplicate non-empty badge credentials", () => {
    const bundle = validBundle();
    const badgeId = "5e4f8fb1392a4e11b9ec18bf9dafc982";
    const firstContact = { ...bundle.contacts[0]!, badgeId };
    const secondContact = {
      ...bundle.contacts[0]!,
      id: "contact-two",
      displayName: "Morgan Lee",
      badgeId,
      timeline: [],
    };
    bundle.contacts = [firstContact, secondContact];
    const result = ExportBundleSchema.safeParse(bundle);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain("Badge IDs must be unique.");
    }
  });

  it("accepts a complete v2 workspace and retains v1 restore compatibility", () => {
    expect(WorkspaceBackupV2Schema.safeParse(validWorkspaceBackupV2()).success).toBe(true);
    expect(WorkspaceBackupSchema.safeParse(validWorkspaceBackupV2()).success).toBe(true);
    expect(WorkspaceBackupSchema.safeParse(validBundle()).success).toBe(true);
  });

  it("shares aggregate memory and follow-up-reference limits across backup versions", () => {
    const messages = workspaceAggregateLimitMessages([{
      timeline: [
        { nextSteps: ["One", "Two"] },
        { nextSteps: [] },
      ],
    }], { memories: 1, memoryNextSteps: 1 });

    expect(messages).toEqual([
      "Workspaces can contain at most 1 memory.",
      "Workspace memories can contain at most 1 follow-up reference.",
    ]);
  });

  it("rejects v2 workspaces with too many aggregate memory follow-up references", () => {
    const contacts = Array.from({ length: 101 }, (_, contactIndex) => ({
      id: `contact-next-step-cap-${contactIndex}`,
      displayName: `Next Step Cap ${contactIndex}`,
      conversationTopics: [],
      timeline: Array.from({ length: 100 }, (_, memoryIndex) => ({
        id: `next-step-cap-${contactIndex}-${memoryIndex}`,
        contactId: `contact-next-step-cap-${contactIndex}`,
        summary: "Memory",
        tags: [],
        nextSteps: ["One", "Two", "Three", "Four", "Five"],
        source: "import" as const,
        occurredAt: "2026-07-10T12:00:00.000Z",
        createdAt: "2026-07-10T12:00:00.000Z",
      })),
    }));
    const result = WorkspaceBackupV2Schema.safeParse({
      version: 2,
      exportedAt: "2026-07-10T13:00:00.000Z",
      contacts,
      events: [],
      actions: [],
      entities: [],
      relationships: [],
      connectionDecisions: [],
      photoAssets: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        "Workspace memories can contain at most 50,000 follow-up references.",
      );
    }
  });

  it("rejects broken v2 action, relationship, decision, and photo references", () => {
    const backup = validWorkspaceBackupV2();
    backup.actions[0]!.contactId = "missing-contact";
    backup.actions[0]!.eventId = "missing-event";
    backup.relationships[0]!.entityId = "missing-entity";
    backup.relationships[0]!.evidenceMemoryIds = ["missing-memory"];
    backup.connectionDecisions[0]!.relationshipId = "missing-relationship";
    backup.contacts[0]!.photoAssetId = "missing-photo";
    const result = WorkspaceBackupV2Schema.safeParse(backup);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
        "Every action must reference a saved contact.",
        "Every action event must reference a saved event.",
        "Every relationship must reference a saved entity.",
        "Relationship evidence must belong to the relationship contact.",
        "Accepted decisions must reference their saved entity and relationship.",
        "Every contact photo must reference a bundled photo asset.",
        "Photo assets must be referenced by a contact.",
      ]));
    }
  });

  it("refuses device-only secrets in a v2 portable contact", () => {
    const backup = validWorkspaceBackupV2();
    const unsafe = {
      ...backup,
      appLockEnabled: true,
      contacts: [{
        ...backup.contacts[0]!,
        badgeId: "5e4f8fb1392a4e11b9ec18bf9dafc982",
        recognitionEnabled: true,
        photoUri: "file:///private/ContextProfilePhotos/secret.jpg",
      }],
    };
    expect(WorkspaceBackupV2Schema.safeParse(unsafe).success).toBe(false);
  });

  it("keeps photo assets contact-scoped and accepted decisions tied to their evidence", () => {
    const backup = validWorkspaceBackupV2();
    backup.contacts.push({
      id: "contact-two",
      displayName: "Morgan Lee",
      conversationTopics: [],
      timeline: [],
      photoAssetId: "photo-one",
    });
    backup.connectionDecisions[0]!.entityId = "entity-other";
    backup.entities.push({
      id: "entity-other",
      kind: "project",
      name: "A different project",
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T12:00:00.000Z",
    });
    const result = WorkspaceBackupV2Schema.safeParse(backup);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
        "A bundled photo asset cannot be shared by multiple contacts.",
        "Accepted decisions must match their saved suggestion relationship.",
      ]));
    }
  });
});
