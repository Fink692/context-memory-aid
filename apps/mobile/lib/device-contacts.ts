import { Platform } from "react-native";
import {
  Contact,
  ContactField,
  getPermissionsAsync,
  requestPermissionsAsync,
  type ContactsPermissionResponse,
} from "expo-contacts";
import {
  mapDeviceContacts,
  type DeviceContactMappingResult,
  type DeviceContactRow,
} from "./device-contact-mapper";

const DEVICE_CONTACT_FIELDS = [
  ContactField.FULL_NAME,
  ContactField.GIVEN_NAME,
  ContactField.MIDDLE_NAME,
  ContactField.FAMILY_NAME,
  ContactField.COMPANY,
  ContactField.JOB_TITLE,
  ContactField.EMAILS,
  ContactField.PHONES,
  ContactField.SOCIAL_PROFILES,
  ContactField.THUMBNAIL,
] as const;

const PAGE_SIZE = 250;
const MAX_CONTACTS = 5_000;

export interface AccessibleDeviceContacts extends DeviceContactMappingResult {
  truncated: boolean;
}

export function getDeviceContactsPermission(): Promise<ContactsPermissionResponse> {
  return getPermissionsAsync();
}

export function requestDeviceContactsPermission(): Promise<ContactsPermissionResponse> {
  return requestPermissionsAsync();
}

export async function loadAccessibleDeviceContacts(): Promise<AccessibleDeviceContacts> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    throw new Error("System Contacts are available only in the iPhone or Android app.");
  }
  const rows: DeviceContactRow[] = [];
  const fetchLimit = MAX_CONTACTS + 1;
  for (let offset = 0; offset < fetchLimit; offset += PAGE_SIZE) {
    const limit = Math.min(PAGE_SIZE, fetchLimit - offset);
    const page = await Contact.getAllDetails(DEVICE_CONTACT_FIELDS, {
      limit,
      offset,
    });
    rows.push(...page);
    if (page.length < limit) break;
  }
  const truncated = rows.length > MAX_CONTACTS;
  const mapped = mapDeviceContacts(rows.slice(0, MAX_CONTACTS), Platform.OS);
  return {
    ...mapped,
    truncated,
  };
}

export async function presentLimitedContactsPicker(): Promise<string[]> {
  if (Platform.OS !== "ios") {
    throw new Error("Choosing additional limited contacts is available on iPhone.");
  }
  const contacts = await Contact.presentAccessPicker();
  return contacts.map((contact) => `system-contact:ios:${contact.id}`.slice(0, 300));
}
