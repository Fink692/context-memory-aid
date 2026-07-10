import { describe, expect, it } from "vitest";
import {
  createLocalConversationTopics,
  createLocalMemoryDraft,
  evaluateFaceMatch,
  filterEventCandidates,
  parseAttendeeCsv,
  seededContacts,
  seededEvents,
} from "./index";

describe("event-bounded matching", () => {
  it("excludes saved contacts who are not attending", () => {
    const candidates = filterEventCandidates(seededContacts, seededEvents[0]!);
    expect(candidates.map((contact) => contact.id)).toEqual([
      "jordan-patel",
      "alex-morgan",
      "maya-chen",
    ]);
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
