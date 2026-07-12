import { NativeModules, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

interface NativeProfilePhotoPicker {
  pick(): Promise<{ uri: string } | null>;
  persist(uri: string): Promise<{ uri: string }>;
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
  if (!uri?.startsWith("file://") || !uri.includes("/ContextProfilePhotos/")) return;
  await FileSystem.deleteAsync(uri, { idempotent: true });
}

export async function persistPrivateProfilePhoto(uri: string | undefined): Promise<string | undefined> {
  if (!uri) return undefined;
  if (uri.startsWith("file://") && uri.includes("/ContextProfilePhotos/")) return uri;
  if (Platform.OS !== "ios" || !nativePicker?.persist || !uri.startsWith("file://")) return uri;
  const result = await nativePicker.persist(uri);
  const privateUri = result.uri.trim();
  if (!privateUri.startsWith("file://") || !privateUri.includes("/ContextProfilePhotos/")) {
    throw new Error("Context could not create a private copy of that profile photo.");
  }
  return privateUri.slice(0, 2_048);
}
