import { beforeEach, describe, expect, it, vi } from "vitest";

const nativeContacts = vi.hoisted(() => ({
  getAllDetails: vi.fn(),
  presentAccessPicker: vi.fn(),
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

vi.mock("expo-contacts", () => ({
  Contact: nativeContacts,
  ContactField: {
    FULL_NAME: "fullName",
    GIVEN_NAME: "givenName",
    MIDDLE_NAME: "middleName",
    FAMILY_NAME: "familyName",
    COMPANY: "company",
    JOB_TITLE: "jobTitle",
    EMAILS: "emails",
    PHONES: "phones",
    SOCIAL_PROFILES: "socialProfiles",
    THUMBNAIL: "thumbnail",
  },
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
}));

import { loadAccessibleDeviceContacts } from "./device-contacts";

describe("device Contacts query", () => {
  beforeEach(() => {
    nativeContacts.getAllDetails.mockReset();
    nativeContacts.getAllDetails.mockResolvedValue([]);
  });

  it("omits the Expo 57 iOS sort value that the native bridge cannot decode", async () => {
    await loadAccessibleDeviceContacts();

    expect(nativeContacts.getAllDetails).toHaveBeenCalledOnce();
    expect(nativeContacts.getAllDetails).toHaveBeenCalledWith(
      [
        "fullName",
        "givenName",
        "middleName",
        "familyName",
        "company",
        "jobTitle",
        "emails",
        "phones",
        "socialProfiles",
        "thumbnail",
      ],
      { limit: 250, offset: 0 },
    );
    expect(nativeContacts.getAllDetails.mock.calls[0]?.[1]).not.toHaveProperty("sortOrder");
  });
});
