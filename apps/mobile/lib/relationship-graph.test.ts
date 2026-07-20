import { describe, expect, it } from "vitest";
import { seededContacts, seededEvents, type Contact } from "@context/shared";
import {
  buildRelationshipGraph,
  focusRelationshipGraph,
  relatedNodeIds,
  relationshipEdgesForNode,
  relationshipLabelForNode,
  selectRelationshipGraph,
} from "./relationship-graph";

describe("relationship graph", () => {
  it("connects people to events, organizations, and ideas", () => {
    const graph = buildRelationshipGraph(seededContacts, seededEvents);
    const stripe = graph.nodes.find((node) => node.kind === "organization" && node.label === "Stripe");

    expect(graph.nodes.some((node) => node.kind === "person" && node.label === "Jordan Patel")).toBe(true);
    expect(graph.nodes.some((node) => node.kind === "event" && node.label === "OpenAI Memory Hack Night")).toBe(true);
    expect(stripe).toBeDefined();
    expect(graph.nodes.some((node) => node.kind === "idea" && node.label === "Running")).toBe(true);
    expect(graph.nodes.some((node) => node.kind === "project")).toBe(false);

    const jordanConnections = relatedNodeIds(graph, "person:jordan-patel");
    expect(jordanConnections.has("event:openai-hackathon-2026")).toBe(true);
    expect(jordanConnections.has(stripe!.id)).toBe(true);
  });

  it("deduplicates shared concepts while preserving each relationship", () => {
    const contacts: Contact[] = [
      {
        ...seededContacts[0]!,
        id: "person-one",
        displayName: "Person One",
        company: "Shared Studio",
        lastDiscussed: "Project Atlas",
        conversationTopics: ["Responsible AI"],
        timeline: [],
      },
      {
        ...seededContacts[1]!,
        id: "person-two",
        displayName: "Person Two",
        company: "Shared Studio",
        lastDiscussed: "Project Atlas",
        conversationTopics: ["Responsible AI"],
        timeline: [],
      },
    ];
    const graph = buildRelationshipGraph(contacts, []);
    const sharedStudio = graph.nodes.find((node) => node.kind === "organization" && node.label === "Shared Studio");

    expect(graph.nodes.filter((node) => node.label === "Shared Studio")).toHaveLength(1);
    expect(graph.nodes.filter((node) => node.label === "Project Atlas")).toHaveLength(0);
    expect(sharedStudio).toBeDefined();
    expect(relatedNodeIds(graph, sharedStudio!.id)).toEqual(
      new Set(["person:person-one", "person:person-two"]),
    );
  });

  it("keeps distinct concepts whose normalized names share the first 72 characters", () => {
    const sharedPrefix = "A".repeat(80);
    const contacts: Contact[] = [
      {
        ...seededContacts[0]!,
        id: "long-name-one",
        displayName: "Long Name One",
        company: `${sharedPrefix} One`,
        timeline: [],
        conversationTopics: [],
      },
      {
        ...seededContacts[1]!,
        id: "long-name-two",
        displayName: "Long Name Two",
        company: `${sharedPrefix} Two`,
        timeline: [],
        conversationTopics: [],
      },
    ];
    const organizations = buildRelationshipGraph(contacts, []).nodes
      .filter((node) => node.kind === "organization");

    expect(organizations).toHaveLength(2);
    expect(new Set(organizations.map((node) => node.id))).toHaveLength(2);
    organizations.forEach((node) => {
      expect(node.id).toMatch(new RegExp(`^organization:${"a".repeat(72)}-[a-z0-9]{11}$`));
    });
  });

  it("keeps the matching ideas and their people when filtering", () => {
    const graph = buildRelationshipGraph(seededContacts, seededEvents);
    const filtered = selectRelationshipGraph(graph, { filter: "idea", query: "running" });

    expect(filtered.nodes.some((node) => node.kind === "idea" && node.label === "Running")).toBe(true);
    expect(filtered.nodes.some((node) => node.id === "person:jordan-patel")).toBe(true);
    expect(filtered.nodes.every((node) => node.kind === "idea" || node.kind === "person")).toBe(true);
  });

  it("finds objects by relationship type and supporting evidence", () => {
    const graph = buildRelationshipGraph(seededContacts, seededEvents);
    const stripe = graph.nodes.find((node) => node.kind === "organization" && node.label === "Stripe");
    const byType = selectRelationshipGraph(graph, { query: "works at" });
    const byReverseType = selectRelationshipGraph(graph, { filter: "organization", query: "team member" });
    const byEvidence = selectRelationshipGraph(graph, { query: "profile lists stripe" });

    expect(stripe).toBeDefined();
    expect(byType.nodes.some((node) => node.id === "person:jordan-patel")).toBe(true);
    expect(byType.nodes.some((node) => node.id === stripe!.id)).toBe(true);
    expect(byReverseType.nodes.some((node) => node.id === stripe!.id)).toBe(true);
    expect(byEvidence.nodes.some((node) => node.id === "person:jordan-patel")).toBe(true);
    expect(byEvidence.nodes.some((node) => node.id === stripe!.id)).toBe(true);
  });

  it("uses directional relationship descriptions", () => {
    const graph = buildRelationshipGraph(seededContacts, seededEvents);
    const stripe = graph.nodes.find((node) => node.kind === "organization" && node.label === "Stripe");
    const work = relationshipEdgesForNode(graph, "person:jordan-patel")
      .find((edge) => edge.kind === "works_at");

    expect(stripe).toBeDefined();
    expect(work).toBeDefined();
    expect(relationshipLabelForNode(work!, "person:jordan-patel")).toBe("Works at");
    expect(relationshipLabelForNode(work!, stripe!.id)).toBe("Team member");
  });

  it("labels saved and suggested relationships with their supporting evidence", () => {
    const graph = buildRelationshipGraph(seededContacts, seededEvents);
    const jordanEdges = relationshipEdgesForNode(graph, "person:jordan-patel");

    expect(jordanEdges.find((edge) => edge.kind === "works_at")).toMatchObject({
      label: "Works at",
      confidence: "confirmed",
      evidence: [{ kind: "profile", sourceId: "jordan-patel" }],
    });
    expect(jordanEdges.find((edge) => edge.kind === "attended")).toMatchObject({
      label: "Attended",
      confidence: "confirmed",
      evidence: [{ kind: "event", sourceId: "openai-hackathon-2026" }],
    });
    expect(jordanEdges.find((edge) => edge.kind === "discussed")).toBeUndefined();
    expect(jordanEdges.find((edge) => edge.kind === "interested_in" && edge.evidence[0]?.kind === "memory"))
      .toMatchObject({ confidence: "suggested" });
  });

  it("keeps the focused item visible and bounds its neighborhood", () => {
    const graph = buildRelationshipGraph(seededContacts, seededEvents);
    const focused = focusRelationshipGraph(graph, "person:jordan-patel", 3);

    expect(focused.nodes[0]?.id).toBe("person:jordan-patel");
    expect(focused.nodes).toHaveLength(4);
    expect(focused.edges).toHaveLength(3);
    expect(focused.edges.every((edge) => edge.source === "person:jordan-patel" || edge.target === "person:jordan-patel"))
      .toBe(true);
    expect(focused.edges.filter((edge) => edge.confidence === "confirmed")).toHaveLength(2);
  });
});
