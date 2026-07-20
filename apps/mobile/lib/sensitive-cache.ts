import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

const DOCUMENT_PICKER_DIRECTORY = "DocumentPicker";
const SENSITIVE_FILE_PREFIXES = [
  "context-backup-",
  "context-photo-restore-",
  "context-import-",
  "context-share-",
];

export function isSensitiveCacheEntry(name: string): boolean {
  return name === DOCUMENT_PICKER_DIRECTORY
    || SENSITIVE_FILE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export async function deletePickedDocumentCacheFile(uri: string | undefined): Promise<void> {
  if (!uri || Platform.OS === "web" || !FileSystem.cacheDirectory) return;
  const documentPickerDirectory = `${FileSystem.cacheDirectory}${DOCUMENT_PICKER_DIRECTORY}/`;
  if (!uri.startsWith(documentPickerDirectory)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

export async function clearSensitiveTemporaryFiles(): Promise<void> {
  if (Platform.OS === "web" || !FileSystem.cacheDirectory) return;
  const cacheDirectory = FileSystem.cacheDirectory;
  let entries: string[] = [];
  try {
    entries = await FileSystem.readDirectoryAsync(cacheDirectory);
  } catch (error) {
    throw new Error("Context could not inspect its temporary import and backup storage.", { cause: error });
  }
  const results = await Promise.allSettled(entries
    .filter(isSensitiveCacheEntry)
    .map((entry) => FileSystem.deleteAsync(`${cacheDirectory}${entry}`, { idempotent: true })));
  if (results.some((result) => result.status === "rejected")) {
    throw new Error("Context could not remove every temporary import or backup file.");
  }
}
