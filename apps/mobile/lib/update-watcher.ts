import {
  WatchCheckReportSchema,
  WatchHealthSchema,
  WatchOkSchema,
  WatchSourceInputSchema,
  WatchSourceListSchema,
  WatchSourceSchema,
  WatchUpdateListSchema,
  type WatchSource,
  type WatchSourceInput,
  type WatchUpdate,
} from "@context/shared";

const UPDATE_WATCH_BASE = "http://127.0.0.1:8789";

interface Parser<T> {
  parse(value: unknown): T;
}

async function watcherRequest<T>(route: string, schema: Parser<T>, init?: RequestInit, timeoutMs = 30_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${UPDATE_WATCH_BASE}${route}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof body?.error === "string" ? body.error : "The local watcher returned an error.");
    }
    return schema.parse(body);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The local watcher timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function watcherHealth() {
  return watcherRequest("/health", WatchHealthSchema);
}

export function listWatchSources(contactId?: string): Promise<WatchSource[]> {
  const query = contactId ? `?contactId=${encodeURIComponent(contactId)}` : "";
  return watcherRequest(`/sources${query}`, WatchSourceListSchema);
}

export function addWatchSource(input: WatchSourceInput): Promise<WatchSource> {
  const parsed = WatchSourceInputSchema.parse(input);
  return watcherRequest("/sources", WatchSourceSchema, { method: "POST", body: JSON.stringify(parsed) });
}

export function removeWatchSource(sourceId: string): Promise<{ ok: true }> {
  return watcherRequest(`/sources/${encodeURIComponent(sourceId)}`, WatchOkSchema, { method: "DELETE" });
}

export function removeWatchContact(contactId: string): Promise<{ ok: true }> {
  return watcherRequest(`/contacts/${encodeURIComponent(contactId)}`, WatchOkSchema, { method: "DELETE" });
}

export function clearUpdateWatchData(): Promise<{ ok: true }> {
  return watcherRequest("/data", WatchOkSchema, { method: "DELETE" });
}

export function listWatchUpdates(contactId?: string): Promise<WatchUpdate[]> {
  const query = contactId ? `?contactId=${encodeURIComponent(contactId)}` : "";
  return watcherRequest(`/updates${query}`, WatchUpdateListSchema);
}

export function checkWatchSources(contactId?: string) {
  return watcherRequest("/check", WatchCheckReportSchema, {
    method: "POST",
    body: JSON.stringify({ ...(contactId ? { contactId } : {}), force: true }),
  }, 5 * 60_000);
}

export function dismissWatchUpdate(updateId: string): Promise<{ ok: true }> {
  return watcherRequest(`/updates/${encodeURIComponent(updateId)}/dismiss`, WatchOkSchema, { method: "POST", body: "{}" });
}
