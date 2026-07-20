import { describe, expect, it } from "vitest";
import type { Contact } from "@context/shared";
import { findContactByIdentity } from "./contact-identity";

const contacts: Contact[] = [
  { id: "one", displayName: "Jordan Smith", company: "Acme", conversationTopics: [], recognitionEnabled: false, timeline: [] },
  { id: "two", displayName: "Jordan Smith", company: "Northstar", conversationTopics: [], recognitionEnabled: false, timeline: [] },
];

describe("contact identity", () => {
  it("allows the same name at different companies", () => {
    expect(findContactByIdentity(contacts, "Jordan Smith", "Northstar", "one")?.id).toBe("two");
    expect(findContactByIdentity(contacts, "Jordan Smith", "Another Co", "one")).toBeUndefined();
  });

  it("ignores the record currently being edited", () => {
    expect(findContactByIdentity(contacts, " jordan smith ", " ACME ", "one")).toBeUndefined();
  });
});
