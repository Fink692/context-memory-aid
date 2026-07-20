import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";
import * as Sharing from "expo-sharing";

function safeFileStem(displayName: string): string {
  return displayName
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "contact";
}

export async function shareContactVCard(vCard: string, displayName: string): Promise<void> {
  if (Platform.OS === "web") {
    throw new Error("Contact-card file sharing is available in the iPhone app.");
  }
  if (!FileSystem.cacheDirectory) {
    throw new Error("A temporary contact-card directory is unavailable.");
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is unavailable right now.");
  }

  const uri = `${FileSystem.cacheDirectory}context-share-${safeFileStem(displayName)}-${Crypto.randomUUID()}.vcf`;
  try {
    await FileSystem.writeAsStringAsync(uri, vCard, { encoding: FileSystem.EncodingType.UTF8 });
    await Sharing.shareAsync(uri, {
      UTI: "public.vcard",
      mimeType: "text/vcard",
      dialogTitle: `Share ${displayName}`,
    });
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }
}
