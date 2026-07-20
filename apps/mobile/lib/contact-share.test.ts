import { describe, expect, it } from "vitest";
import type { Contact, ContactShareCard } from "@context/shared";
import {
  ContactShareCodecError,
  MAX_CONTACT_SHARE_QR_UTF8_BYTES,
  MAX_CONTACT_SHARE_VCARD_UTF8_BYTES,
  assertContactShareQrSafe,
  contactShareCardToContactFields,
  createContactFromShare,
  defaultContactShareSelection,
  isContactShareQrSafe,
  parseContactShareVCard,
  projectContactShareCard,
  serializeContactShareVCard,
  shareableSocialLinks,
  utf8ByteLength,
} from "./contact-share";

function privateContact(): Contact {
  return {
    id: "private-contact-id",
    badgeId: "private-badge-credential",
    displayName: "Zoë 李",
    company: "R&D, Inc; Labs",
    role: "Founder: Product",
    email: "zoe@example.com",
    phone: "+1 204 555 0102",
    socialLinks: [
      {
        platform: "LinkedIn",
        handle: "zoe-li",
        url: "https://www.linkedin.com/in/zoe-li#private-fragment",
      },
      { platform: "Instagram", handle: "@zoe.codes" },
      { platform: "Unknown Network", handle: "zoe" },
    ],
    photoUri: "file:///private/face.jpg",
    metAt: "Private retreat",
    relationshipContext: "Introduced by a confidential client",
    lastSpokeAt: "2026-07-18T12:00:00.000Z",
    lastDiscussed: "Private acquisition",
    recentUpdate: "Secret launch",
    conversationTopics: ["Private family detail"],
    recognitionEnabled: true,
    timeline: [{
      id: "private-memory-id",
      contactId: "private-contact-id",
      summary: "Private memory",
      tags: [],
      nextSteps: [],
      source: "text",
      occurredAt: "2026-07-18T12:00:00.000Z",
      createdAt: "2026-07-18T12:00:00.000Z",
    }],
  };
}

