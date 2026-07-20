import {
  CONTACT_SHARE_CARD_VERSION,
  ContactSchema,
  ContactShareCardSchema,
  ContactShareSocialLinkSchema,
  type Contact,
  type ContactShareCard,
  type ContactShareSocialLink,
  type SocialLink,
} from "@context/shared";
import { utf8ByteLength as countUtf8Bytes } from "./import-file-safety";

export type { ContactShareCard } from "@context/shared";

/** Fits beneath QR Version 40's byte capacity even at high error correction. */
export const MAX_CONTACT_SHARE_QR_UTF8_BYTES = 1_200;
/** Parsing is separately bounded for vCards received outside the QR flow. */
export const MAX_CONTACT_SHARE_VCARD_UTF8_BYTES = 32_000;

const MAX_VCARD_LOGICAL_LINES = 128;
const VCARD_FOLD_BYTES = 75;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const INVALID_VCARD_CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

export class ContactShareCodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContactShareCodecError";
  }
}

export interface ContactShareSelection {
  company: boolean;
  role: boolean;
  email: boolean;
  phone: boolean;
  socialLinkKeys: readonly string[];
}

export type ShareableSocialLink = ContactShareSocialLink & { key: string };

export type ContactShareContactFields = Pick<Contact, "displayName">
  & Partial<Pick<Contact, "company" | "role" | "email" | "phone" | "socialLinks">>;

const SOCIAL_HANDLE_URLS: Readonly<Record<string, (handle: string) => string>> = {
  bluesky: (handle) => `https://bsky.app/profile/${encodeURIComponent(handle)}`,
  facebook: (handle) => `https://www.facebook.com/${encodeURIComponent(handle)}`,
  github: (handle) => `https://github.com/${encodeURIComponent(handle)}`,
  instagram: (handle) => `https://www.instagram.com/${encodeURIComponent(handle)}/`,
  linkedin: (handle) => `https://www.linkedin.com/in/${encodeURIComponent(handle)}`,
  snapchat: (handle) => `https://www.snapchat.com/add/${encodeURIComponent(handle)}`,
  threads: (handle) => `https://www.threads.net/@${encodeURIComponent(handle)}`,
  tiktok: (handle) => `https://www.tiktok.com/@${encodeURIComponent(handle)}`,
  twitter: (handle) => `https://x.com/${encodeURIComponent(handle)}`,
  x: (handle) => `https://x.com/${encodeURIComponent(handle)}`,
  youtube: (handle) => `https://www.youtube.com/@${encodeURIComponent(handle)}`,
};

const PLATFORM_NAMES: Readonly<Record<string, string>> = {
  bluesky: "Bluesky",
  facebook: "Facebook",
  github: "GitHub",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  snapchat: "Snapchat",
  threads: "Threads",
  tiktok: "TikTok",
  twitter: "X",
  x: "X",
  youtube: "YouTube",
};

function platformKey(platform: string): string {
  return platform.normalize("NFKC").trim().toLowerCase().replace(/[\s_-]+/gu, "");
}

