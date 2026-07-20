import { describe, expect, it } from "vitest";
import { ContactShareCardSchema } from "./contact-share";

describe("contact share card contract", () => {
  it("accepts only the versioned public allowlist", () => {
    expect(ContactShareCardSchema.parse({
      version: 1,
      displayName: "  Renée 李  ",
      company: " Context ",
      role: "Founder",
      email: "renee@example.com",
      phone: "+1 204 555 0101",
      socialLinks: [{ platform: "LinkedIn", url: "https://www.linkedin.com/in/renee" }],
    })).toEqual({
      version: 1,
      displayName: "Renée 李",
      company: "Context",
      role: "Founder",
      email: "renee@example.com",
      phone: "+1 204 555 0101",
      socialLinks: [{ platform: "LinkedIn", url: "https://www.linkedin.com/in/renee" }],
    });
  });

  it("rejects unknown versions, extra private fields, and nested extras", () => {
    expect(ContactShareCardSchema.safeParse({ version: 2, displayName: "Avery" }).success).toBe(false);
    expect(ContactShareCardSchema.safeParse({
      version: 1,
      displayName: "Avery",
      relationshipContext: "Private history",
    }).success).toBe(false);
    expect(ContactShareCardSchema.safeParse({
      version: 1,
      displayName: "Avery",
      socialLinks: [{
        platform: "GitHub",
        url: "https://github.com/avery",
        handle: "secret-extra-field",
      }],
    }).success).toBe(false);
  });

  it("rejects control characters, non-HTTPS links, URL credentials, and empty names", () => {
    expect(ContactShareCardSchema.safeParse({ version: 1, displayName: "Avery\r\nTEL:911" }).success).toBe(false);
    expect(ContactShareCardSchema.safeParse({ version: 1, displayName: "   " }).success).toBe(false);
    expect(ContactShareCardSchema.safeParse({
      version: 1,
      displayName: "Avery",
      socialLinks: [{ platform: "Web", url: "http://example.com/avery" }],
    }).success).toBe(false);
    expect(ContactShareCardSchema.safeParse({
      version: 1,
      displayName: "Avery",
      socialLinks: [{ platform: "Web", url: "https://user:pass@example.com/avery" }],
    }).success).toBe(false);
    for (const controlCharacter of ["\u0000", "\t", "\n", "\r", "\u007f"]) {
      expect(ContactShareCardSchema.safeParse({
        version: 1,
        displayName: "Avery",
        socialLinks: [{ platform: "Web", url: `https://example.com/av${controlCharacter}ery` }],
      }).success).toBe(false);
    }
  });
});
