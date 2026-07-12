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
import { Platform } from "react-native";
import {
  addDeviceWatchSource,
  checkDeviceWatchSources,
  clearDeviceUpdateWatchData,
  deviceWatcherHealth,
  dismissDeviceWatchUpdate,
  listDeviceWatchSources,
  listDeviceWatchUpdates,
  removeDeviceWatchContact,
  removeDeviceWatchSource,
} from "./device-update-watcher";

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
  if (Platform.OS !== "web") return deviceWatcherHealth();
  return watcherRequest("/health", WatchHealthSchema);
}

export function listWatchSources(contactId?: string): Promise<WatchSource[]> {
  if (Platform.OS !== "web") return listDeviceWatchSources(contactId);
  const query = contactId ? `?contactId=${encodeURIComponent(contactId)}` : "";
  return watcherRequest(`/sources${query}`, WatchSourceListSchema);
}

export function addWatchSource(input: WatchSourceInput): Promise<WatchSource> {
  if (Platform.OS !== "web") return addDeviceWatchSource(input);
  const parsed = WatchSourceInputSchema.parse(input);
  return watcherRequest("/sources", WatchSourceSchema, { method: "POST", body: JSON.stringify(parsed) });
}

export function removeWatchSource(sourceId: string): Promise<{ ok: true }> {
  if (Platform.OS !== "web") return removeDeviceWatchSource(sourceId);
  return watcherRequest(`/sources/${encodeURIComponent(sourceId)}`, WatchOkSchema, { method: "DELETE" });
}

export function removeWatchContact(contactId: string): Promise<{ ok: true }> {
  if (Platform.OS !== "web") return removeDeviceWatchContact(contactId);
  return watcherRequest(`/contacts/${encodeURIComponent(contactId)}`, WatchOkSchema, { method: "DELETE" });
}

export function clearUpdateWatchData(): Promise<{ ok: true }> {
  if (Platform.OS !== "web") return clearDeviceUpdateWatchData();
  return watcherRequest("/data", WatchOkSchema, { method: "DELETE" });
}

export function listWatchUpdates(contactId?: string): Promise<WatchUpdate[]> {
  if (Platform.OS !== "web") return listDeviceWatchUpdates(contactId);
  const query = contactId ? `?contactId=${encodeURIComponent(contactId)}` : "";
  return watcherRequest(`/updates${query}`, WatchUpdateListSchema);
}

export function checkWatchSources(contactId?: string, force = true) {
  if (Platform.OS !== "web") return checkDeviceWatchSources(contactId, force);
  return watcherRequest("/check", WatchCheckReportSchema, {
    method: "POST",
    body: JSON.stringify({ ...(contactId ? { contactId } : {}), force }),
  }, 5 * 60_000);
}

export function dismissWatchUpdate(updateId: string): Promise<{ ok: true }> {
  if (Platform.OS !== "web") return dismissDeviceWatchUpdate(updateId);
  return watcherRequest(`/updates/${encodeURIComponent(updateId)}/dismiss`, WatchOkSchema, { method: "POST", body: "{}" });
}
