import type { Contact, Event } from "@context/shared";

export type RelationshipNodeKind = "person" | "project" | "idea" | "event" | "organization";
export type RelationshipGraphFilter = "all" | RelationshipNodeKind;
export type RelationshipEdgeKind = "works_at" | "discussed" | "interested_in" | "attended";
export type RelationshipEvidenceKind = "profile" | "memory" | "conversation" | "event";
export type RelationshipConfidence = "confirmed" | "suggested";

export interface RelationshipNode {
  id: string;
  kind: RelationshipNodeKind;
  label: string;
  subtitle?: string;
  contactId?: string;
  eventId?: string;
  photoUri?: string;
  suggested?: boolean;
  searchText: string;
}

export interface RelationshipEvidence {
  kind: RelationshipEvidenceKind;
  label: string;
  occurredAt?: string;
  sourceId?: string;
}

export interface RelationshipEdge {
  id: string;
  source: string;
  target: string;
  kind: RelationshipEdgeKind;
  label: string;
  confidence: RelationshipConfidence;
  evidence: RelationshipEvidence[];
}

export interface RelationshipGraph {
  nodes: RelationshipNode[];
  edges: RelationshipEdge[];
}

const GENERIC_IDEA_TAGS = new Set(["conversation", "imported", "event"]);

function normalizedIdentity(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
}

// cyrb53 keeps IDs compact while hashing the complete, untruncated identity.
function stableIdentityHash(value: string): string {
  let left = 0xdeadbeef ^ value.length;
  let right = 0x41c6ce57 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left = Math.imul(left ^ code, 2654435761);
    right = Math.imul(right ^ code, 1597334677);
  }
  left = Math.imul(left ^ (left >>> 16), 2246822507) ^ Math.imul(right ^ (right >>> 13), 3266489909);
  right = Math.imul(right ^ (right >>> 16), 2246822507) ^ Math.imul(left ^ (left >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & right) + (left >>> 0);
  return hash.toString(36).padStart(11, "0");
}

function stableKey(value: string): string {
  const identity = normalizedIdentity(value) || "untitled";
  return `${identity.slice(0, 72)}-${stableIdentityHash(identity)}`;
}

function humanizeTag(value: string): string {
  return value
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase());
}

function nodeId(kind: RelationshipNodeKind, value: string): string {
  return `${kind}:${stableKey(value)}`;
}

function edgeId(source: string, target: string, kind: RelationshipEdgeKind): string {
  return `${kind}:${[source, target].sort().join("<->")}`;
}

function personSubtitle(contact: Contact): string | undefined {
  return [contact.role, contact.company].filter(Boolean).join(" · ") || undefined;
}

export function relationshipLabelForNode(edge: RelationshipEdge, focusId: string): string {
  switch (edge.kind) {
    case "works_at":
      return edge.source === focusId ? "Works at" : "Team member";
    case "attended":
      return edge.source === focusId ? "Attendee" : "Attended";
    case "discussed":
      return edge.source === focusId ? "Discussed" : "Discussed with";
    case "interested_in":
      return edge.source === focusId ? "Mentioned" : "Mentioned by";
  }
}

/**
 * Turns the relationship records Context already has into an explorable graph.
 * The graph is derived, so it always follows edits to people, events, and memories
 * without introducing another set of records for the user to maintain.
 */
