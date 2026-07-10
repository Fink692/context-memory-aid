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