describe("contact share projection", () => {
  it("defaults to each available public field and each normalizable social profile", () => {
    const contact = privateContact();
    const links = shareableSocialLinks(contact);
    const selection = defaultContactShareSelection(contact);

    expect(links).toEqual([
      {
        key: expect.any(String),
        platform: "LinkedIn",
        url: "https://www.linkedin.com/in/zoe-li",
      },
      {
        key: expect.any(String),
        platform: "Instagram",
        url: "https://www.instagram.com/zoe.codes/",
      },
    ]);
    expect(selection).toEqual({
      company: true,
      role: true,
      email: true,
      phone: true,
      socialLinkKeys: links.map((link) => link.key),
    });
  });

  it("includes only explicitly selected fields and profiles", () => {
    const contact = privateContact();
    const [linkedIn, instagram] = shareableSocialLinks(contact);
    expect(linkedIn).toBeDefined();
    expect(instagram).toBeDefined();

    const card = projectContactShareCard(contact, {
      company: false,
      role: true,
      email: false,
      phone: false,
      socialLinkKeys: [instagram!.key, "unknown-key"],
    });

    expect(card).toEqual({
      version: 1,
      displayName: "Zoë 李",
      role: "Founder: Product",
      socialLinks: [{
        platform: "Instagram",
        url: "https://www.instagram.com/zoe.codes/",
      }],
    });
  });

  it("cannot leak private Contact fields through projection or serialization", () => {
    const card = projectContactShareCard(privateContact(), {
      company: false,
      role: false,
      email: false,
      phone: false,
      socialLinkKeys: [],
    });
    const serialized = `${JSON.stringify(card)}\n${serializeContactShareVCard(card)}`;

    expect(card).toEqual({ version: 1, displayName: "Zoë 李" });
    for (const privateValue of [
      "private-contact-id",
      "private-badge-credential",
      "private/face",
      "Private retreat",
      "confidential client",
      "Private acquisition",
      "Secret launch",
      "Private family detail",
      "private-memory-id",
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });
});

describe("vCard 3.0 contact share codec", () => {
  it("round-trips Unicode, escaped punctuation, CRLF endings, and UTF-8 line folding", () => {
    const displayName = `李${"é".repeat(55)}`;
    const card: ContactShareCard = {
      version: 1,
      displayName,
      company: "R&D, Inc; Labs",
      role: "Founder: Product",
      email: "unicode@example.com",
      phone: "+1 204 555 0102",
      socialLinks: [{ platform: "LinkedIn", url: "https://www.linkedin.com/in/unicode-person" }],
    };

    const payload = serializeContactShareVCard(card);
    expect(payload.replaceAll("\r\n", "")).not.toMatch(/[\r\n]/u);
    expect(payload).toContain("N:;李");
    expect(payload).toContain("ORG:R&D\\, Inc\\; Labs");
    expect(payload).toContain("TEL:+1 204 555 0102");
    expect(payload).not.toContain("TEL;TYPE=CELL");
    expect(payload).toContain(
      "X-SOCIALPROFILE;TYPE=LinkedIn:https://www.linkedin.com/in/unicode-person",
    );
    expect(payload).not.toContain("X-CONTEXT-PLATFORM");
    expect(payload).toContain("URL:https://www.linkedin.com/in/unicode-person");
    expect(payload.split("\r\n").filter(Boolean).every((line) => utf8ByteLength(line) <= 75)).toBe(true);
    expect(parseContactShareVCard(payload)).toEqual(card);
  });

  it("treats escaped or raw field injection as data errors", () => {
    expect(() => serializeContactShareVCard({
      version: 1,
      displayName: "Avery\r\nTEL:911",
    } as ContactShareCard)).toThrow();

    expect(() => parseContactShareVCard([
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Avery;;;;",
      "FN:Avery\\nTEL:911",
      "END:VCARD",
      "",
    ].join("\r\n"))).toThrow(ContactShareCodecError);
  });

  it("rejects unsupported encoding and value parameters on imported public fields", () => {
    const encodedName = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:;;;;",
      "FN;ENCODING=b:Sm9yZGFu",
      "END:VCARD",
      "",
    ].join("\r\n");
    expect(() => parseContactShareVCard(encodedName)).toThrow(/unsupported ENCODING/u);

    const encodedPhone = encodedName
      .replace("FN;ENCODING=b:Sm9yZGFu", "FN:Jordan\r\nTEL;VALUE=uri:tel:+12045550101");
    expect(() => parseContactShareVCard(encodedPhone)).toThrow(/unsupported VALUE/u);
  });

  it("drops unknown and private vCard properties instead of importing them", () => {
    const parsed = parseContactShareVCard([
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Reed;Taylor;;;",
      "FN:Taylor Reed",
      "UID:private-native-id",
      "NOTE:private relationship history",
      "PHOTO;ENCODING=b:cHJpdmF0ZS1waG90bw==",
      "X-CONTEXT-MEMORY:private memory",
      "EMAIL;TYPE=INTERNET:taylor@example.com",
      "END:VCARD",
      "",
    ].join("\r\n"));

    expect(parsed).toEqual({
      version: 1,
      displayName: "Taylor Reed",
      email: "taylor@example.com",
    });
    expect(JSON.stringify(parsed)).not.toMatch(/private|UID|NOTE|PHOTO|MEMORY/iu);
  });

  it("parses standard HTTPS URL fields and labels known social hosts", () => {
    const parsed = parseContactShareVCard([
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Patel;Jordan;;;",
      "FN:Jordan Patel",
      "URL:https://github.com/jordan#profile",
      "URL:http://example.com/unsafe",
      "X-SOCIALPROFILE;TYPE=X-LINKEDIN:https://www.linkedin.com/in/jordan",
      "END:VCARD",
      "",
    ].join("\r\n"));

    expect(parsed.socialLinks).toEqual([
      { platform: "GitHub", url: "https://github.com/jordan" },
      { platform: "LinkedIn", url: "https://www.linkedin.com/in/jordan" },
    ]);
  });

  it("accepts Apple-style repeated TYPE parameters while dropping Apple metadata", () => {
    const parsed = parseContactShareVCard([
      "BEGIN:VCARD",
      "VERSION:3.0",
      "PRODID:-//Apple Inc.//iOS//EN",
      "N:;Zoë 李;;;",
      "FN:Zoë 李",
      "ORG:Northstar;",
      "EMAIL;type=INTERNET;type=pref:zoe@example.com",
      "TEL;type=pref:+1 204 555 0102",
      "item1.URL;type=pref:https://www.linkedin.com/in/zoe",
      "item1.X-ABLabel:_$!<HomePage>!$_",
      "END:VCARD",
      "",
    ].join("\r\n"));

    expect(parsed).toEqual({
      version: 1,
      displayName: "Zoë 李",
      company: "Northstar",
      email: "zoe@example.com",
      phone: "+1 204 555 0102",
      socialLinks: [{ platform: "LinkedIn", url: "https://www.linkedin.com/in/zoe" }],
    });
  });

  it("uses the sole preferred email and phone when a vCard contains alternatives", () => {
    const parsed = parseContactShareVCard([
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Patel;Jordan;;;",
      "FN:Jordan Patel",
      "EMAIL;TYPE=INTERNET:old@example.com",
      "EMAIL;TYPE=INTERNET;TYPE=PREF:jordan@example.com",
      "TEL;TYPE=WORK:+1 204 555 0100",
      "TEL;TYPE=CELL,PREF:+1 204 555 0101",
      "END:VCARD",
      "",
    ].join("\r\n"));

    expect(parsed.email).toBe("jordan@example.com");
    expect(parsed.phone).toBe("+1 204 555 0101");
  });

  it("rejects unresolved multiple email or phone values instead of silently choosing the first", () => {
    const card = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Patel;Jordan;;;",
      "FN:Jordan Patel",
      "EMAIL;TYPE=HOME:home@example.com",
      "EMAIL;TYPE=WORK:work@example.com",
      "TEL;TYPE=HOME,PREF:+1 204 555 0100",
      "TEL;TYPE=WORK,PREF:+1 204 555 0101",
      "END:VCARD",
      "",
    ].join("\r\n");

    expect(() => parseContactShareVCard(card)).toThrow(/ambiguous EMAIL/u);
    expect(() => parseContactShareVCard(card.replace(
      "EMAIL;TYPE=WORK:work@example.com",
      "EMAIL;TYPE=WORK,PREF:work@example.com",
    ))).toThrow(/ambiguous TEL/u);
  });

  it("retains backward compatibility with the former platform parameter", () => {
    const parsed = parseContactShareVCard([
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Patel;Jordan;;;",
      "FN:Jordan Patel",
      "X-SOCIALPROFILE;X-CONTEXT-PLATFORM=Custom%20Network:https://profiles.example/jordan",
      "END:VCARD",
      "",
    ].join("\r\n"));

    expect(parsed.socialLinks).toEqual([
      { platform: "Custom Network", url: "https://profiles.example/jordan" },
    ]);
  });

  it("uses URL-only fallback for free-form social labels Apple Contacts cannot represent safely", () => {
    const payload = serializeContactShareVCard({
      version: 1,
      displayName: "Jordan Patel",
      socialLinks: [{ platform: "Custom Network", url: "https://profiles.example/jordan" }],
    });

    expect(payload).toContain("URL:https://profiles.example/jordan");
    expect(payload).not.toContain("X-SOCIALPROFILE");
    expect(payload).not.toContain("TYPE=Custom%20Network");
    expect(parseContactShareVCard(payload).socialLinks).toEqual([
      { platform: "Website", url: "https://profiles.example/jordan" },
    ]);
  });

  it("canonicalizes known social labels to Apple-safe service tokens", () => {
    const payload = serializeContactShareVCard({
      version: 1,
      displayName: "Jordan Patel",
      socialLinks: [{ platform: "Linked In", url: "https://www.linkedin.com/in/jordan" }],
    });

    expect(payload).toContain(
      "X-SOCIALPROFILE;TYPE=LinkedIn:https://www.linkedin.com/in/jordan",
    );
  });

  it("rejects control characters in social URLs before URL normalization or serialization", () => {
    const contact = privateContact();
    contact.socialLinks = [{ platform: "Website", url: "https://example.com/jo\nrdan" }];
    expect(shareableSocialLinks(contact)).toEqual([]);

    expect(() => serializeContactShareVCard({
      version: 1,
      displayName: "Jordan Patel",
      socialLinks: [{ platform: "Website", url: "https://example.com/jo\nrdan" }],
    } as ContactShareCard)).toThrow();
  });

  it("rejects malformed, ambiguous, multiple, unsupported, and oversized cards", () => {
    const valid = serializeContactShareVCard({ version: 1, displayName: "Avery Chen" });
    expect(() => parseContactShareVCard("not a vCard")).toThrow(ContactShareCodecError);
    expect(() => parseContactShareVCard(valid.replace("END:VCARD", "NOTE:private\u0007data\r\nEND:VCARD")))
      .toThrow(/control data/u);
    expect(() => parseContactShareVCard(valid.replace("VERSION:3.0", "VERSION:4.0"))).toThrow(/3\.0/u);
    expect(() => parseContactShareVCard(valid.replace("FN:Avery Chen", "FN:Avery Chen\r\nFN:Other"))).toThrow(/exactly one FN/u);
    expect(() => parseContactShareVCard(`${valid}${valid}`)).toThrow(/exactly one complete vCard/u);
    expect(() => parseContactShareVCard(valid.replace(
      "X-CONTEXT-SHARE-VERSION:1",
      "X-CONTEXT-SHARE-VERSION:99",
    ))).toThrow(/unsupported version/u);

    const oversized = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Avery;;;;",
      "FN:Avery",
      `NOTE:${"x".repeat(MAX_CONTACT_SHARE_VCARD_UTF8_BYTES)}`,
      "END:VCARD",
    ].join("\r\n");
    expect(() => parseContactShareVCard(oversized)).toThrow(/too large/u);
  });
});

