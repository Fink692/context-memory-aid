import {
  ActionItemSchema,
  ContactSchema,
  WorkspaceBackupContactSchema,
  WorkspaceBackupSchema,
  WorkspaceBackupV2Schema,
  type ActionItem,
  type ConnectionSuggestionDecision,
  type Contact,
  type ContactEntityRelationship,
  type Event,
  type KnowledgeEntity,
  type WorkspaceBackup,
  type WorkspaceBackupContact,
  type WorkspaceBackupPhotoAsset,
  type WorkspaceBackupV2,
} from "@context/shared";

export interface WorkspaceRecords {
  contacts: Contact[];
  events: Event[];
  actions: ActionItem[];
  entities: KnowledgeEntity[];
  relationships: ContactEntityRelationship[];
  connectionDecisions: ConnectionSuggestionDecision[];
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function legacyActions(contacts: Contact[]): ActionItem[] {
  const actions: ActionItem[] = [];
  const actionIds = new Set<string>();
  for (const contact of contacts) {
    for (const memory of contact.timeline) {
      for (const [index, title] of memory.nextSteps.entries()) {
        if (actions.length >= 50_000) {
          throw new Error("This legacy backup would create more than 50,000 follow-ups.");
        }
        const action = ActionItemSchema.parse({
          id: `legacy-${stableHash(`${contact.id}\u0000${memory.id}\u0000${index}\u0000${title}`)}`,
          contactId: contact.id,
          memoryId: memory.id,
          title,
          status: "open",
          createdAt: memory.createdAt,
          updatedAt: memory.updatedAt ?? memory.createdAt,
        });
        if (actionIds.has(action.id)) {
          throw new Error("This legacy backup contains follow-ups whose generated IDs collide.");
        }
        actionIds.add(action.id);
        actions.push(action);
      }
    }
  }
  return actions;
}

export function portableContact(
  contact: Contact,
  photoAssetId?: string,
): WorkspaceBackupContact {
  const {
    badgeId: _badgeId,
    photoUri: _photoUri,
    recognitionEnabled: _recognitionEnabled,
    ...portable
  } = contact;
  return WorkspaceBackupContactSchema.parse({
    ...portable,
    ...(photoAssetId ? { photoAssetId } : {}),
  });
}

export function buildWorkspaceBackupV2(
  workspace: WorkspaceRecords,
  photoAssetsByContactId: ReadonlyMap<string, WorkspaceBackupPhotoAsset>,
  exportedAt = new Date().toISOString(),
): WorkspaceBackupV2 {
  const photoAssets: WorkspaceBackupPhotoAsset[] = [];
  const contacts = workspace.contacts.map((contact) => {
    const asset = photoAssetsByContactId.get(contact.id);
    if (asset) photoAssets.push(asset);
    return portableContact(contact, asset?.id);
  });
  return WorkspaceBackupV2Schema.parse({
    version: 2,
    exportedAt,
    contacts,
    events: workspace.events,
    actions: workspace.actions,
    entities: workspace.entities,
    relationships: workspace.relationships,
    connectionDecisions: workspace.connectionDecisions,
    photoAssets,
  });
}

export function workspaceRecordsFromBackup(
  input: WorkspaceBackup,
  restoredPhotoUris: ReadonlyMap<string, string> = new Map(),
): WorkspaceRecords {
  const backup = WorkspaceBackupSchema.parse(input);
  if (backup.version === 1) {
    const contacts = backup.contacts.map((contact) => {
      const {
        badgeId: _badgeId,
        photoUri: _photoUri,
        recognitionEnabled: _recognitionEnabled,
        ...portable
      } = contact;
      return ContactSchema.parse({ ...portable, recognitionEnabled: false });
    });
    const actions = legacyActions(contacts);
    const validated = WorkspaceBackupV2Schema.parse({
      version: 2,
      exportedAt: backup.exportedAt,
      contacts: contacts.map((contact) => portableContact(contact)),
      events: backup.events,
      actions,
      entities: [],
      relationships: [],
      connectionDecisions: [],
      photoAssets: [],
    });
    return {
      contacts,
      events: validated.events,
      actions: validated.actions,
      entities: validated.entities,
      relationships: validated.relationships,
      connectionDecisions: validated.connectionDecisions,
    };
  }

  const contacts = backup.contacts.map((contact) => {
    const { photoAssetId, ...portable } = contact;
    const photoUri = photoAssetId ? restoredPhotoUris.get(photoAssetId) : undefined;
    if (photoAssetId && !photoUri) {
      throw new Error(`The restored photo asset ${photoAssetId} is unavailable.`);
    }
    return ContactSchema.parse({
      ...portable,
      recognitionEnabled: false,
      ...(photoUri ? { photoUri } : {}),
    });
  });
  return {
    contacts,
    events: backup.events,
    actions: backup.actions,
    entities: backup.entities,
    relationships: backup.relationships,
    connectionDecisions: backup.connectionDecisions,
  };
}

export function rewritePrivatePhotoUrisForRollback(
  contacts: Contact[],
  privatePhotoUriByContactId: ReadonlyMap<string, string>,
): Contact[] {
  return contacts.map((contact) => {
    const isPrivate = contact.photoUri?.startsWith("file://")
      && contact.photoUri.includes("/ContextProfilePhotos/");
    if (!isPrivate) return contact;
    const photoUri = privatePhotoUriByContactId.get(contact.id);
    const { photoUri: _oldPhotoUri, ...rest } = contact;
    return ContactSchema.parse({
      ...rest,
      ...(photoUri ? { photoUri } : {}),
    });
  });
}

export function privateProfilePhotoUris(contacts: Contact[]): string[] {
  return [...new Set(contacts.flatMap((contact) => {
    const uri = contact.photoUri;
    return uri?.startsWith("file://") && uri.includes("/ContextProfilePhotos/") ? [uri] : [];
  }))];
}
