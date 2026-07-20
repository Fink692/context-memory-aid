import type { Contact } from "@context/shared";

const BADGE_PREFIX = "context://badge/";

export function badgePayload(badgeId: string): string {
  return `${BADGE_PREFIX}${encodeURIComponent(badgeId)}`;
}

export function contactIdFromQr(value: string, candidates: Contact[]): string | null {
  if (!value.startsWith(BADGE_PREFIX)) return null;
  try {
    const badgeId = decodeURIComponent(value.slice(BADGE_PREFIX.length));
    return candidates.find((contact) => contact.badgeId === badgeId)?.id ?? null;
  } catch {
    return null;
  }
}
