import { describe, expect, it } from "vitest";
import type { Contact } from "@context/shared";
import { duplicateContactUpdates, duplicateResolutionMessage } from "./duplicate-contact-resolution";

const existing: Contact = {
  id: "existing",
  displayName: "Maya Chen",
  company: "Acme",
  role: "Designer",
  email: "old@example.com",
  phone: "204-555-0000",
  socialLinks: [{ platform: "LinkedIn", handle: "maya" }],
  photoUri: "file:///ContextProfilePhotos/old.jpg",
  metAt: "Conference",
  conversationTopics: ["Design systems"],
  recognitionEnabled: true,
  timeline: [],
};

describe("duplicate-person resolution", () => {
  it("applies every entered field while retaining saved fields left blank", () => {
    const incoming: Contact = {
      id: "draft",
      displayName: "Maya Chen",
      company: "Acme",
      role: "Product lead",
      phone: "204-555-1234",
      socialLinks: [{ platform: "Instagram", handle: "mayac" }],
      photoUri: "file:///ContextProfilePhotos/new.jpg",
      relationshipContext: "Met through Priya",
      conversationTopics: [],
      recognitionEnabled: false,
      timeline: [],
    };

    expect(duplicateContactUpdates(existing, incoming, "replace")).toMatchObject({
      role: "Product lead",
      email: "old@example.com",
      phone: "204-555-1234",
      photoUri: "file:///ContextProfilePhotos/new.jpg",
      relationshipContext: "Met through Priya",
      recognitionEnabled: true,
      socialLinks: [
        { platform: "Instagram", handle: "mayac" },
        { platform: "LinkedIn", handle: "maya" },
      ],
    });
  });

  it("distinguishes preserving, replacing, and explicitly removing a saved photo", () => {
    const withoutPhoto: Contact = {
      id: "draft",
      displayName: "Maya Chen",
      company: "Acme",
      conversationTopics: [],
      recognitionEnabled: false,
      timeline: [],
    };

    expect(duplicateContactUpdates(existing, withoutPhoto, "preserve").photoUri).toBe(existing.photoUri);
    expect(duplicateContactUpdates(existing, withoutPhoto, "remove")).toHaveProperty("photoUri", undefined);
  });

  it("states the event-link result before the user chooses", () => {
    expect(duplicateResolutionMessage("Maya Chen", "Founder Dinner", true))
      .toContain("Either choice will also add the resulting person to Founder Dinner.");
    expect(duplicateResolutionMessage("Maya Chen", "Founder Dinner", false))
      .toContain("Neither choice will add them to Founder Dinner");
  });
});
