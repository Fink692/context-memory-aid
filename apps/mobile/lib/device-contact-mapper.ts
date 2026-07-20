import {
  ImportContactSchema,
  SocialLinkSchema,
  type ImportContact,
  type SocialLink,
} from "@context/shared";

interface DeviceEmailRow {
  address?: string | null | undefined;
}

interface DevicePhoneRow {
  number?: string | null | undefined;
}

interface DeviceSocialProfileRow {
  label?: string | null | undefined;
  service?: string | null | undefined;
  username?: string | null | undefined;
  url?: string | null | undefined;
}

export interface DeviceContactRow {
  id: string;
  fullName?: string | null | undefined;
  givenName?: string | null | undefined;
  middleName?: string | null | undefined;
  familyName?: string | null | undefined;
  company?: string | null | undefined;
  jobTitle?: string | null | undefined;
  emails?: DeviceEmailRow[] | null | undefined;
  phones?: DevicePhoneRow[] | null | undefined;
  socialProfiles?: DeviceSocialProfileRow[] | null | undefined;
  thumbnail?: string | null | undefined;
  image?: string | null | undefined;
}

export interface DeviceContactMappingResult {
  contacts: ImportContact[];
  skipped: number;
}

function clean(value: string | null | undefined, maxLength: number): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function firstValidEmail(rows: DeviceEmailRow[] | null | undefined): string | undefined {
  for (const row of rows ?? []) {
    const parsed = ImportContactSchema.shape.email.safeParse(clean(row.address, 254));
    if (parsed.success && parsed.data) return parsed.data;
  }
  return undefined;
}

function firstValidPhone(rows: DevicePhoneRow[] | null | undefined): string | undefined {
  for (const row of rows ?? []) {
    const parsed = ImportContactSchema.shape.phone.safeParse(clean(row.number, 40));
    if (parsed.success && parsed.data) return parsed.data;
  }
  return undefined;
}

function socialLinksFrom(
  rows: DeviceSocialProfileRow[] | null | undefined,
): SocialLink[] | undefined {
  const links: SocialLink[] = [];
  const seen = new Set<string>();
  for (const row of rows ?? []) {
    const platform = clean(row.service, 40) ?? clean(row.label, 40) ?? "Social";
    const handle = clean(row.username, 100);
    const url = clean(row.url, 2_048);
    let parsed = SocialLinkSchema.safeParse({ platform, handle, url });
    if (!parsed.success && handle) {
      parsed = SocialLinkSchema.safeParse({ platform, handle });
    }
    if (!parsed.success) continue;
    const key = `${parsed.data.platform}\u0000${parsed.data.handle ?? ""}\u0000${parsed.data.url ?? ""}`
      .toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(parsed.data);
    if (links.length === 12) break;
  }
  return links.length ? links : undefined;
}

function localPhotoUri(row: DeviceContactRow): string | undefined {
  const rawCandidate = clean(row.thumbnail, 2_048) ?? clean(row.image, 2_048);
  const candidate = rawCandidate?.startsWith("/")
    ? `file://${encodeURI(rawCandidate)}`
    : rawCandidate;
  const parsed = ImportContactSchema.shape.photoUri.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

export function mapDeviceContact(
  row: DeviceContactRow,
  platform: "ios" | "android",
): ImportContact | undefined {
  const displayName = clean(row.fullName, 100) ?? clean(
    [row.givenName, row.middleName, row.familyName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(" "),
    100,
  );
  const nativeId = row.id.trim();
  if (!displayName || !nativeId) return undefined;

  const company = clean(row.company, 120);
  const role = clean(row.jobTitle, 120);
  const email = firstValidEmail(row.emails);
  const phone = firstValidPhone(row.phones);
  const socialLinks = socialLinksFrom(row.socialProfiles);
  const photoUri = localPhotoUri(row);

  const parsed = ImportContactSchema.safeParse({
    sourceId: `system-contact:${platform}:${nativeId}`.slice(0, 300),
    displayName,
    ...(company ? { company } : {}),
    ...(role ? { role } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(socialLinks ? { socialLinks } : {}),
    ...(photoUri ? { photoUri } : {}),
  });
  return parsed.success ? parsed.data : undefined;
}

export function mapDeviceContacts(
  rows: DeviceContactRow[],
  platform: "ios" | "android",
): DeviceContactMappingResult {
  const contacts: ImportContact[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const row of rows) {
    const contact = mapDeviceContact(row, platform);
    if (!contact?.sourceId || seen.has(contact.sourceId)) {
      skipped += 1;
      continue;
    }
    seen.add(contact.sourceId);
    contacts.push(contact);
  }
  return { contacts, skipped };
}
