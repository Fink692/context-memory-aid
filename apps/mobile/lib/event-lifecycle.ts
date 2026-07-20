import type { Event } from "@context/shared";

const DEFAULT_EVENT_DURATION_MS = 12 * 60 * 60 * 1_000;

export function eventEndsAt(event: Pick<Event, "startsAt" | "endsAt">): number {
  const startsAt = new Date(event.startsAt).getTime();
  if (event.endsAt) return new Date(event.endsAt).getTime();
  return startsAt + DEFAULT_EVENT_DURATION_MS;
}
export function eventHasEnded(event: Pick<Event, "startsAt" | "endsAt">, now = new Date()): boolean {
  const endsAt = eventEndsAt(event);
  return !Number.isNaN(endsAt) && endsAt < now.getTime();
}
