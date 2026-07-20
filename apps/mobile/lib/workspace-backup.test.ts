import { beforeEach, describe, expect, it, vi } from "vitest";

const asyncStorageMocks = vi.hoisted(() => ({
  getItem: vi.fn(async () => null),
  setItem: vi.fn(async () => undefined),
  removeItem: vi.fn(async () => undefined),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: asyncStorageMocks,
}));

const fileSystemMocks = vi.hoisted(() => ({
  writeAsStringAsync: vi.fn(async () => undefined),
  deleteAsync: vi.fn(async () => undefined),
  getInfoAsync: vi.fn(async () => ({ exists: true, isDirectory: false, size: 4 })),
  readAsStringAsync: vi.fn(async () => "/9j/"),
}));

vi.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  EncodingType: { Base64: "base64" },
  ...fileSystemMocks,
}));

const profilePhotoMocks = vi.hoisted(() => ({
  persistPrivateProfilePhoto: vi.fn<(uri: string | undefined) => Promise<string | undefined>>(),
  deletePrivateProfilePhoto: vi.fn(async () => undefined),
  deletePrivateProfilePhotos: vi.fn(async () => [] as string[]),
  isPrivateProfilePhotoUri: vi.fn((uri: string | undefined) =>
    Boolean(uri?.startsWith("file://") && uri.includes("/ContextProfilePhotos/"))),
}));

vi.mock("@/lib/profile-photo", () => profilePhotoMocks);

// Vitest runs without Expo's `@/` resolver. Bridge the production aliases to
// their real modules so this remains an integration test of the restore path.
vi.mock("@/lib/workspace-backup-core", async () => import("./workspace-backup-core"));
vi.mock("@/store/app-store", async () => import("../store/app-store"));

import type { Contact, WorkspaceBackupPhotoAsset } from "@context/shared";
import { buildWorkspaceBackupV2, type WorkspaceRecords } from "./workspace-backup-core";
import { restoreWorkspaceBackup } from "./workspace-backup";
import { useAppStore } from "../store/app-store";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function contact(id: string, displayName: string, photoUri?: string): Contact {
  return {
    id,
    displayName,
    ...(photoUri ? { photoUri } : {}),
    conversationTopics: [],
    recognitionEnabled: false,
    timeline: [],
  };
}

function restoredWorkspace(): WorkspaceRecords {
  return {
    contacts: [contact("restored-contact", "Restored Person")],
    events: [{
      id: "restored-event",
      name: "Restored Event",
      startsAt: "2026-07-17T18:00:00.000Z",
      attendeeContactIds: ["restored-contact"],
    }],
    actions: [],
    entities: [],
    relationships: [],
    connectionDecisions: [],
  };
}

beforeEach(() => {
  asyncStorageMocks.setItem.mockReset().mockResolvedValue(undefined);
  fileSystemMocks.writeAsStringAsync.mockReset().mockResolvedValue(undefined);
  fileSystemMocks.deleteAsync.mockReset().mockResolvedValue(undefined);
  profilePhotoMocks.persistPrivateProfilePhoto.mockReset();
  profilePhotoMocks.deletePrivateProfilePhoto.mockReset().mockResolvedValue(undefined);
  profilePhotoMocks.deletePrivateProfilePhotos.mockReset().mockResolvedValue([]);

  useAppStore.setState({
    hydrated: true,
    hydrationError: null,
    hasSeenOnboarding: true,
    hasSeenContactImportPrompt: false,
    appLockEnabled: false,
    localToolsEnabled: false,
    updateWatchUsed: false,
    currentEventId: "live-event",
    contacts: [contact(
      "live-contact",
      "Before Concurrent Edit",
      "file:///private/ContextProfilePhotos/live.jpg",
    )],
    events: [{
      id: "live-event",
      name: "Live Event",
      startsAt: "2026-07-17T12:00:00.000Z",
      attendeeContactIds: ["live-contact"],
    }],
    actions: [],
    entities: [],
    relationships: [],
    connectionDecisions: [],
    systemContactLinks: {},
  });

  // The direct test setup above is not part of the transaction under test.
  asyncStorageMocks.setItem.mockClear();
});

describe("workspace restore transactions", () => {
  it("preserves an edit committed during photo staging when the queued restore commit rejects", async () => {
    const incomingPhoto: WorkspaceBackupPhotoAsset = {
      id: "restored-photo",
      fileName: "profile-1.jpg",
      mediaType: "image/jpeg",
      base64: "/9j/",
    };
    const backup = buildWorkspaceBackupV2(
      restoredWorkspace(),
      new Map([["restored-contact", incomingPhoto]]),
      "2026-07-17T16:00:00.000Z",
    );
    const stagedPhoto = deferred<string | undefined>();
    const stagingStarted = deferred<void>();
    profilePhotoMocks.persistPrivateProfilePhoto.mockImplementationOnce(async () => {
      stagingStarted.resolve();
      return stagedPhoto.promise;
    });

    const editPersistence = deferred<undefined>();
    const editPersistenceStarted = deferred<void>();
    asyncStorageMocks.setItem
      .mockImplementationOnce(async () => {
        editPersistenceStarted.resolve();
        return editPersistence.promise;
      })
      .mockRejectedValueOnce(new Error("restore storage unavailable"))
      .mockResolvedValue(undefined);

    const restorePromise = restoreWorkspaceBackup(backup);
    await stagingStarted.promise;

    const editPromise = useAppStore.getState().updateContact("live-contact", {
      displayName: "Saved During Photo Staging",
    });
    await editPersistenceStarted.promise;
    expect(useAppStore.getState().contacts[0]?.displayName).toBe("Saved During Photo Staging");

    stagedPhoto.resolve("file:///private/ContextProfilePhotos/restored.jpg");
    editPersistence.resolve(undefined);
    await editPromise;

    await expect(restorePromise).rejects.toThrow(
      "restore storage unavailable Your previous workspace and private photos were kept.",
    );

    expect(useAppStore.getState()).toMatchObject({
      currentEventId: "live-event",
      contacts: [{
        id: "live-contact",
        displayName: "Saved During Photo Staging",
        photoUri: "file:///private/ContextProfilePhotos/live.jpg",
      }],
      events: [{ id: "live-event", name: "Live Event" }],
    });
    expect(profilePhotoMocks.deletePrivateProfilePhotos).toHaveBeenCalledTimes(1);
    expect(profilePhotoMocks.deletePrivateProfilePhotos).toHaveBeenCalledWith([
      "file:///private/ContextProfilePhotos/restored.jpg",
    ]);
  });
});
