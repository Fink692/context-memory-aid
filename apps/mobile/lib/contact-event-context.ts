import type { Event } from "@context/shared";

export function activeEventForContact(
  events: Event[],
  currentEventId: string,
  contactId: string | undefined,
): Event | undefined {
  if (!contactId) return undefined;
  return events.find((event) =>
    event.id === currentEventId && event.attendeeContactIds.includes(contactId),
  );
}
