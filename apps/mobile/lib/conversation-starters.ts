const MAX_STARTER_LENGTH = 160;
const MAX_STARTERS = 8;

export function normalizeConversationStarters(topics: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  topics.forEach((topic) => {
    if (normalized.length >= MAX_STARTERS) return;
    const value = topic.trim().replace(/\s+/g, " ").slice(0, MAX_STARTER_LENGTH).trimEnd();
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) return;
    seen.add(key);
    normalized.push(value);
  });

  return normalized;
}
