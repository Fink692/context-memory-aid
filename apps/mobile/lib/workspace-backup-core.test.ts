import { describe, expect, it } from "vitest";
import type {
  Contact,
  ExportBundle,
  WorkspaceBackupPhotoAsset,
} from "@context/shared";
import {
  buildWorkspaceBackupV2,
  privateProfilePhotoUris,
  rewritePrivatePhotoUrisForRollback,
  workspaceRecordsFromBackup,
  type WorkspaceRecords,
} from "./workspace-backup-core";

const privatePhoto = "file:///private/Application%20Support/ContextProfilePhotos/person.jpg";

function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "contact-one",
    badgeId: "5e4f8fb1392a4e11b9ec18bf9dafc982",
    displayName: "Taylor Reed",
    photoUri: privatePhoto,
    conversationTopics: [],
    recognitionEnabled: true,
    timeline: [{
      id: "memory-one",
      contactId: "contact-one",
      summary: "Discussed Project Northstar.",
      tags: [],
      nextSteps: ["Send a note"],
      source: "text",
      occurredAt: "2026-07-10T12:00:00.000Z",
      createdAt: "2026-07-10T12:00:00.000Z",
    }],
    ...overrides,
  };
}

function workspace(): WorkspaceRecords {
  return {
    contacts: [contact()],
    events: [{
      id: "event-one",
      name: "Test event",
      startsAt: "2026-07-10T18:00:00.000Z",
      attendeeContactIds: ["contact-one"],
    }],
    actions: [{
      id: "action-one",
      contactId: "contact-one",
      memoryId: "memory-one",
      eventId: "event-one",
      title: "Send a note",
      status: "open",
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T12:00:00.000Z",
    }],
    entities: [{
      id: "entity-one",
      kind: "project",
      name: "Project Northstar",
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T12:00:00.000Z",
    }],
    relationships: [{
      id: "relationship-one",
      contactId: "contact-one",
      entityId: "entity-one",
      kind: "works_on",
      evidenceMemoryIds: ["memory-one"],
      source: "manual",
      createdAt: "2026-07-10T12:00:00.000Z",
      updatedAt: "2026-07-10T12:00:00.000Z",
    }],
    connectionDecisions: [],
  };
}

describe("portable workspace backups", () => {
  it("exports every durable workspace collection while excluding device-only secrets", () => {
    const asset: WorkspaceBackupPhotoAsset = {
      id: "contact-one",
      fileName: "profile-1.jpg",
      mediaType: "image/jpeg",
      base64: "/9j/",
    };
    const backup = buildWorkspaceBackupV2(
      workspace(),
      new Map([["contact-one", asset]]),
      "2026-07-10T13:00:00.000Z",
    );
    const serialized = JSON.stringify(backup);

    expect(backup.version).toBe(2);
    expect(backup.actions).toHaveLength(1);
    expect(backup.entities).toHaveLength(1);
    expect(backup.relationships).toHaveLength(1);
    expect(backup.photoAssets).toEqual([asset]);
    expect(backup.contacts[0]?.photoAssetId).toBe("contact-one");
    expect(serialized).not.toContain("badgeId");
    expect(serialized).not.toContain("recognitionEnabled");
    expect(serialized).not.toContain("photoUri");
    expect(serialized).not.toContain("systemContactLinks");
    expect(serialized).not.toContain("appLockEnabled");
    expect(serialized).not.toContain("localToolsEnabled");
  });

  it("rewrites bundled photos to fresh private paths on v2 restore", () => {
    const asset: WorkspaceBackupPhotoAsset = {
      id: "contact-one",
      fileName: "profile-1.jpg",
      mediaType: "image/jpeg",
      base64: "/9j/",
    };
    const backup = buildWorkspaceBackupV2(workspace(), new Map([["contact-one", asset]]));
    const restoredUri = "file:///new/ContextProfilePhotos/restored.jpg";
    const restored = workspaceRecordsFromBackup(backup, new Map([[asset.id, restoredUri]]));

    expect(restored.contacts[0]?.photoUri).toBe(restoredUri);
    expect(restored.contacts[0]?.badgeId).toBeUndefined();
    expect(restored.contacts[0]?.recognitionEnabled).toBe(false);
    expect(restored.actions).toEqual(workspace().actions);
    expect(restored.entities).toEqual(workspace().entities);
    expect(restored.relationships).toEqual(workspace().relationships);
  });

  it("restores a v1 backup without reimporting credentials or stale photo paths", () => {
    const legacy: ExportBundle = {
      version: 1,
      exportedAt: "2026-07-10T13:00:00.000Z",
      contacts: [contact()],
      events: [],
    };
    const restored = workspaceRecordsFromBackup(legacy);

    expect(restored.contacts[0]?.badgeId).toBeUndefined();
    expect(restored.contacts[0]?.photoUri).toBeUndefined();
    expect(restored.contacts[0]?.recognitionEnabled).toBe(false);
    expect(restored.actions).toMatchObject([{
      contactId: "contact-one",
      memoryId: "memory-one",
      title: "Send a note",
      status: "open",
    }]);
    expect(restored.entities).toEqual([]);
  });

  it("rejects a legacy backup before it can expand into too many follow-ups", () => {
    const contacts = Array.from({ length: 101 }, (_, contactIndex): Contact => ({
      id: `contact-${contactIndex}`,
      displayName: `Person ${contactIndex}`,
      conversationTopics: [],
      recognitionEnabled: false,
      timeline: Array.from({ length: 100 }, (_, memoryIndex) => ({
        id: `memory-${contactIndex}-${memoryIndex}`,
        contactId: `contact-${contactIndex}`,
        summary: "Imported memory",
        tags: [],
        nextSteps: ["One", "Two", "Three", "Four", "Five"],
        source: "import" as const,
        occurredAt: "2026-07-10T12:00:00.000Z",
        createdAt: "2026-07-10T12:00:00.000Z",
      })),
    }));
    const legacy: ExportBundle = {
      version: 1,
      exportedAt: "2026-07-10T13:00:00.000Z",
      contacts,
      events: [],
    };

    expect(() => workspaceRecordsFromBackup(legacy)).toThrow(/50,000 follow-up references/);
  });

  it("deduplicates private cleanup paths and rewrites only private paths during rollback", () => {
    const contacts = [
      contact(),
      contact({ id: "contact-two", photoUri: privatePhoto, timeline: [] }),
      contact({ id: "contact-three", photoUri: "file:///external/photo.jpg", timeline: [] }),
    ];
    expect(privateProfilePhotoUris(contacts)).toEqual([privatePhoto]);

    const rewritten = rewritePrivatePhotoUrisForRollback(
      contacts,
      new Map([["contact-one", "file:///new/ContextProfilePhotos/one.jpg"]]),
    );
    expect(rewritten[0]?.photoUri).toBe("file:///new/ContextProfilePhotos/one.jpg");
    expect(rewritten[1]?.photoUri).toBeUndefined();
    expect(rewritten[2]?.photoUri).toBe("file:///external/photo.jpg");
  });
});
