import * as FileSystem from "expo-file-system/legacy";
import {
  WorkspaceBackupSchema,
  type WorkspaceBackup,
  type WorkspaceBackupPhotoAsset,
  type WorkspaceBackupV2,
} from "@context/shared";
import {
  deletePrivateProfilePhoto,
  deletePrivateProfilePhotos,
  isPrivateProfilePhotoUri,
  persistPrivateProfilePhoto,
} from "@/lib/profile-photo";
import {
  buildWorkspaceBackupV2,
  privateProfilePhotoUris,
  workspaceRecordsFromBackup,
  type WorkspaceRecords,
} from "@/lib/workspace-backup-core";
import { useAppStore } from "@/store/app-store";

const MAX_BACKUP_PHOTO_BYTES = 6_000_000;
const MAX_BACKUP_PHOTO_BYTES_TOTAL = 30_000_000;
const MAX_BACKUP_PHOTO_BASE64_TOTAL = 40_000_000;

function currentWorkspaceRecords(): WorkspaceRecords {
  const state = useAppStore.getState();
  return {
    contacts: state.contacts,
    events: state.events,
    actions: state.actions,
    entities: state.entities,
    relationships: state.relationships,
    connectionDecisions: state.connectionDecisions,
  };
}

async function photoAssetsForWorkspace(
  workspace: WorkspaceRecords,
): Promise<Map<string, WorkspaceBackupPhotoAsset>> {
  const assets = new Map<string, WorkspaceBackupPhotoAsset>();
  let totalPhotoBytes = 0;
  let totalBase64Characters = 0;
  for (const [index, contact] of workspace.contacts.entries()) {
    const photoUri = contact.photoUri;
    if (!photoUri) continue;
    if (!isPrivateProfilePhotoUri(photoUri)) {
      throw new Error(`The photo for ${contact.displayName} is not stored in Context’s protected photo folder. Remove or replace it before exporting.`);
    }
    let base64: string;
    try {
      const info = await FileSystem.getInfoAsync(photoUri);
      if (!info.exists || info.isDirectory || typeof info.size !== "number") {
        throw new Error("Photo file details are unavailable.");
      }
      if (info.size > MAX_BACKUP_PHOTO_BYTES) {
        throw new Error("Photo file is larger than the portable backup limit.");
      }
      totalPhotoBytes += info.size;
      if (totalPhotoBytes > MAX_BACKUP_PHOTO_BYTES_TOTAL) {
        throw new Error("Profile photos are larger than the portable backup limit in total.");
      }
      base64 = await FileSystem.readAsStringAsync(photoUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      totalBase64Characters += base64.length;
      if (totalBase64Characters > MAX_BACKUP_PHOTO_BASE64_TOTAL) {
        throw new Error("Profile photos are larger than the portable backup limit in total.");
      }
    } catch {
      throw new Error(`The private photo for ${contact.displayName} could not be read. Remove or replace it before exporting or restoring a workspace.`);
    }
    assets.set(contact.id, {
      id: contact.id,
      fileName: `profile-${index + 1}.jpg`,
      mediaType: "image/jpeg",
      base64,
    });
  }
  return assets;
}

export async function createWorkspaceBackupV2(): Promise<WorkspaceBackupV2> {
  const workspace = currentWorkspaceRecords();
  return buildWorkspaceBackupV2(workspace, await photoAssetsForWorkspace(workspace));
}

async function persistBackupPhotoAssets(
  backup: WorkspaceBackupV2,
): Promise<Map<string, string>> {
  if (!backup.photoAssets.length) return new Map();
  const directory = FileSystem.cacheDirectory;
  if (!directory) throw new Error("A temporary photo restore directory is unavailable.");
  const restored = new Map<string, string>();
  try {
    for (const [index, asset] of backup.photoAssets.entries()) {
      const extension = asset.mediaType === "image/png" ? "png" : "jpg";
      const temporaryUri = `${directory}context-photo-restore-${Date.now()}-${index}.${extension}`;
      try {
        await FileSystem.writeAsStringAsync(temporaryUri, asset.base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const privateUri = await persistPrivateProfilePhoto(temporaryUri);
        if (!privateUri || !isPrivateProfilePhotoUri(privateUri)) {
          throw new Error("Context could not create a protected copy of a restored profile photo.");
        }
        restored.set(asset.id, privateUri);
      } finally {
        await FileSystem.deleteAsync(temporaryUri, { idempotent: true }).catch(() => undefined);
      }
    }
    return restored;
  } catch (error) {
    await Promise.allSettled([...restored.values()].map((uri) => deletePrivateProfilePhoto(uri)));
    throw error;
  }
}

export interface WorkspaceRestoreResult {
  stalePhotoCleanupCount: number;
}

export async function restoreWorkspaceBackup(input: WorkspaceBackup): Promise<WorkspaceRestoreResult> {
  const backup = WorkspaceBackupSchema.parse(input);
  let stagedPhotoUris = new Map<string, string>();
  let previousPrivatePhotoUris: string[] = [];

  try {
    // Stage incoming photos beside the live workspace. The existing files stay
    // intact until the replacement state has been validated and AsyncStorage
    // confirms the durable commit.
    stagedPhotoUris = backup.version === 2
      ? await persistBackupPhotoAssets(backup)
      : new Map<string, string>();
    const restored = workspaceRecordsFromBackup(backup, stagedPhotoUris);
    // The store snapshots at the moment this queued commit begins—not before
    // photo staging—so a failed restore cannot discard an edit saved while the
    // incoming private photos were being prepared.
    const previous = await useAppStore.getState().commitWorkspaceRestore(restored);
    previousPrivatePhotoUris = privateProfilePhotoUris(previous.contacts);
  } catch (restoreError) {
    const stagedCleanupFailures = await deletePrivateProfilePhotos([...stagedPhotoUris.values()]);
    const message = restoreError instanceof Error ? restoreError.message : "The backup could not be restored.";
    throw new Error(`${message} Your previous workspace and private photos were kept.${stagedCleanupFailures.length ? " Some newly staged photo files could not be removed yet." : ""}`);
  }

  const stalePhotoCleanup = await deletePrivateProfilePhotos(previousPrivatePhotoUris);
  return { stalePhotoCleanupCount: stalePhotoCleanup.length };
}
