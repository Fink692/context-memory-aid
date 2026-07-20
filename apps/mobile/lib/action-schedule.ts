import type { ActionItem } from "@context/shared";

export type ActionDueBucket = "overdue" | "today" | "upcoming" | "undated";
export type QuickDueChoice = "none" | "today" | "tomorrow" | "next-week";

function startOfLocalDay(value: Date): Date {
  const day = new Date(value);
  day.setHours(0, 0, 0, 0);
  return day;
}
function endOfLocalDay(value: Date): Date {
  const day = new Date(value);
  day.setHours(23, 59, 59, 999);
  return day;
}

export function actionDueBucket(dueAt: string | undefined, now = new Date()): ActionDueBucket {
  if (!dueAt) return "undated";
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "undated";
  if (due < startOfLocalDay(now)) return "overdue";
  if (due <= endOfLocalDay(now)) return "today";
  return "upcoming";
}

export function dueAtForChoice(choice: QuickDueChoice, now = new Date()): string | undefined {
  if (choice === "none") return undefined;
  const due = new Date(now);
  if (choice === "tomorrow") due.setDate(due.getDate() + 1);
  if (choice === "next-week") due.setDate(due.getDate() + 7);
  return endOfLocalDay(due).toISOString();
}

export function inferredQuickDueChoice(dueAt: string | undefined, now = new Date()): QuickDueChoice | "existing" {
  if (!dueAt) return "none";
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "none";
  const day = startOfLocalDay(due).getTime();
  const today = startOfLocalDay(now);
  if (day === today.getTime()) return "today";
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (day === tomorrow.getTime()) return "tomorrow";
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  if (day === nextWeek.getTime()) return "next-week";
  return "existing";
}

export function sortOpenActions(actions: ActionItem[]): ActionItem[] {
  return actions
    .filter((action) => action.status === "open")
    .sort((left, right) => {
      if (left.dueAt && right.dueAt) return left.dueAt.localeCompare(right.dueAt) || left.createdAt.localeCompare(right.createdAt);
      if (left.dueAt) return -1;
      if (right.dueAt) return 1;
      return left.createdAt.localeCompare(right.createdAt);
    });
}
