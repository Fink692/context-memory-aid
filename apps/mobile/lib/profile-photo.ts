import { NativeModules, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

interface NativeProfilePhotoPicker {
  pick(): Promise<{ uri: string } | null>;
  persist(uri: string): Promise<{ uri: string }>;
  prune?(referencedUris: string[]): Promise<{ removed: number; retained: number }>;
  clear(): Promise<void>;
}

const nativePicker = NativeModules.ContextProfilePhotoPicker as NativeProfilePhotoPicker | undefined;

export function canPickProfilePhoto(): boolean {
  return Platform.OS === "ios" && Boolean(nativePicker?.pick);
}

export async function pickProfilePhoto(): Promise<string | undefined> {
  if (!canPickProfilePhoto() || !nativePicker) {
    throw new Error("Profile photo selection is available in the native iPhone app.");
  }
  const result = await nativePicker.pick();
  const uri = result?.uri?.trim();
  if (!uri?.startsWith("file://")) return undefined;
  return uri.slice(0, 2_048);
}

export async function deletePrivateProfilePhoto(uri: string | undefined): Promise<void> {
  if (!uri || !isPrivateProfilePhotoUri(uri)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

export async function deletePrivateProfilePhotos(uris: readonly string[]): Promise<string[]> {
  const targets = [...new Set(uris)].filter(isPrivateProfilePhotoUri);
  const results = await Promise.allSettled(targets.map((uri) => deletePrivateProfilePhoto(uri)));
  return targets.filter((_, index) => results[index]?.status === "rejected");
}

export function isPrivateProfilePhotoUri(uri: string | undefined): boolean {
  return Boolean(uri?.startsWith("file://") && uri.includes("/ContextProfilePhotos/"));
}

export async function clearPrivateProfilePhotos(): Promise<void> {
  if (Platform.OS !== "ios") return;
  if (!nativePicker?.clear) {
    throw new Error("This build cannot clear private profile photos. Install the latest native iPhone build and try again.");
  }
  await nativePicker.clear();
}

export async function prunePrivateProfilePhotos(
  referencedUris: readonly (string | undefined)[],
): Promise<{ removed: number; retained: number }> {
  if (Platform.OS !== "ios" || !nativePicker?.prune) {
    return { removed: 0, retained: 0 };
  }
  const managedUris = [...new Set(referencedUris.filter((uri): uri is string =>
    isPrivateProfilePhotoUri(uri)))];
  return nativePicker.prune(managedUris);
}

export async function persistPrivateProfilePhoto(uri: string | undefined): Promise<string | undefined> {
  if (!uri) return undefined;
  if (isPrivateProfilePhotoUri(uri)) return uri;
  if (Platform.OS !== "ios" || !nativePicker?.persist || !uri.startsWith("file://")) return uri;
  const result = await nativePicker.persist(uri);
  const privateUri = result.uri.trim();
  if (!isPrivateProfilePhotoUri(privateUri)) {
    throw new Error("Context could not create a private copy of that profile photo.");
  }
  return privateUri.slice(0, 2_048);
}
