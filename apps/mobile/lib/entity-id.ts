function slug(value: string, maxLength: number): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLength);
}

export function createContactId(
  displayName: string,
  now: number = Date.now(),
  randomValue: number = Math.random(),
): string {
  const namePart = slug(displayName, 48) || "person";
  const randomPart = randomValue.toString(36).slice(2, 7).padEnd(5, "0");
  return `contact-${namePart}-${now.toString(36)}-${randomPart}`;
}