describe("QR byte guard and receiver helpers", () => {
  it("counts UTF-8 bytes and applies the conservative QR boundary", () => {
    expect(utf8ByteLength("Maya 🧠")).toBe(9);
    expect(utf8ByteLength("🧠".repeat(MAX_CONTACT_SHARE_QR_UTF8_BYTES / 4)))
      .toBe(MAX_CONTACT_SHARE_QR_UTF8_BYTES);
    expect(isContactShareQrSafe("🧠".repeat(MAX_CONTACT_SHARE_QR_UTF8_BYTES / 4))).toBe(true);
    expect(isContactShareQrSafe(`🧠${"🧠".repeat(MAX_CONTACT_SHARE_QR_UTF8_BYTES / 4)}`)).toBe(false);
    expect(() => assertContactShareQrSafe("x".repeat(MAX_CONTACT_SHARE_QR_UTF8_BYTES + 1)))
      .toThrow(ContactShareCodecError);
  });

  it("creates update fields and a clean new Contact without receiver-side private context", () => {
    const card: ContactShareCard = {
      version: 1,
      displayName: "Avery Chen",
      company: "Context",
      socialLinks: [{ platform: "GitHub", url: "https://github.com/avery" }],
    };
    expect(contactShareCardToContactFields(card)).toEqual({
      displayName: "Avery Chen",
      company: "Context",
      socialLinks: [{ platform: "GitHub", url: "https://github.com/avery" }],
    });
    expect(createContactFromShare(card, "received-contact-id")).toEqual({
      id: "received-contact-id",
      displayName: "Avery Chen",
      company: "Context",
      socialLinks: [{ platform: "GitHub", url: "https://github.com/avery" }],
      conversationTopics: [],
      recognitionEnabled: false,
      timeline: [],
    });
  });
});
