import type { Contact } from "@context/shared";

export interface EventAssistantRefresher {
  recentUpdate?: string;
  lastDiscussed?: string;
  topic?: string;
}

function clean(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function eventAssistantRefresher(contact: Contact): EventAssistantRefresher {
  const recentUpdate = clean(contact.recentUpdate);
  const lastDiscussed = clean(contact.lastDiscussed);
  const topic = contact.conversationTopics.map(clean).find((value): value is string => Boolean(value));
  const refresher: EventAssistantRefresher = {};
  if (recentUpdate) refresher.recentUpdate = recentUpdate;
  if (lastDiscussed) refresher.lastDiscussed = lastDiscussed;
  if (topic) refresher.topic = topic;
  return refresher;
}

function contextScore(contact: Contact): number {
  const refresher = eventAssistantRefresher(contact);
  return Number(Boolean(refresher.recentUpdate)) * 4
    + Number(Boolean(refresher.lastDiscussed)) * 2
    + Number(Boolean(refresher.topic));
}

function lastSpokeTimestamp(contact: Contact): number {
  if (!contact.lastSpokeAt) return Number.NEGATIVE_INFINITY;
  const timestamp = Date.parse(contact.lastSpokeAt);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

/**
 * Put useful relationship context first, then surface the people whose context
 * has gone longest without a refresh. Name is the stable final tie-breaker.
 */
export function sortEventAssistantContacts(contacts: Contact[]): Contact[] {
  return [...contacts].sort((left, right) => {
    const contextDifference = contextScore(right) - contextScore(left);
    if (contextDifference) return contextDifference;

    const stalenessDifference = lastSpokeTimestamp(left) - lastSpokeTimestamp(right);
    if (stalenessDifference) return stalenessDifference;

    return left.displayName.localeCompare(right.displayName);
  });
}
