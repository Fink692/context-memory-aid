import type { ActionItem, Memory } from "@context/shared";

export interface EditableFollowUp {
  id: string;
  title: string;
  dueAt?: string;
  eventId?: string;
}

export function suggestedTimelineSummary(note: string, maxLength = 500): string {
  const normalized = note.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function parseMemoryTags(value: string, maxTags = 8): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const candidate of value.split(/[,;\n]/)) {
    const tag = candidate.trim().slice(0, 40).trimEnd();
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length === maxTags) break;
  }
  return tags;
}

export function editableFollowUpsForMemory(
  memory: Pick<Memory, "id" | "nextSteps">,
  actions: ActionItem[],
): EditableFollowUp[] {
  const linked = actions
    .filter((action) => action.memoryId === memory.id)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  if (linked.length) {
    return linked.flatMap((action) => action.status === "open" ? [{
      id: action.id,
      title: action.title,
      ...(action.dueAt ? { dueAt: action.dueAt } : {}),
      ...(action.eventId ? { eventId: action.eventId } : {}),
    }] : []);
  }
  return memory.nextSteps.map((title, index) => ({ id: `legacy-${index}`, title }));
}

export function isoWithSelectedLocalDate(currentIso: string, selectedDate: Date): string {
  const current = new Date(currentIso);
  const next = Number.isNaN(current.getTime()) ? new Date() : current;
  next.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
  return next.toISOString();
}
