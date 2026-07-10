import type { Contact } from "@context/shared";

export function contactIdFromQr(value: string, candidates: Contact[]): string | null {
  const prefix = "context://contact/";
  if (!value.startsWith(prefix)) return null;
  try {
    const contactId = decodeURIComponent(value.slice(prefix.length));
    return candidates.some((contact) => contact.id === contactId) ? contactId : null;
  } catch {
    return null;
  }
}
