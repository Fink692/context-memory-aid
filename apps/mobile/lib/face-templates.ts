import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const MODEL_VERSION = "unconfigured-local-model-v1";

function keyFor(contactId: string): string {
  const safeId = contactId.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  return `context.face.${safeId}`;
}

export interface StoredFaceTemplate {
  modelVersion: string;
  createdAt: string;
  embedding: number[];
}

export async function saveFaceTemplate(contactId: string, embedding: number[]): Promise<void> {
  if (Platform.OS === "web") {
    throw new Error("Secure biometric template storage is not available on web.");
  }
  if (embedding.length < 16 || embedding.length > 2_048 || embedding.some((value) => !Number.isFinite(value))) {
    throw new Error("Face template is invalid.");
  }
  const template: StoredFaceTemplate = {
    modelVersion: MODEL_VERSION,
    createdAt: new Date().toISOString(),
    embedding,
  };
  await SecureStore.setItemAsync(keyFor(contactId), JSON.stringify(template), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function loadFaceTemplate(contactId: string): Promise<StoredFaceTemplate | null> {
  if (Platform.OS === "web") return null;
  const raw = await SecureStore.getItemAsync(keyFor(contactId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredFaceTemplate;
    if (!Array.isArray(parsed.embedding) || parsed.modelVersion !== MODEL_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function deleteFaceTemplate(contactId: string): Promise<void> {
  if (Platform.OS === "web") return;
  await SecureStore.deleteItemAsync(keyFor(contactId));
}
