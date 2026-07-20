import type { Contact, ContactShareCard } from "@context/shared";

export type ContactShareConflictField = "displayName" | "company" | "role" | "email" | "phone" | "socialLinks";
export type ContactShareIdentifierField = "email" | "phone";

export class ContactShareReceiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContactShareReceiveError";
  }
}

export interface ContactShareIdentifierEvidence {
  emailContactIds: readonly string[];
  phoneContactIds: readonly string[];
  conflicting: boolean;
}

export interface ContactShareConflictRow {
  field: ContactShareConflictField;
  label: string;
  current: string;
  received: string;
}

function normalizedText(value: string | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase();
}

function normalizedPhone(value: string | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function socialSummary(links: ContactShareCard["socialLinks"] | Contact["socialLinks"]): string {
  return (links ?? []).map((link) => {
    const detail = link.url ?? ("handle" in link ? link.handle : undefined) ?? "";
    return `${link.platform}: ${detail}`;
  }).join(" · ");
}

export function contactShareIdentifierEvidence(
  contacts: readonly Contact[],
  card: ContactShareCard,
): ContactShareIdentifierEvidence {
  const email = normalizedText(card.email);
  const phone = normalizedPhone(card.phone);
  const emailContactIds = email
    ? contacts.filter((contact) => normalizedText(contact.email) === email).map((contact) => contact.id)
    : [];
  const phoneContactIds = phone.length >= 7
    ? contacts.filter((contact) => normalizedPhone(contact.phone) === phone).map((contact) => contact.id)
    : [];
  const sameOwners = emailContactIds.length === phoneContactIds.length
    && emailContactIds.every((id) => phoneContactIds.includes(id));
  return {
    emailContactIds,
    phoneContactIds,
    conflicting: emailContactIds.length > 0 && phoneContactIds.length > 0 && !sameOwners,
  };
}

/** Finds candidates only; the receiving screen always requires an explicit save choice. */
export function findContactShareMatches(contacts: readonly Contact[], card: ContactShareCard): Contact[] {
  const evidence = contactShareIdentifierEvidence(contacts, card);
  const directIds = new Set([...evidence.emailContactIds, ...evidence.phoneContactIds]);
  if (directIds.size) {
    return contacts
      .filter((contact) => directIds.has(contact.id))
      .sort((left, right) => {
        const score = (contact: Contact) => (
          Number(evidence.emailContactIds.includes(contact.id))
          + Number(evidence.phoneContactIds.includes(contact.id))
        );
        return score(right) - score(left);
      });
  }

  const name = normalizedText(card.displayName);
  const company = normalizedText(card.company);
  return contacts.filter((contact) => (
    normalizedText(contact.displayName) === name
    && (!company || !normalizedText(contact.company) || normalizedText(contact.company) === company)
  ));
}

export function blockedIdentifierFieldsForMatch(
  evidence: ContactShareIdentifierEvidence,
  contactId: string,
): ReadonlySet<ContactShareIdentifierField> {
  const blocked = new Set<ContactShareIdentifierField>();
  if (evidence.emailContactIds.length && !evidence.emailContactIds.includes(contactId)) blocked.add("email");
  if (evidence.phoneContactIds.length && !evidence.phoneContactIds.includes(contactId)) blocked.add("phone");
  return blocked;
}

export function contactShareConflictRows(
  existing: Contact,
  card: ContactShareCard,
): ContactShareConflictRow[] {
  const values: ContactShareConflictRow[] = [
    { field: "displayName", label: "Name", current: existing.displayName, received: card.displayName },
    { field: "company", label: "Company", current: existing.company ?? "", received: card.company ?? "" },
    { field: "role", label: "Role", current: existing.role ?? "", received: card.role ?? "" },
    { field: "email", label: "Email", current: existing.email ?? "", received: card.email ?? "" },
    { field: "phone", label: "Phone", current: existing.phone ?? "", received: card.phone ?? "" },
    { field: "socialLinks", label: "Social Profiles", current: socialSummary(existing.socialLinks), received: socialSummary(card.socialLinks) },
  ];
  return values.filter((row) => (
    row.current
    && row.received
    && (row.field === "displayName"
      ? row.current.trim() !== row.received.trim()
      : normalizedText(row.current) !== normalizedText(row.received))
  ));
}

/**
 * Builds public-field-only updates. Missing saved fields are safely enriched;
 * conflicting fields change only when the receiver explicitly chooses them.
 */
export function contactShareUpdates(
  existing: Contact,
  card: ContactShareCard,
  useReceivedFields: ReadonlySet<ContactShareConflictField>,
  blockedReceivedFields: ReadonlySet<ContactShareIdentifierField> = new Set(),
): Partial<Omit<Contact, "id" | "timeline">> {
  const updates: Partial<Omit<Contact, "id" | "timeline">> = {};
  for (const field of ["displayName", "company", "role", "email", "phone"] as const) {
    const receivedValue = card[field];
    if (receivedValue
      && !blockedReceivedFields.has(field as ContactShareIdentifierField)
      && (!existing[field] || useReceivedFields.has(field))) {
      updates[field] = receivedValue;
    }
  }

  if (card.socialLinks?.length
    && (!(existing.socialLinks?.length) || useReceivedFields.has("socialLinks"))) {
    const receivedPlatforms = new Set(card.socialLinks.map((link) => normalizedText(link.platform)));
    const mergedSocialLinks = [
      ...card.socialLinks,
      ...(existing.socialLinks ?? []).filter((link) => !receivedPlatforms.has(normalizedText(link.platform))),
    ];
    if (mergedSocialLinks.length > 12) {
      throw new ContactShareReceiveError(
        "This update would exceed the 12-profile limit. Remove a saved social profile first, then try the update again.",
      );
    }
    updates.socialLinks = mergedSocialLinks;
  }
  return updates;
}