export function buildRelationshipGraph(contacts: Contact[], events: Event[]): RelationshipGraph {
  const nodes = new Map<string, RelationshipNode>();
  const edges = new Map<string, RelationshipEdge>();

  const addNode = (node: RelationshipNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };
  const addEdge = (
    source: string,
    target: string,
    relationship: Omit<RelationshipEdge, "id" | "source" | "target" | "evidence"> & {
      evidence: RelationshipEvidence;
    },
  ) => {
    if (source === target || !nodes.has(source) || !nodes.has(target)) return;
    const id = edgeId(source, target, relationship.kind);
    const current = edges.get(id);
    if (current) {
      const evidenceKey = `${relationship.evidence.kind}:${relationship.evidence.sourceId ?? relationship.evidence.label}`;
      const hasEvidence = current.evidence.some((item) =>
        `${item.kind}:${item.sourceId ?? item.label}` === evidenceKey);
      if (!hasEvidence) current.evidence.push(relationship.evidence);
      if (relationship.confidence === "confirmed") current.confidence = "confirmed";
      return;
    }
    edges.set(id, {
      id,
      source,
      target,
      kind: relationship.kind,
      label: relationship.label,
      confidence: relationship.confidence,
      evidence: [relationship.evidence],
    });
  };

  contacts.forEach((contact) => {
    const id = `person:${contact.id}`;
    const subtitle = personSubtitle(contact);
    addNode({
      id,
      kind: "person",
      label: contact.displayName,
      ...(subtitle ? { subtitle } : {}),
      contactId: contact.id,
      ...(contact.photoUri ? { photoUri: contact.photoUri } : {}),
      searchText: [
        contact.displayName,
        contact.company,
        contact.role,
        contact.lastDiscussed,
        contact.relationshipContext,
      ].filter(Boolean).join(" ").toLocaleLowerCase(),
    });

    if (contact.company) {
      const organizationId = nodeId("organization", contact.company);
      addNode({
        id: organizationId,
        kind: "organization",
        label: contact.company,
        subtitle: "Organization",
        searchText: `${contact.company} organization`.toLocaleLowerCase(),
      });
      addEdge(id, organizationId, {
        kind: "works_at",
        label: "Works at",
        confidence: "confirmed",
        evidence: {
          kind: "profile",
          label: `${contact.displayName}'s profile lists ${contact.company}`,
          sourceId: contact.id,
        },
      });
    }

    const addIdea = (label: string, evidence: RelationshipEvidence) => {
      if (!normalizedIdentity(label)) return;
      const ideaId = nodeId("idea", label);
      addNode({
        id: ideaId,
        kind: "idea",
        label,
        subtitle: "Suggested idea or interest",
        suggested: true,
        searchText: `${label} suggested idea interest`.toLocaleLowerCase(),
      });
      addEdge(id, ideaId, {
        kind: "interested_in",
        label: "Mentioned",
        confidence: "suggested",
        evidence,
      });
    };
    contact.timeline.forEach((memory) => {
      memory.tags
        .filter((tag) => !GENERIC_IDEA_TAGS.has(tag.trim().toLocaleLowerCase()))
        .map(humanizeTag)
        .forEach((label) => addIdea(label, {
          kind: "memory",
          label: memory.summary,
          occurredAt: memory.occurredAt,
          sourceId: memory.id,
        }));
    });
    contact.conversationTopics.slice(0, 2).forEach((label) => addIdea(label, {
      kind: "conversation",
      label: `Conversation topic: ${label}`,
      sourceId: contact.id,
    }));
  });

  events.forEach((event) => {
    const id = `event:${event.id}`;
    addNode({
      id,
      kind: "event",
      label: event.name,
      subtitle: event.locationLabel ?? "Event",
      eventId: event.id,
      searchText: [event.name, event.locationLabel, "event"].filter(Boolean).join(" ").toLocaleLowerCase(),
    });
    event.attendeeContactIds.forEach((contactId) => {
      const person = nodes.get(`person:${contactId}`);
      addEdge(id, `person:${contactId}`, {
        kind: "attended",
        label: "Attended",
        confidence: "confirmed",
        evidence: {
          kind: "event",
          label: `${person?.label ?? "This person"} is listed as an attendee at ${event.name}`,
          occurredAt: event.startsAt,
          sourceId: event.id,
        },
      });
    });
  });

  const degree = new Map<string, number>();
  edges.forEach((edge) => {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  });
  const kindOrder: Record<RelationshipNodeKind, number> = {
    event: 0,
    person: 1,
    project: 2,
    idea: 3,
    organization: 4,
  };

  return {
    nodes: [...nodes.values()].sort((left, right) =>
      (degree.get(right.id) ?? 0) - (degree.get(left.id) ?? 0)
      || kindOrder[left.kind] - kindOrder[right.kind]
      || left.label.localeCompare(right.label)),
    edges: [...edges.values()].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function relationshipNodeDegrees(graph: RelationshipGraph): Map<string, number> {
  const degree = new Map<string, number>();
  graph.edges.forEach((edge) => {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  });
  return degree;
}

export function relatedNodeIds(graph: RelationshipGraph, nodeIdValue: string): Set<string> {
  const related = new Set<string>();
  graph.edges.forEach((edge) => {
    if (edge.source === nodeIdValue) related.add(edge.target);
    if (edge.target === nodeIdValue) related.add(edge.source);
  });
  return related;
}

export function relationshipEdgesForNode(
  graph: RelationshipGraph,
  nodeIdValue: string,
): RelationshipEdge[] {
  return graph.edges.filter((edge) => edge.source === nodeIdValue || edge.target === nodeIdValue);
}

/**
 * Returns an ego graph that always keeps the focused item visible and bounds the
 * number of surrounding cards. This is the readable default for phones and the
 * primary exploration mode on larger screens.
 */
export function focusRelationshipGraph(
  graph: RelationshipGraph,
  nodeIdValue: string,
  maxNeighbors = 8,
): RelationshipGraph {
  const focusNode = graph.nodes.find((node) => node.id === nodeIdValue);
  if (!focusNode) return { nodes: [], edges: [] };

  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const degree = relationshipNodeDegrees(graph);
  const edges = relationshipEdgesForNode(graph, nodeIdValue)
    .filter((edge) => nodeById.has(edge.source) && nodeById.has(edge.target))
    .sort((left, right) => {
      const leftOther = left.source === nodeIdValue ? left.target : left.source;
      const rightOther = right.source === nodeIdValue ? right.target : right.source;
      return Number(right.confidence === "confirmed") - Number(left.confidence === "confirmed")
        || (degree.get(rightOther) ?? 0) - (degree.get(leftOther) ?? 0)
        || (nodeById.get(leftOther)?.label ?? "").localeCompare(nodeById.get(rightOther)?.label ?? "");
    })
    .slice(0, Math.max(1, maxNeighbors));
  const visibleIds = new Set<string>([nodeIdValue]);
  edges.forEach((edge) => {
    visibleIds.add(edge.source);
    visibleIds.add(edge.target);
  });

  return {
    nodes: [focusNode, ...graph.nodes.filter((node) => node.id !== nodeIdValue && visibleIds.has(node.id))],
    edges,
  };
}

export function selectRelationshipGraph(
  graph: RelationshipGraph,
  options: { filter?: RelationshipGraphFilter; query?: string; limit?: number } = {},
): RelationshipGraph {
  const filter = options.filter ?? "all";
  const query = options.query?.trim().toLocaleLowerCase() ?? "";
  const limit = Math.max(1, options.limit ?? 24);
  const degree = relationshipNodeDegrees(graph);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const connectionMatchIds = new Set<string>();

  if (query) {
    graph.edges.forEach((edge) => {
      const searchableConnection = [
        edge.label,
        edge.kind.replaceAll("_", " "),
        relationshipLabelForNode(edge, edge.source),
        relationshipLabelForNode(edge, edge.target),
        ...edge.evidence.map((item) => item.label),
      ].join(" ").toLocaleLowerCase();
      if (!searchableConnection.includes(query)) return;
      connectionMatchIds.add(edge.source);
      connectionMatchIds.add(edge.target);
    });
  }

  let seeds = graph.nodes.filter((node) => {
    if (filter !== "all" && node.kind !== filter) return false;
    if (!query) return true;
    return node.searchText.includes(query)
      || node.label.toLocaleLowerCase().includes(query)
      || connectionMatchIds.has(node.id);
  });
  if (filter === "all" && !query) seeds = graph.nodes;

  const seedIds = new Set(seeds.map((node) => node.id));
  const candidateIds = new Set(seedIds);
  if (filter !== "all" || query) {
    graph.edges.forEach((edge) => {
      if (seedIds.has(edge.source)) candidateIds.add(edge.target);
      if (seedIds.has(edge.target)) candidateIds.add(edge.source);
    });
  }

  const nodes = [...candidateIds]
    .map((id) => nodeById.get(id))
    .filter((node): node is RelationshipNode => Boolean(node))
    .sort((left, right) =>
      Number(seedIds.has(right.id)) - Number(seedIds.has(left.id))
      || (degree.get(right.id) ?? 0) - (degree.get(left.id) ?? 0)
      || left.label.localeCompare(right.label))
    .slice(0, limit);
  const visibleIds = new Set(nodes.map((node) => node.id));

  return {
    nodes,
    edges: graph.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)),
  };
}