function normalizedHandle(value: string | undefined): string | undefined {
  const handle = value?.normalize("NFKC").trim().replace(/^@+/u, "");
  if (!handle || handle.length > 100 || CONTROL_CHARACTERS.test(handle)) return undefined;
  if (/[\s/\\?#:]/u.test(handle)) return undefined;
  return handle;
}

/** Returns a canonical HTTPS URL, rejecting credentials and non-web schemes. */
export function normalizeHttpsSocialUrl(value: string): string | undefined {
  if (CONTROL_CHARACTERS.test(value)) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    url.hash = "";
    return url.href;
  } catch {
    return undefined;
  }
}

function socialUrl(link: SocialLink): string | undefined {
  const directUrl = link.url ? normalizeHttpsSocialUrl(link.url) : undefined;
  if (directUrl) return directUrl;
  const handle = normalizedHandle(link.handle);
  const builder = SOCIAL_HANDLE_URLS[platformKey(link.platform)];
  return handle && builder ? normalizeHttpsSocialUrl(builder(handle)) : undefined;
}

function socialSelectionKey(link: ContactShareSocialLink): string {
  return `${encodeURIComponent(platformKey(link.platform))}:${encodeURIComponent(link.url)}`;
}

/**
 * Converts only safe profile links into HTTPS URLs. Unsupported handle-only
 * services are omitted instead of guessing a destination.
 */
export function shareableSocialLinks(contact: Contact): ShareableSocialLink[] {
  const links: ShareableSocialLink[] = [];
  const seen = new Set<string>();

  for (const source of contact.socialLinks ?? []) {
    const url = socialUrl(source);
    const platform = source.platform.normalize("NFKC").trim();
    const parsed = ContactShareSocialLinkSchema.safeParse({ platform, url });
    if (!parsed.success) continue;
    const identity = `${platformKey(parsed.data.platform)}\u0000${parsed.data.url}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    links.push({ ...parsed.data, key: socialSelectionKey(parsed.data) });
    if (links.length === 12) break;
  }

  return links;
}

export function defaultContactShareSelection(contact: Contact): ContactShareSelection {
  return {
    company: Boolean(contact.company),
    role: Boolean(contact.role),
    email: Boolean(contact.email),
    phone: Boolean(contact.phone),
    socialLinkKeys: shareableSocialLinks(contact).map((link) => link.key),
  };
}

/** Projects a private Contact by allowlist; it never spreads the source record. */
export function projectContactShareCard(
  contact: Contact,
  selection: ContactShareSelection,
): ContactShareCard {
  const selectedSocialKeys = new Set(selection.socialLinkKeys);
  const socialLinks = shareableSocialLinks(contact)
    .filter((link) => selectedSocialKeys.has(link.key))
    .map(({ platform, url }) => ({ platform, url }));

  return ContactShareCardSchema.parse({
    version: CONTACT_SHARE_CARD_VERSION,
    displayName: contact.displayName,
    ...(selection.company && contact.company ? { company: contact.company } : {}),
    ...(selection.role && contact.role ? { role: contact.role } : {}),
    ...(selection.email && contact.email ? { email: contact.email } : {}),
    ...(selection.phone && contact.phone ? { phone: contact.phone } : {}),
    ...(socialLinks.length ? { socialLinks } : {}),
  });
}

export function utf8ByteLength(value: string): number {
  return countUtf8Bytes(value);
}

export function isContactShareQrSafe(payload: string): boolean {
  return payload.length > 0 && utf8ByteLength(payload) <= MAX_CONTACT_SHARE_QR_UTF8_BYTES;
}

export function assertContactShareQrSafe(payload: string): void {
  if (!isContactShareQrSafe(payload)) {
    throw new ContactShareCodecError("This contact has too much selected information for a reliable QR code.");
  }
}

function escapeVCardText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\r", "\\n")
    .replaceAll("\n", "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
}

function unescapeVCardText(value: string): string {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (character !== "\\") {
      result += character;
      continue;
    }
    const escaped = value[index + 1];
    if (escaped === undefined) throw new ContactShareCodecError("The shared contact contains an incomplete escape.");
    if (escaped === "n" || escaped === "N") result += "\n";
    else if (escaped === "\\" || escaped === ";" || escaped === ",") result += escaped;
    else throw new ContactShareCodecError("The shared contact contains an unsupported escape.");
    index += 1;
  }
  return result;
}

function firstStructuredValue(value: string): string {
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") escaped = true;
    else if (character === ";") return value.slice(0, index);
  }
  return value;
}

function foldVCardLine(line: string): string[] {
  const folded: string[] = [];
  let part = "";
  let limit = VCARD_FOLD_BYTES;
  for (const character of line) {
    const next = `${part}${character}`;
    if (part && utf8ByteLength(next) > limit) {
      folded.push(folded.length ? ` ${part}` : part);
      part = character;
      limit = VCARD_FOLD_BYTES - 1;
    } else {
      part = next;
    }
  }
  folded.push(folded.length ? ` ${part}` : part);
  return folded;
}

function appleSocialProfileType(platform: string): string | undefined {
  // Apple Contacts treats TYPE as a service token, not arbitrary display text.
  // Preserve free-form networks through the standard URL property instead of
  // emitting a malformed X-SOCIALPROFILE username.
  return PLATFORM_NAMES[platformKey(platform)];
}

/** Produces an interoperable vCard 3.0 with CRLF endings and 75-byte folds. */
export function serializeContactShareVCard(input: ContactShareCard): string {
  const card = ContactShareCardSchema.parse(input);
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    // We store only a display name. Put it intact in the given-name component so
    // Apple Contacts preserves the visible name without falsely guessing a surname.
    `N:;${escapeVCardText(card.displayName)};;;`,
    `FN:${escapeVCardText(card.displayName)}`,
    `X-CONTEXT-SHARE-VERSION:${CONTACT_SHARE_CARD_VERSION}`,
    ...(card.company ? [`ORG:${escapeVCardText(card.company)}`] : []),
    ...(card.role ? [`TITLE:${escapeVCardText(card.role)}`] : []),
    ...(card.email ? [`EMAIL;TYPE=INTERNET:${escapeVCardText(card.email)}`] : []),
    ...(card.phone ? [`TEL:${escapeVCardText(card.phone)}`] : []),
    ...(card.socialLinks ?? []).flatMap((link) => {
      const appleType = appleSocialProfileType(link.platform);
      return [
        ...(appleType ? [`X-SOCIALPROFILE;TYPE=${appleType}:${link.url}`] : []),
        `URL:${link.url}`,
      ];
    }),
    "END:VCARD",
  ];
  return `${lines.flatMap(foldVCardLine).join("\r\n")}\r\n`;
}

interface ParsedVCardLine {
  name: string;
  parameters: Map<string, string>;
  value: string;
}

function splitHeader(header: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let quoted = false;
  for (let index = 0; index < header.length; index += 1) {
    const character = header[index];
    if (character === "\"") quoted = !quoted;
    else if (character === ";" && !quoted) {
      parts.push(header.slice(start, index));
      start = index + 1;
    }
  }
  if (quoted) throw new ContactShareCodecError("The shared contact contains an unfinished parameter.");
  parts.push(header.slice(start));
  return parts;
}

function contentDelimiter(line: string): number {
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\"") quoted = !quoted;
    else if (character === ":" && !quoted) return index;
  }
  return -1;
}

function parseVCardLine(line: string): ParsedVCardLine {
  const delimiter = contentDelimiter(line);
  if (delimiter <= 0) throw new ContactShareCodecError("The shared contact contains a malformed line.");
  const parts = splitHeader(line.slice(0, delimiter));
  const rawName = parts.shift()?.trim();
  if (!rawName) throw new ContactShareCodecError("The shared contact contains a nameless property.");
  const name = (rawName.split(".").pop() ?? rawName).toUpperCase();
  const parameters = new Map<string, string>();
  for (const parameter of parts) {
    const equals = parameter.indexOf("=");
    if (equals <= 0) throw new ContactShareCodecError("The shared contact contains a malformed parameter.");
    const parameterName = parameter.slice(0, equals).trim().toUpperCase();
    const parameterValue = parameter.slice(equals + 1).trim().replace(/^"|"$/gu, "");
    if (!parameterName || !parameterValue) {
      throw new ContactShareCodecError("The shared contact contains an invalid parameter.");
    }
    if (parameters.has(parameterName)) {
      if (parameterName !== "TYPE") {
        throw new ContactShareCodecError("The shared contact contains a repeated parameter.");
      }
      parameters.set(parameterName, `${parameters.get(parameterName)},${parameterValue}`);
    } else {
      parameters.set(parameterName, parameterValue);
    }
  }
  return { name, parameters, value: line.slice(delimiter + 1) };
}

function unfoldVCard(payload: string): string[] {
  if (INVALID_VCARD_CONTROL_CHARACTERS.test(payload)) {
    throw new ContactShareCodecError("The shared contact contains invalid control data.");
  }
  const physicalLines = payload.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  while (physicalLines[0]?.trim() === "") physicalLines.shift();
  while (physicalLines.at(-1)?.trim() === "") physicalLines.pop();

  const logicalLines: string[] = [];
  for (const line of physicalLines) {
    if (line.startsWith(" ") || line.startsWith("\t")) {
      const priorIndex = logicalLines.length - 1;
      if (priorIndex < 0) throw new ContactShareCodecError("The shared contact starts with an invalid folded line.");
      logicalLines[priorIndex] = `${logicalLines[priorIndex]}${line.slice(1)}`;
    } else {
      if (!line) throw new ContactShareCodecError("The shared contact contains an unexpected blank line.");
      logicalLines.push(line);
    }
    if (logicalLines.length > MAX_VCARD_LOGICAL_LINES) {
      throw new ContactShareCodecError("The shared contact contains too many fields.");
    }
  }
  return logicalLines;
}

function exactlyOne(lines: readonly ParsedVCardLine[], name: string): ParsedVCardLine {
  const matches = lines.filter((line) => line.name === name);
  if (matches.length !== 1) throw new ContactShareCodecError(`The shared contact needs exactly one ${name} field.`);
  return matches[0]!;
}

function optionalSingleton(lines: readonly ParsedVCardLine[], name: string): string | undefined {
  const matches = lines.filter((line) => line.name === name);
  if (matches.length > 1) throw new ContactShareCodecError(`The shared contact has more than one ${name} field.`);
  const value = matches[0]?.value;
  return value === undefined ? undefined : unescapeVCardText(value);
}

function hasType(line: ParsedVCardLine, expectedType: string): boolean {
  return line.parameters.get("TYPE")
    ?.split(",")
    .some((value) => value.trim().toUpperCase() === expectedType.toUpperCase()) ?? false;
}

function optionalPreferredValue(lines: readonly ParsedVCardLine[], name: string): string | undefined {
  const matches = lines.filter((line) => line.name === name);
  if (!matches.length) return undefined;
  if (matches.length === 1) return unescapeVCardText(matches[0]!.value);

  const preferred = matches.filter((line) => hasType(line, "PREF"));
  if (preferred.length !== 1) {
    throw new ContactShareCodecError(
      `The shared contact has ambiguous ${name} fields. Choose one preferred value before sharing.`,
    );
  }
  return unescapeVCardText(preferred[0]!.value);
}

function assertAllowedParameters(
  line: ParsedVCardLine,
  allowed: ReadonlySet<string>,
): void {
  for (const [name, value] of line.parameters) {
    if (!allowed.has(name)) {
      throw new ContactShareCodecError(`The shared contact uses an unsupported ${name} parameter on ${line.name}.`);
    }
    if (name === "CHARSET" && value.toUpperCase() !== "UTF-8") {
      throw new ContactShareCodecError("The shared contact uses an unsupported text encoding.");
    }
  }
}

const NO_PARAMETERS = new Set<string>();
const TEXT_PARAMETERS = new Set(["CHARSET", "LANGUAGE"]);
const TYPED_TEXT_PARAMETERS = new Set(["CHARSET", "TYPE"]);
const SOCIAL_PARAMETERS = new Set(["TYPE", "X-CONTEXT-PLATFORM"]);

function decodedPlatformParameter(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value).normalize("NFKC").trim() || undefined;
  } catch {
    return undefined;
  }
}

function knownPlatformForHost(hostname: string): string | undefined {
  const host = hostname.toLowerCase().replace(/^www\./u, "");
  const matches = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (matches("linkedin.com")) return "LinkedIn";
  if (matches("instagram.com")) return "Instagram";
  if (matches("github.com")) return "GitHub";
  if (matches("x.com") || matches("twitter.com")) return "X";
  if (matches("facebook.com")) return "Facebook";
  if (matches("tiktok.com")) return "TikTok";
  if (matches("threads.net")) return "Threads";
  if (matches("bsky.app")) return "Bluesky";
  if (matches("youtube.com") || matches("youtu.be")) return "YouTube";
  if (matches("snapchat.com")) return "Snapchat";
  return undefined;
}

function platformForSocialLine(line: ParsedVCardLine, url: string): string {
  const explicit = decodedPlatformParameter(line.parameters.get("X-CONTEXT-PLATFORM"));
  if (explicit) return explicit;
  const type = line.parameters.get("TYPE")
    ?.split(",")
    .map((value) => value.trim())
    .find((value) => value && !/^(?:HOME|WORK|PREF|INTERNET)$/iu.test(value));
  if (type) {
    const decodedType = decodedPlatformParameter(type);
    if (decodedType) {
      const platform = decodedType.replace(/^X-/iu, "");
      const key = platformKey(platform);
      return PLATFORM_NAMES[key] ?? platform;
    }
  }
  return knownPlatformForHost(new URL(url).hostname) ?? "Website";
}

function parseSocialLinks(lines: readonly ParsedVCardLine[]): ContactShareSocialLink[] | undefined {
  const links: ContactShareSocialLink[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (line.name !== "URL" && line.name !== "X-SOCIALPROFILE") continue;
    const url = normalizeHttpsSocialUrl(line.value);
    if (!url) continue;
    const parsed = ContactShareSocialLinkSchema.safeParse({
      platform: platformForSocialLine(line, url),
      url,
    });
    if (!parsed.success) continue;
    if (seen.has(parsed.data.url)) continue;
    seen.add(parsed.data.url);
    links.push(parsed.data);
    if (links.length === 12) break;
  }
  return links.length ? links : undefined;
}

/** Parses one bounded vCard and drops every property outside the public allowlist. */
export function parseContactShareVCard(payload: string): ContactShareCard {
  if (typeof payload !== "string" || utf8ByteLength(payload) > MAX_CONTACT_SHARE_VCARD_UTF8_BYTES) {
    throw new ContactShareCodecError("The shared contact is too large to import safely.");
  }
  const logicalLines = unfoldVCard(payload);
  const lines = logicalLines.map(parseVCardLine);
  if (lines.length < 5
    || lines[0]?.name !== "BEGIN"
    || lines[0]?.value.toUpperCase() !== "VCARD"
    || lines.at(-1)?.name !== "END"
    || lines.at(-1)?.value.toUpperCase() !== "VCARD"
    || lines.filter((line) => line.name === "BEGIN" || line.name === "END").length !== 2) {
    throw new ContactShareCodecError("The payload must contain exactly one complete vCard.");
  }

  const body = lines.slice(1, -1);
  const versionLine = exactlyOne(body, "VERSION");
  assertAllowedParameters(versionLine, NO_PARAMETERS);
  if (versionLine.value.trim() !== "3.0") {
    throw new ContactShareCodecError("Only vCard 3.0 contact shares are supported.");
  }
  // N is mandatory in vCard 3.0. We validate presence but intentionally do not import it.
  const nameLine = exactlyOne(body, "N");
  assertAllowedParameters(nameLine, TEXT_PARAMETERS);
  const formattedNameLine = exactlyOne(body, "FN");
  assertAllowedParameters(formattedNameLine, TEXT_PARAMETERS);
  const displayName = unescapeVCardText(formattedNameLine.value);
  const shareVersions = body.filter((line) => line.name === "X-CONTEXT-SHARE-VERSION");
  if (shareVersions.length > 1
    || (shareVersions[0] && shareVersions[0].value.trim() !== String(CONTACT_SHARE_CARD_VERSION))) {
    throw new ContactShareCodecError("This contact share uses an unsupported version.");
  }
  if (shareVersions[0]) assertAllowedParameters(shareVersions[0], NO_PARAMETERS);

  for (const line of body) {
    if (line.name === "ORG" || line.name === "TITLE") assertAllowedParameters(line, TEXT_PARAMETERS);
    else if (line.name === "EMAIL" || line.name === "TEL") assertAllowedParameters(line, TYPED_TEXT_PARAMETERS);
    else if (line.name === "URL" || line.name === "X-SOCIALPROFILE") assertAllowedParameters(line, SOCIAL_PARAMETERS);
  }

  const rawCompany = optionalSingleton(body, "ORG");
  const company = rawCompany === undefined ? undefined : unescapeVCardText(firstStructuredValue(
    body.find((line) => line.name === "ORG")!.value,
  ));
  const role = optionalSingleton(body, "TITLE");
  const email = optionalPreferredValue(body, "EMAIL");
  const phone = optionalPreferredValue(body, "TEL");
  const socialLinks = parseSocialLinks(body);

  const parsed = ContactShareCardSchema.safeParse({
    version: CONTACT_SHARE_CARD_VERSION,
    displayName,
    ...(company ? { company } : {}),
    ...(role ? { role } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(socialLinks ? { socialLinks } : {}),
  });
  if (!parsed.success) throw new ContactShareCodecError("The shared contact contains invalid profile fields.");
  return parsed.data;
}

/** Returns only writable public fields for a receiver-side update preview. */
export function contactShareCardToContactFields(input: ContactShareCard): ContactShareContactFields {
  const card = ContactShareCardSchema.parse(input);
  return {
    displayName: card.displayName,
    ...(card.company ? { company: card.company } : {}),
    ...(card.role ? { role: card.role } : {}),
    ...(card.email ? { email: card.email } : {}),
    ...(card.phone ? { phone: card.phone } : {}),
    ...(card.socialLinks ? { socialLinks: card.socialLinks } : {}),
  };
}

/** Creates a private-model Contact with no memories, recognition data, or inferred context. */
export function createContactFromShare(input: ContactShareCard, id: string): Contact {
  return ContactSchema.parse({
    id,
    ...contactShareCardToContactFields(input),
    conversationTopics: [],
    recognitionEnabled: false,
    timeline: [],
  });
}
