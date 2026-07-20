import type { Contact, SocialLink } from "@context/shared";

type ContactUpdate = Partial<Omit<Contact, "id" | "timeline">>;
export type DuplicatePhotoIntent = "preserve" | "remove" | "replace";

function socialKey(link: SocialLink): string {
  return `${link.platform.trim().toLocaleLowerCase()}|${(link.url ?? link.handle ?? "").trim().toLocaleLowerCase()}`;
}

function mergeSocialLinks(incoming: SocialLink[] = [], existing: SocialLink[] = []): SocialLink[] | undefined {
  const seen = new Set<string>();
  const merged = [...incoming, ...existing].filter((link) => {
    const key = socialKey(link);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
  return merged.length ? merged : undefined;
}

export function duplicateContactUpdates(
  existing: Contact,
  incoming: Contact,
  photoIntent: DuplicatePhotoIntent = "preserve",
): ContactUpdate {
  const photoUpdate: Pick<ContactUpdate, "photoUri"> = photoIntent === "remove"
    ? { photoUri: undefined }
    : photoIntent === "replace"
      ? { photoUri: incoming.photoUri }
      : existing.photoUri
        ? { photoUri: existing.photoUri }
        : {};
  return {
    displayName: incoming.displayName,
    company: incoming.company ?? existing.company,
    role: incoming.role ?? existing.role,
    email: incoming.email ?? existing.email,
    phone: incoming.phone ?? existing.phone,
    socialLinks: mergeSocialLinks(incoming.socialLinks, existing.socialLinks),
    ...photoUpdate,
    metAt: incoming.metAt ?? existing.metAt,
    relationshipContext: incoming.relationshipContext ?? existing.relationshipContext,
    recognitionEnabled: existing.recognitionEnabled || incoming.recognitionEnabled,
  };
}

export function duplicateResolutionMessage(
  displayName: string,
  eventName: string | undefined,
  includeInEvent: boolean,
): string {
  const eventResult = eventName
    ? includeInEvent
      ? `Either choice will also add the resulting person to ${eventName}.`
      : `Neither choice will add them to ${eventName} because the event option is off.`
    : "No event link will be changed.";
  return `${displayName} at this company is already saved. Update Existing applies the details, notes, social profiles, and photo you entered while keeping other saved context. Save Separately creates another person. ${eventResult}`;
}
