import { describe, expect, it } from "vitest";
import type { Contact, ContactShareCard } from "@context/shared";
import {
  ContactShareReceiveError,
  blockedIdentifierFieldsForMatch,
  contactShareIdentifierEvidence,
  contactShareConflictRows,
  contactShareUpdates,
  findContactShareMatches,
} from "./contact-share-receive";

function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "saved-person",
    displayName: "Maya Chen",
    company: "Northstar",
    email: "maya@example.com",
    socialLinks: [
      { platform: "LinkedIn", url: "https://www.linkedin.com/in/saved-maya" },
      { platform: "GitHub", url: "https://github.com/saved-maya" },
    ],
    relationshipContext: "Private relationship context",
    conversationTopics: ["Private conversation topic"],
    recognitionEnabled: true,
    timeline: [],
    ...overrides,
  };
}

function card(overrides: Partial<ContactShareCard> = {}): ContactShareCard {
  return {
    version: 1,
    displayName: "Maya Chen",
    ...overrides,
  };
}

describe("received contact matching", () => {
  it("prioritizes exact email or phone matches and keeps ambiguity explicit", () => {
    const emailMatch = contact({ id: "email", email: "MAYA@example.com", phone: undefined });
    const phoneMatch = contact({ id: "phone", email: undefined, phone: "+1 (204) 555-0102" });
    const sameName = contact({ id: "name-only", email: undefined, phone: undefined });

    expect(findContactShareMatches([emailMatch, phoneMatch, sameName], card({
      email: "maya@example.com",
      phone: "+1 204 555 0102",
    })).map((match) => match.id)).toEqual(["email", "phone"]);

    const evidence = contactShareIdentifierEvidence([emailMatch, phoneMatch, sameName], card({
      email: "maya@example.com",
      phone: "+1 204 555 0102",
    }));
    expect(evidence.conflicting).toBe(true);
    expect(blockedIdentifierFieldsForMatch(evidence, "email")).toEqual(new Set(["phone"]));
    expect(blockedIdentifierFieldsForMatch(evidence, "phone")).toEqual(new Set(["email"]));
  });

  it("blocks a field owned only by another match when identifier owners partially overlap", () => {
    const emailOnly = contact({ id: "email-only", phone: undefined });
    const emailAndPhone = contact({ id: "email-and-phone", phone: "+1 204 555 0102" });
    const evidence = contactShareIdentifierEvidence([emailOnly, emailAndPhone], card({
      email: "maya@example.com",
      phone: "+1 204 555 0102",
    }));

    expect(evidence.conflicting).toBe(true);
    expect(blockedIdentifierFieldsForMatch(evidence, "email-only")).toEqual(new Set(["phone"]));
    expect(blockedIdentifierFieldsForMatch(evidence, "email-and-phone")).toEqual(new Set());
  });

  it("uses name and company only as a review candidate fallback", () => {
    const northstar = contact({ id: "northstar", email: undefined, company: undefined });
    const other = contact({ id: "other", email: undefined, company: "Other Co" });
    expect(findContactShareMatches([northstar, other], card({ company: "Northstar" })))
      .toEqual([northstar]);
  });
});

describe("received contact updates", () => {
  it("requires an explicit choice before applying a changed name to an identifier match", () => {
    const existing = contact({ displayName: "Maya Chen" });
    const received = card({
      displayName: "Maya Chen-Singh",
      email: "maya@example.com",
    });

    expect(findContactShareMatches([existing], received)).toEqual([existing]);
    expect(contactShareConflictRows(existing, received)).toEqual([
      expect.objectContaining({
        field: "displayName",
        label: "Name",
        current: "Maya Chen",
        received: "Maya Chen-Singh",
      }),
    ]);
    expect(contactShareUpdates(existing, received, new Set())).toEqual({});
    expect(contactShareUpdates(existing, received, new Set(["displayName"]))).toEqual({
      displayName: "Maya Chen-Singh",
    });
  });

  it("can accept a rename without bypassing identifier ownership", () => {
    const emailOwner = contact({ id: "email-owner", phone: undefined });
    const phoneOwner = contact({
      id: "phone-owner",
      email: "someone-else@example.com",
      phone: "+1 204 555 0102",
    });
    const received = card({
      displayName: "Maya Chen-Singh",
      email: "maya@example.com",
      phone: "+1 204 555 0102",
    });
    const evidence = contactShareIdentifierEvidence([emailOwner, phoneOwner], received);
    const blocked = blockedIdentifierFieldsForMatch(evidence, emailOwner.id);

    expect(blocked).toEqual(new Set(["phone"]));
    expect(contactShareUpdates(
      emailOwner,
      received,
      new Set(["displayName", "phone"]),
      blocked,
    )).toEqual({ displayName: "Maya Chen-Singh" });
  });

  it("keeps conflicts by default while enriching empty public fields", () => {
    const existing = contact({ role: undefined, phone: undefined });
    const updates = contactShareUpdates(existing, card({
      company: "Received Company",
      role: "Founder",
      phone: "+1 204 555 0101",
    }), new Set());

    expect(updates).toEqual({ role: "Founder", phone: "+1 204 555 0101" });
    expect(updates).not.toHaveProperty("relationshipContext");
    expect(updates).not.toHaveProperty("conversationTopics");
    expect(updates).not.toHaveProperty("recognitionEnabled");
  });

  it("replaces only a received social network and preserves unrelated profiles", () => {
    const existing = contact();
    const updates = contactShareUpdates(existing, card({
      socialLinks: [
        { platform: "LinkedIn", url: "https://www.linkedin.com/in/received-maya" },
        { platform: "Instagram", url: "https://www.instagram.com/received-maya/" },
      ],
    }), new Set(["socialLinks"]));

    expect(updates.socialLinks).toEqual([
      { platform: "LinkedIn", url: "https://www.linkedin.com/in/received-maya" },
      { platform: "Instagram", url: "https://www.instagram.com/received-maya/" },
      { platform: "GitHub", url: "https://github.com/saved-maya" },
    ]);
  });

  it("never truncates saved social profiles to force an over-capacity merge", () => {
    const existing = contact({
      socialLinks: Array.from({ length: 12 }, (_, index) => ({
        platform: `Network ${index}`,
        url: `https://profiles.example.com/${index}`,
      })),
    });
    expect(() => contactShareUpdates(existing, card({
      socialLinks: [{ platform: "New Network", url: "https://new.example.com/maya" }],
    }), new Set(["socialLinks"]))).toThrow(ContactShareReceiveError);
  });

  it("blocks an identifier already owned by a different exact match", () => {
    const existing = contact({ id: "email-owner", phone: undefined });
    const updates = contactShareUpdates(existing, card({
      email: "maya@example.com",
      phone: "+1 204 555 0102",
      role: "Founder",
    }), new Set(), new Set(["phone"]));
    expect(updates).toEqual({ role: "Founder" });
  });

  it("returns no update for an identical card and identifies actual conflicts", () => {
    const existing = contact();
    const identical = card({
      company: existing.company,
      email: existing.email,
      socialLinks: existing.socialLinks?.flatMap((link) => link.url
        ? [{ platform: link.platform, url: link.url }]
        : []),
    });
    expect(contactShareUpdates(existing, identical, new Set())).toEqual({});
    expect(contactShareConflictRows(existing, identical)).toEqual([]);

    expect(contactShareConflictRows(existing, card({ company: "Received Company" })))
      .toEqual([expect.objectContaining({ field: "company" })]);
  });
});
