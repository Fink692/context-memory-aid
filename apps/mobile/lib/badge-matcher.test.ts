import type { Contact } from "@context/shared";
import { describe, expect, it } from "vitest";
import { badgePayload, contactIdFromQr } from "./badge-matcher";

const candidates: Contact[] = [{
  id: "jordan-patel",
  badgeId: "a5c49116-f859-4d62-9428-df3a36136d67",
  displayName: "Jordan Patel",
  recognitionEnabled: true,
  conversationTopics: [],
  timeline: [],
}];

describe("Context badge matching", () => {
  it("accepts only an eligible saved candidate's random badge credential", () => {
    expect(contactIdFromQr(badgePayload("a5c49116-f859-4d62-9428-df3a36136d67"), candidates)).toBe("jordan-patel");
    expect(contactIdFromQr("context://badge/unknown-token", candidates)).toBeNull();
    expect(contactIdFromQr("context://contact/jordan-patel", candidates)).toBeNull();
    expect(contactIdFromQr("https://example.com/jordan-patel", candidates)).toBeNull();
  });

  it("treats malformed percent encoding as an unknown badge", () => {
    expect(contactIdFromQr("context://badge/%E0%A4%A", candidates)).toBeNull();
  });
});
