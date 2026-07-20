import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "context-device-update-watch-v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function clearUpdateWatchData(): Promise<{ ok: true }> {
  await AsyncStorage.removeItem(STORAGE_KEY);
  return { ok: true };
}

export async function removeWatchContact(contactId: string): Promise<{ ok: true }> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return { ok: true };
  try {
    const stored: unknown = JSON.parse(raw);
    if (!isRecord(stored) || !Array.isArray(stored.sources) || !Array.isArray(stored.updates)) {
      throw new Error("invalid legacy data");
    }
    const belongsToContact = (value: unknown) => isRecord(value) && value.contactId === contactId;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...stored,
      sources: stored.sources.filter((source) => !belongsToContact(source)),
      updates: stored.updates.filter((update) => !belongsToContact(update)),
    }));
  } catch {
    // This surface is no longer shipped. If its legacy payload is malformed,
    // privacy wins over preserving unusable experimental data.
    await AsyncStorage.removeItem(STORAGE_KEY);
  }
  return { ok: true };
}
