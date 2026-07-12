import type { Contact } from "@context/shared";

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase();
}

export function findContactByIdentity(
  contacts: Contact[],
  displayName: string,
  company: string,
  excludingId?: string,
): Contact | undefined {
  const nameKey = normalize(displayName);
  const companyKey = normalize(company);
  return contacts.find((contact) => contact.id !== excludingId
    && normalize(contact.displayName) === nameKey
    && normalize(contact.company) === companyKey);
}
