import { describe, expect, it } from "vitest";
import { mapDeviceContact, mapDeviceContacts } from "./device-contact-mapper";

describe("device Contacts mapping", () => {
  it("copies the supported profile fields without native record identifiers", () => {
    const mapped = mapDeviceContact({
      id: "ABC-123",
      fullName: "  Taylor Reed  ",
      company: "  Northstar  ",
      jobTitle: " Product Lead ",
      phones: [{ number: "+12045550123" }],
      emails: [{ address: "taylor@example.com" }],
      socialProfiles: [{
        service: "LinkedIn",
        username: "taylor-reed",
        url: "https://linkedin.com/in/taylor-reed",
      }],
      thumbnail: "file:///contacts/taylor.jpg",
    }, "ios");

    expect(mapped).toEqual({
      sourceId: "system-contact:ios:ABC-123",
      displayName: "Taylor Reed",
      company: "Northstar",
      role: "Product Lead",
      email: "taylor@example.com",
      phone: "+12045550123",
      socialLinks: [{
        platform: "LinkedIn",
        handle: "taylor-reed",
        url: "https://linkedin.com/in/taylor-reed",
      }],
      photoUri: "file:///contacts/taylor.jpg",
    });
    expect(mapped).not.toHaveProperty("id");
  });

  it("skips invalid details while retaining the safe parts of a contact", () => {
    const mapped = mapDeviceContact({
      id: "details-1",
      fullName: "Morgan Lee",
      emails: [{ address: "not-an-email" }, { address: "morgan@example.com" }],
      phones: [{ number: "extension only" }, { number: "+1 204 555 0199" }],
      socialProfiles: [{ service: "Instagram", username: "morgan", url: "http://example.com/morgan" }],
      thumbnail: "https://remote.example.com/morgan.jpg",
    }, "ios");

    expect(mapped).toMatchObject({
      email: "morgan@example.com",
      phone: "+1 204 555 0199",
      socialLinks: [{ platform: "Instagram", handle: "morgan" }],
    });
    expect(mapped).not.toHaveProperty("photoUri");
  });

  it("normalizes Expo's absolute thumbnail cache paths into local file URIs", () => {
    const mapped = mapDeviceContact({
      id: "photo-path",
      fullName: "Photo Person",
      thumbnail: "/private/var/mobile/Contacts Cache/photo person.png",
    }, "ios");

    expect(mapped?.photoUri).toBe("file:///private/var/mobile/Contacts%20Cache/photo%20person.png");
  });

  it("composes a name and skips nameless contacts", () => {
    expect(mapDeviceContact({
      id: "contact-1",
      givenName: "Avery",
      middleName: "J",
      familyName: "Chen",
    }, "ios")?.displayName).toBe("Avery J Chen");
    expect(mapDeviceContact({ id: "contact-2", company: "Nameless LLC" }, "ios")).toBeUndefined();
  });

  it("deduplicates repeated native identifiers and reports invalid rows", () => {
    const result = mapDeviceContacts([
      { id: "one", fullName: "One Person" },
      { id: "one", fullName: "One Person" },
      { id: "two", fullName: "" },
    ], "ios");
    expect(result.contacts).toHaveLength(1);
    expect(result.skipped).toBe(2);
  });

  it("bounds imported values to the shared schema", () => {
    const mapped = mapDeviceContact({
      id: "id",
      fullName: "A".repeat(150),
      company: "B".repeat(150),
      jobTitle: "C".repeat(150),
    }, "android");
    expect(mapped?.displayName).toHaveLength(100);
    expect(mapped?.company).toHaveLength(120);
    expect(mapped?.role).toHaveLength(120);
  });
});
