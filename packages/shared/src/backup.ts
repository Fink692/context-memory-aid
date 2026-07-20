import { z } from "zod";
import {
  ActionItemSchema,
  ConnectionSuggestionDecisionSchema,
  ContactEntityRelationshipSchema,
  ContactSchema,
  EventSchema,
  ExportBundleSchema,
  KnowledgeEntitySchema,
  MAX_WORKSPACE_ACTIONS,
  MAX_WORKSPACE_CONTACTS,
  MAX_WORKSPACE_EVENTS,
  workspaceAggregateLimitMessages,
} from "./domain";

const backupId = z.string().trim().min(1).max(80);
const safeFileName = z.string().trim().min(1).max(180).regex(
  /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
  "Photo asset names cannot contain path components.",
);
const base64Payload = z.string().min(4).max(8_000_000).refine(
  (value) => value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value),
  "Photo assets must contain valid base64 data.",
);

export const WorkspaceBackupPhotoAssetSchema = z.object({
  id: backupId,
  fileName: safeFileName,
  mediaType: z.enum(["image/jpeg", "image/png"]),
  base64: base64Payload,
}).strict();

export const WorkspaceBackupContactSchema = ContactSchema.omit({
  badgeId: true,
  photoUri: true,
  recognitionEnabled: true,
}).extend({
  photoAssetId: backupId.optional(),
}).strict();

