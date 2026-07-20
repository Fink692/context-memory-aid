import type { Event } from "@context/shared";

export function relativeDate(value?: string): string | undefined {
  if (!value) return undefined;
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return undefined;
  const months = Math.max(0, Math.round((Date.now() - then.getTime()) / (30.44 * 86_400_000)));
  if (months < 1) return "this month";
  if (months === 1) return "1 month ago";
  if (months < 12) return `${months} months ago`;
  const years = Math.round(months / 12);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

export function displayDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export interface EventScheduleFormatOptions {
  locale?: Intl.LocalesArgument;
  timeZone?: string;
}

/** Formats an event's full local schedule without hiding its time or end. */
export function displayEventSchedule(
  event: Pick<Event, "startsAt" | "endsAt">,
  options: EventScheduleFormatOptions = {},
): string {
  const { locale, timeZone } = options;
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    ...(timeZone ? { timeZone } : {}),
  });
  const timeFormatter = new Intl.DateTimeFormat(locale, {
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  });
  const start = new Date(event.startsAt);
  const startDate = dateFormatter.format(start);
  const startTime = timeFormatter.format(start);
  if (!event.endsAt) return `${startDate} · ${startTime}`;

  const end = new Date(event.endsAt);
  const endDate = dateFormatter.format(end);
  const endTime = timeFormatter.format(end);
  return startDate === endDate
    ? `${startDate} · ${startTime}–${endTime}`
    : `${startDate} · ${startTime} – ${endDate} · ${endTime}`;
}
