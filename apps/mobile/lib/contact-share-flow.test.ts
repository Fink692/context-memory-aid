import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Contact } from "@context/shared";
import {
  parseContactShareVCard,
  projectContactShareCard,
  serializeContactShareVCard,
  shareableSocialLinks,
} from "./contact-share";
import {
  contactShareConflictRows,
  contactShareUpdates,
  findContactShareMatches,
} from "./contact-share-receive";

function privateSender(): Contact {
  return {
    id: "sender-private-id",
    badgeId: "sender-private-badge",
    displayName: "Maya Chen-Singh",
    company: "Northstar",
    role: "Founder",
    email: "maya@example.com",
    phone: "+1 204 555 0102",
    socialLinks: [{
      platform: "LinkedIn",
      handle: "maya-chen",
      url: "https://www.linkedin.com/in/maya-chen",
    }],
    photoUri: "file:///private/maya.jpg",
    relationshipContext: "Private relationship context",
    conversationTopics: ["Private conversation topic"],
    recognitionEnabled: true,
    timeline: [{
      id: "private-memory-id",
      contactId: "sender-private-id",
      summary: "Private memory",
      tags: [],
      nextSteps: [],
      source: "text",
      occurredAt: "2026-07-18T12:00:00.000Z",
      createdAt: "2026-07-18T12:00:00.000Z",
    }],
  };
}

function savedReceiverContact(): Contact {
  return {
    id: "saved-maya",
    displayName: "Maya Chen",
    email: "maya@example.com",
    relationshipContext: "Receiver-only private context",
    conversationTopics: ["Receiver-only private topic"],
    recognitionEnabled: true,
    timeline: [{
      id: "receiver-memory-id",
      contactId: "saved-maya",
      summary: "Receiver-only private memory",
      tags: [],
      nextSteps: [],
      source: "text",
      occurredAt: "2026-07-17T12:00:00.000Z",
      createdAt: "2026-07-17T12:00:00.000Z",
    }],
  };
}

describe("selected-field contact sharing flow", () => {
  it("runs selection, QR serialization, scan parsing, explicit review, and a privacy-safe update", () => {
    const sender = privateSender();
    const linkedIn = shareableSocialLinks(sender)[0];
    expect(linkedIn).toBeDefined();

    const projected = projectContactShareCard(sender, {
      company: false,
      role: true,
      email: true,
      phone: false,
      socialLinkKeys: [linkedIn!.key],
    });
    const qrPayload = serializeContactShareVCard(projected);
    const received = parseContactShareVCard(qrPayload);

    expect(received).toEqual({
      version: 1,
      displayName: "Maya Chen-Singh",
      role: "Founder",
      email: "maya@example.com",
      socialLinks: [{
        platform: "LinkedIn",
        url: "https://www.linkedin.com/in/maya-chen",
      }],
    });
    expect(qrPayload).not.toMatch(/Northstar|204 555|private|badge|memory/iu);

    const existing = savedReceiverContact();
    expect(findContactShareMatches([existing], received)).toEqual([existing]);
    expect(contactShareConflictRows(existing, received)).toEqual([
      expect.objectContaining({ field: "displayName", current: "Maya Chen", received: "Maya Chen-Singh" }),
    ]);

    const keptName = contactShareUpdates(existing, received, new Set());
    expect(keptName).toEqual({
      role: "Founder",
      socialLinks: received.socialLinks,
    });
    expect(keptName).not.toHaveProperty("displayName");

    const acceptedName = contactShareUpdates(existing, received, new Set(["displayName"]));
    const saved = { ...existing, ...acceptedName };
    expect(saved.displayName).toBe("Maya Chen-Singh");
    expect(saved.timeline).toEqual(existing.timeline);
    expect(saved.relationshipContext).toBe("Receiver-only private context");
    expect(saved.conversationTopics).toEqual(["Receiver-only private topic"]);
    expect(saved.recognitionEnabled).toBe(true);
  });

  it("keeps the native routes wired through permission, review, and explicit save states", () => {
    const senderRoute = readFileSync(resolve(process.cwd(), "app", "contact", "share", "[id].tsx"), "utf8");
    const receiverRoute = readFileSync(resolve(process.cwd(), "app", "contact-receive.tsx"), "utf8");
    const peopleRoute = readFileSync(resolve(process.cwd(), "app", "(tabs)", "people", "index.tsx"), "utf8");
    const detailRoute = readFileSync(resolve(process.cwd(), "app", "contact", "[id].tsx"), "utf8");

    expect(senderRoute).toContain("projectContactShareCard(contact, selection)");
    expect(senderRoute).toContain("isContactShareQrSafe(vCard)");
    expect(senderRoute).toContain("shareContactVCard(vCard, contact.displayName)");
    expect(senderRoute).toContain("Choose exactly what leaves Context.");
    expect(senderRoute).toContain("Memories, relationship notes, events, photos, and internal identifiers stay in Context.");

    expect(receiverRoute).toContain("useCameraPermissions()");
    expect(receiverRoute).toContain("AppState.addEventListener");
    expect(receiverRoute).toContain("getPermission().then");
    expect(receiverRoute).toContain("parseContactShareVCard(data)");
    expect(receiverRoute).toContain("Review these received contact details before saving.");
    expect(receiverRoute).toContain("await addContact(createContactFromShare(receivedCard, id), null)");
    expect(receiverRoute).toContain("await updateContact(selectedMatch.id, updates)");
    expect(receiverRoute).toContain("Nothing is added until you confirm it.");

    expect(peopleRoute).toContain('router.push("/contact-receive")');
    expect(detailRoute).toContain('pathname: "/contact/share/[id]"');
  });
});