export const WorkspaceBackupV2Schema = z.object({
  version: z.literal(2),
  exportedAt: z.iso.datetime(),
  contacts: z.array(WorkspaceBackupContactSchema).max(MAX_WORKSPACE_CONTACTS),
  events: z.array(EventSchema).max(MAX_WORKSPACE_EVENTS),
  actions: z.array(ActionItemSchema).max(MAX_WORKSPACE_ACTIONS),
  entities: z.array(KnowledgeEntitySchema).max(50_000),
  relationships: z.array(ContactEntityRelationshipSchema).max(100_000),
  connectionDecisions: z.array(ConnectionSuggestionDecisionSchema).max(100_000),
  photoAssets: z.array(WorkspaceBackupPhotoAssetSchema).max(10_000),
}).strict().superRefine((backup, context) => {
  if (backup.photoAssets.reduce((total, asset) => total + asset.base64.length, 0) > 40_000_000) {
    context.addIssue({
      code: "custom",
      message: "Bundled profile photos must be smaller than 30 MB in total.",
      path: ["photoAssets"],
    });
  }
  const unique = (
    values: readonly { id: string }[],
    path: "contacts" | "events" | "actions" | "entities" | "relationships" | "photoAssets",
    label: string,
  ) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value.id)) {
        context.addIssue({
          code: "custom",
          message: `${label} IDs must be unique.`,
          path: [path, index, "id"],
        });
      }
      seen.add(value.id);
    });
    return seen;
  };

  const contactIds = unique(backup.contacts, "contacts", "Contact");
  const eventIds = unique(backup.events, "events", "Event");
  unique(backup.actions, "actions", "Action");
  const entityIds = unique(backup.entities, "entities", "Entity");
  const relationshipIds = unique(backup.relationships, "relationships", "Relationship");
  const photoAssetIds = unique(backup.photoAssets, "photoAssets", "Photo asset");

  const memoryOwnerById = new Map<string, string>();
  const photoOwnerByAssetId = new Map<string, string>();
  backup.contacts.forEach((contact, contactIndex) => {
    contact.timeline.forEach((memory, memoryIndex) => {
      if (memory.contactId !== contact.id) {
        context.addIssue({
          code: "custom",
          message: "Each memory must belong to its containing contact.",
          path: ["contacts", contactIndex, "timeline", memoryIndex, "contactId"],
        });
      }
      if (memoryOwnerById.has(memory.id)) {
        context.addIssue({
          code: "custom",
          message: "Memory IDs must be unique.",
          path: ["contacts", contactIndex, "timeline", memoryIndex, "id"],
        });
      }
      memoryOwnerById.set(memory.id, contact.id);
    });
    if (contact.photoAssetId && !photoAssetIds.has(contact.photoAssetId)) {
      context.addIssue({
        code: "custom",
        message: "Every contact photo must reference a bundled photo asset.",
        path: ["contacts", contactIndex, "photoAssetId"],
      });
    }
    if (contact.photoAssetId) {
      const owner = photoOwnerByAssetId.get(contact.photoAssetId);
      if (owner && owner !== contact.id) {
        context.addIssue({
          code: "custom",
          message: "A bundled photo asset cannot be shared by multiple contacts.",
          path: ["contacts", contactIndex, "photoAssetId"],
        });
      }
      photoOwnerByAssetId.set(contact.photoAssetId, contact.id);
    }
  });

  workspaceAggregateLimitMessages(backup.contacts).forEach((message) => {
    context.addIssue({
      code: "custom",
      message,
      path: ["contacts"],
    });
  });

  const referencedPhotoAssetIds = new Set(backup.contacts.flatMap((contact) =>
    contact.photoAssetId ? [contact.photoAssetId] : []));
  backup.photoAssets.forEach((asset, assetIndex) => {
    if (!referencedPhotoAssetIds.has(asset.id)) {
      context.addIssue({
        code: "custom",
        message: "Photo assets must be referenced by a contact.",
        path: ["photoAssets", assetIndex, "id"],
      });
    }
  });

  backup.events.forEach((event, eventIndex) => {
    const attendeeIds = new Set<string>();
    event.attendeeContactIds.forEach((contactId, attendeeIndex) => {
      if (attendeeIds.has(contactId)) {
        context.addIssue({
          code: "custom",
          message: "An event cannot contain the same attendee more than once.",
          path: ["events", eventIndex, "attendeeContactIds", attendeeIndex],
        });
      }
      if (!contactIds.has(contactId)) {
        context.addIssue({
          code: "custom",
          message: "Every event attendee must reference a saved contact.",
          path: ["events", eventIndex, "attendeeContactIds", attendeeIndex],
        });
      }
      attendeeIds.add(contactId);
    });
  });

  backup.actions.forEach((action, actionIndex) => {
    if (!contactIds.has(action.contactId)) {
      context.addIssue({
        code: "custom",
        message: "Every action must reference a saved contact.",
        path: ["actions", actionIndex, "contactId"],
      });
    }
    if (action.eventId && !eventIds.has(action.eventId)) {
      context.addIssue({
        code: "custom",
        message: "Every action event must reference a saved event.",
        path: ["actions", actionIndex, "eventId"],
      });
    }
    if (action.memoryId && memoryOwnerById.get(action.memoryId) !== action.contactId) {
      context.addIssue({
        code: "custom",
        message: "Every action memory must belong to the action contact.",
        path: ["actions", actionIndex, "memoryId"],
      });
    }
  });

  backup.relationships.forEach((relationship, relationshipIndex) => {
    if (!contactIds.has(relationship.contactId)) {
      context.addIssue({
        code: "custom",
        message: "Every relationship must reference a saved contact.",
        path: ["relationships", relationshipIndex, "contactId"],
      });
    }
    if (!entityIds.has(relationship.entityId)) {
      context.addIssue({
        code: "custom",
        message: "Every relationship must reference a saved entity.",
        path: ["relationships", relationshipIndex, "entityId"],
      });
    }
    relationship.evidenceMemoryIds.forEach((memoryId, memoryIndex) => {
      if (memoryOwnerById.get(memoryId) !== relationship.contactId) {
        context.addIssue({
          code: "custom",
          message: "Relationship evidence must belong to the relationship contact.",
          path: ["relationships", relationshipIndex, "evidenceMemoryIds", memoryIndex],
        });
      }
    });
  });

  const decisionIds = new Set<string>();
  const relationshipById = new Map(backup.relationships.map((relationship) => [relationship.id, relationship]));
  backup.connectionDecisions.forEach((decision, decisionIndex) => {
    if (decisionIds.has(decision.suggestionId)) {
      context.addIssue({
        code: "custom",
        message: "Connection suggestion decisions must be unique.",
        path: ["connectionDecisions", decisionIndex, "suggestionId"],
      });
    }
    decisionIds.add(decision.suggestionId);
    if (decision.decision === "accepted"
      && (!decision.entityId
        || !entityIds.has(decision.entityId)
        || !decision.relationshipId
        || !relationshipIds.has(decision.relationshipId))) {
      context.addIssue({
        code: "custom",
        message: "Accepted decisions must reference their saved entity and relationship.",
        path: ["connectionDecisions", decisionIndex, "decision"],
      });
    } else if (decision.decision === "accepted" && decision.relationshipId && decision.entityId) {
      const relationship = relationshipById.get(decision.relationshipId);
      if (relationship
        && (relationship.entityId !== decision.entityId
          || relationship.sourceSuggestionId !== decision.suggestionId)) {
        context.addIssue({
          code: "custom",
          message: "Accepted decisions must match their saved suggestion relationship.",
          path: ["connectionDecisions", decisionIndex, "relationshipId"],
        });
      }
    }
  });
});

export const WorkspaceBackupSchema = z.union([WorkspaceBackupV2Schema, ExportBundleSchema]);

export type WorkspaceBackupPhotoAsset = z.infer<typeof WorkspaceBackupPhotoAssetSchema>;
export type WorkspaceBackupContact = z.infer<typeof WorkspaceBackupContactSchema>;
export type WorkspaceBackupV2 = z.infer<typeof WorkspaceBackupV2Schema>;
export type WorkspaceBackup = z.infer<typeof WorkspaceBackupSchema>;
