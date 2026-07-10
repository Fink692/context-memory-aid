import type { Contact } from "@context/shared";
import { describe, expect, it } from "vitest";
import { contactIdFromQr } from "./badge-matcher";

const candidates: Contact[] = [{
  id: "jordan-patel",
  displayName: "Jordan Patel",
  recognitionEnabled: true,
  conversationTopics: [],
  timeline: [],
}];

describe("Context badge matching", () => {
  it("accepts only eligible saved candidate identifiers", () => {
    expect(contactIdFromQr("context://contact/jordan-patel", candidates)).toBe("jordan-patel");
    expect(contactIdFromQr("context://contact/unknown-person", candidates)).toBeNull();
    expect(contactIdFromQr("https://example.com/jordan-patel", candidates)).toBeNull();
  });

  it("treats malformed percent encoding as an unknown badge", () => {
    expect(contactIdFromQr("context://contact/%E0%A4%A", candidates)).toBeNull();
  });
});
