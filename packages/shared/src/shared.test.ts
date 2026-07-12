import { describe, expect, it } from "vitest";
import {
  createLocalConversationTopics,
  createLocalMemoryDraft,
  ContactDraftRequestSchema,
  ContactDraftSchema,
  ContactSchema,
  evaluateFaceMatch,
  ExportBundleSchema,
  filterEventCandidates,
  MemorySchema,
  LocalContactDraftResponseSchema,
  parseAttendeeCsv,
  seededContacts,
  seededEvents,
  toContactContext,
  WatchSourceInputSchema,
  WatchUpdateSchema,
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
});
