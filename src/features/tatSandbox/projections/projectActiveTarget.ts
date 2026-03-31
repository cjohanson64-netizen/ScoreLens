import type { Graph, GraphNode, GraphValue, NodeId } from "@core/tat/runtime/graph";

export type ActiveTargetProjection = {
  target: null | {
    id: string;
    kind: "note" | "rest" | "measure" | "part";
    label: string;
    location: {
      partId: string;
      measureNumber: number;
      voice?: string;
    };
    expected: {
      pitch?: string | null;
      rhythm?: string | null;
      lyric?: string | null;
    };
    observed: {
      pitch?: string | null;
      rhythm?: string | null;
    };
    state: {
      selected: boolean;
      correct?: boolean;
      needsReview?: boolean;
      progression?: string;
      nextStep?: string;
    };
  };
};

export function projectActiveTarget(
  graph: Graph,
  selectedNodeId?: string | null,
): ActiveTargetProjection {
  const selectedNode = selectedNodeId
    ? graph.nodes.get(selectedNodeId) ?? null
    : findSelectedNode(graph);

  if (!selectedNode) {
    return { target: null };
  }

  const kind = asTargetKind(getRecordValue(selectedNode.value, "kind"));
  if (!kind) {
    return { target: null };
  }

  const label =
    asString(getRecordValue(selectedNode.value, "label")) ??
    selectedNode.id;

  const partId =
    asString(getRecordValue(selectedNode.value, "partId")) ??
    findContainingPartId(graph, selectedNode.id) ??
    "";

  const measureNumber =
    asNumber(getRecordValue(selectedNode.value, "measureNumber")) ??
    findContainingMeasureNumber(graph, selectedNode.id) ??
    0;

  const voice = asString(getRecordValue(selectedNode.value, "voice")) ?? undefined;

  return {
    target: {
      id: selectedNode.id,
      kind,
      label,
      location: {
        partId,
        measureNumber,
        voice,
      },
      expected: {
        pitch: kind === "note" ? getPitchTextForEvent(graph, selectedNode.id) : null,
        rhythm:
          kind === "note"
            ? getRhythmTypeForEvent(graph, selectedNode.id)
            : null,
        lyric: kind === "note" ? getLyricTextForEvent(graph, selectedNode.id) : null,
      },
      observed: {
        pitch: asString(selectedNode.meta.observedPitch) ?? null,
        rhythm: asString(selectedNode.meta.observedRhythm) ?? null,
      },
      state: {
        selected: true,
        correct: asBoolean(selectedNode.state.correct) ?? undefined,
        needsReview: asBoolean(selectedNode.state.needsReview) ?? undefined,
        progression: asString(selectedNode.state.progression) ?? undefined,
        nextStep: asString(selectedNode.state.nextStep) ?? undefined,
      },
    },
  };
}

function findSelectedNode(graph: Graph): GraphNode | null {
  for (const node of graph.nodes.values()) {
    if (asBoolean(node.state.selected) === true) {
      return node;
    }
  }
  return null;
}

function findContainingPartId(graph: Graph, nodeId: NodeId): string | null {
  const measureNode = findContainingNodeByKind(graph, nodeId, "measure");
  if (!measureNode) return null;

  const partNode = findContainingNodeByKind(graph, measureNode.id, "part");
  if (!partNode) return null;

  return asString(getRecordValue(partNode.value, "partId")) ?? null;
}

function findContainingMeasureNumber(graph: Graph, nodeId: NodeId): number | null {
  const measureNode = findContainingNodeByKind(graph, nodeId, "measure");
  if (!measureNode) return null;

  return asNumber(getRecordValue(measureNode.value, "number")) ?? null;
}

function findContainingNodeByKind(
  graph: Graph,
  childId: NodeId,
  expectedKind: string,
): GraphNode | null {
  const parentEdge = graph.edges.find(
    (edge) =>
      edge.kind === "branch" &&
      edge.relation === "contains" &&
      edge.object === childId,
  );

  if (!parentEdge) return null;

  const parentNode = graph.nodes.get(parentEdge.subject) ?? null;
  if (!parentNode) return null;

  const kind = asString(getRecordValue(parentNode.value, "kind"));
  if (kind === expectedKind) return parentNode;

  return null;
}

function getPitchTextForEvent(graph: Graph, eventId: NodeId): string | null {
  const pitchNode = getRelatedNodeByRelation(graph, eventId, "hasPitch");
  if (!pitchNode) return null;

  const step = asString(getRecordValue(pitchNode.value, "step")) ?? "";
  const alter = asNumber(getRecordValue(pitchNode.value, "alter"));
  const octave = asNumber(getRecordValue(pitchNode.value, "octave"));

  if (!step || octave === null) return null;

  return `${step}${alterToAccidental(alter)}${octave}`;
}

function getRhythmTypeForEvent(graph: Graph, eventId: NodeId): string | null {
  const rhythmNode = getRelatedNodeByRelation(graph, eventId, "hasRhythm");
  if (!rhythmNode) return null;

  return asString(getRecordValue(rhythmNode.value, "type")) ?? null;
}

function getLyricTextForEvent(graph: Graph, eventId: NodeId): string | null {
  const lyricNode = getRelatedNodeByRelation(graph, eventId, "hasLyric");
  if (!lyricNode) return null;

  return asString(getRecordValue(lyricNode.value, "text")) ?? null;
}

function getRelatedNodeByRelation(
  graph: Graph,
  subjectId: NodeId,
  relation: string,
): GraphNode | null {
  const edge = graph.edges.find(
    (item) =>
      item.kind === "branch" &&
      item.subject === subjectId &&
      item.relation === relation,
  );

  if (!edge) return null;
  return graph.nodes.get(edge.object) ?? null;
}

function getRecordValue(value: GraphValue, key: string): GraphValue | undefined {
  if (!isRecord(value)) return undefined;
  return value[key];
}

function isRecord(value: GraphValue | undefined): value is Record<string, GraphValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: GraphValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: GraphValue | undefined): number | null {
  return typeof value === "number" ? value : null;
}

function asBoolean(value: GraphValue | undefined): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asTargetKind(value: GraphValue | undefined): "note" | "rest" | "measure" | "part" | null {
  return value === "note" || value === "rest" || value === "measure" || value === "part"
    ? value
    : null;
}

function alterToAccidental(alter: number | null): string {
  if (alter === 1) return "#";
  if (alter === 2) return "##";
  if (alter === -1) return "b";
  if (alter === -2) return "bb";
  return "";
}
