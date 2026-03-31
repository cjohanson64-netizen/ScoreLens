import type {
  Graph,
  GraphEdge,
  GraphNode,
  GraphValue,
  NodeId,
} from "@core/tat/runtime/graph";

type StructureEvent = {
  id: string;
  kind: "note" | "rest";
  voice?: string;
  type?: string;
  pitchText?: string | null;
  lyricText?: string | null;
  state: {
    selected?: boolean;
    correct?: boolean;
    needsReview?: boolean;
  };
};

type StructureMeasure = {
  id: string;
  number: number;
  meta: {
    key?: { fifths: number; mode?: string };
    meter?: { beats: number; beatType: number };
    clef?: { sign: string; line: number; octaveChange?: number };
    tempo?: number;
  };
  events: StructureEvent[];
};

type StructurePart = {
  id: string;
  partId: string;
  name: string;
  abbreviation?: string;
  measures: StructureMeasure[];
};

export type StructureProjection = {
  score: {
    id: string;
    title: string | null;
  } | null;
  parts: StructurePart[];
};

export function projectStructure(graph: Graph): StructureProjection {
  const scoreNode = findFirstNodeByKind(graph, "score");

  if (!scoreNode) {
    return {
      score: null,
      parts: [],
    };
  }

  const score = {
    id: scoreNode.id,
    title: asString(getRecordValue(scoreNode.value, "title")) ?? null,
  };

  const partNodes = getContainedNodesByKind(graph, scoreNode.id, "part").sort(
    comparePartNodes,
  );

  const parts = partNodes.map((partNode) => {
    const measures = getContainedNodesByKind(graph, partNode.id, "measure")
      .sort(compareMeasureNodes)
      .map((measureNode) => projectMeasure(graph, measureNode));

    return {
      id: partNode.id,
      partId: asString(getRecordValue(partNode.value, "partId")) ?? "",
      name: asString(getRecordValue(partNode.value, "name")) ?? "",
      abbreviation:
        asString(getRecordValue(partNode.value, "abbreviation")) ?? undefined,
      measures,
    };
  });

  return {
    score,
    parts,
  };
}

function projectMeasure(
  graph: Graph,
  measureNode: GraphNode,
): StructureMeasure {
  const eventNodes = getContainedEventNodes(graph, measureNode.id).sort(
    compareEventNodes,
  );

  const events = eventNodes.map((eventNode) => {
    const kind = asEventKind(getRecordValue(eventNode.value, "kind"));

    if (!kind) {
      throw new Error(`Unexpected event kind on node "${eventNode.id}"`);
    }

    const pitchText =
      kind === "note" ? getPitchTextForEvent(graph, eventNode.id) : null;

    const lyricText =
      kind === "note" ? getLyricTextForEvent(graph, eventNode.id) : null;

    return {
      id: eventNode.id,
      kind,
      voice: asString(getRecordValue(eventNode.value, "voice")) ?? undefined,
      type: asString(getRecordValue(eventNode.value, "type")) ?? undefined,
      pitchText,
      lyricText,
      state: {
        selected: asBoolean(eventNode.state.selected) ?? undefined,
        correct: asBoolean(eventNode.state.correct) ?? undefined,
        needsReview: asBoolean(eventNode.state.needsReview) ?? undefined,
      },
    };
  });

  return {
    id: measureNode.id,
    number: asNumber(getRecordValue(measureNode.value, "number")) ?? 0,
    meta: {
      key: asKeyMeta(measureNode.meta.key),
      meter: asMeterMeta(measureNode.meta.meter),
      clef: asClefMeta(measureNode.meta.clef),
      tempo: asNumber(measureNode.meta.tempo) ?? undefined,
    },
    events,
  };
}

function getContainedNodesByKind(
  graph: Graph,
  parentId: NodeId,
  kind: string,
): GraphNode[] {
  return getOutgoingEdges(graph, parentId, "branch")
    .filter((edge) => edge.relation === "contains")
    .map((edge) => safeGetNode(graph, edge.object))
    .filter((node): node is GraphNode => !!node)
    .filter((node) => asString(getRecordValue(node.value, "kind")) === kind);
}

function getContainedEventNodes(graph: Graph, measureId: NodeId): GraphNode[] {
  return getOutgoingEdges(graph, measureId, "branch")
    .filter((edge) => edge.relation === "contains")
    .map((edge) => safeGetNode(graph, edge.object))
    .filter((node): node is GraphNode => !!node)
    .filter((node) => {
      const kind = asString(getRecordValue(node.value, "kind"));
      return kind === "note" || kind === "rest";
    });
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
  const edge = getOutgoingEdges(graph, subjectId, "branch").find(
    (item) => item.relation === relation,
  );

  if (!edge) return null;
  return safeGetNode(graph, edge.object);
}

function getOutgoingEdges(
  graph: Graph,
  subjectId: NodeId,
  kind?: GraphEdge["kind"],
): GraphEdge[] {
  return graph.edges.filter(
    (edge) => edge.subject === subjectId && (!kind || edge.kind === kind),
  );
}

function findFirstNodeByKind(graph: Graph, kind: string): GraphNode | null {
  for (const node of graph.nodes.values()) {
    if (asString(getRecordValue(node.value, "kind")) === kind) {
      return node;
    }
  }
  return null;
}

function safeGetNode(graph: Graph, nodeId: NodeId): GraphNode | null {
  return graph.nodes.get(nodeId) ?? null;
}

function comparePartNodes(a: GraphNode, b: GraphNode): number {
  const aId = asString(getRecordValue(a.value, "partId")) ?? a.id;
  const bId = asString(getRecordValue(b.value, "partId")) ?? b.id;
  return aId.localeCompare(bId, undefined, { numeric: true });
}

function compareMeasureNodes(a: GraphNode, b: GraphNode): number {
  const aNum = asNumber(getRecordValue(a.value, "number")) ?? 0;
  const bNum = asNumber(getRecordValue(b.value, "number")) ?? 0;
  return aNum - bNum;
}

function compareEventNodes(a: GraphNode, b: GraphNode): number {
  return a.id.localeCompare(b.id, undefined, { numeric: true });
}

function getRecordValue(
  value: GraphValue,
  key: string,
): GraphValue | undefined {
  if (!isRecord(value)) return undefined;
  return value[key];
}

function isRecord(
  value: GraphValue | undefined,
): value is Record<string, GraphValue> {
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

function asEventKind(
  value: GraphValue | undefined,
): StructureEvent["kind"] | null {
  const kind = asString(value);
  return kind === "note" || kind === "rest" ? kind : null;
}

function alterToAccidental(alter: number | null): string {
  if (alter === 1) return "#";
  if (alter === 2) return "##";
  if (alter === -1) return "b";
  if (alter === -2) return "bb";
  return "";
}

function asKeyMeta(
  value: GraphValue | undefined,
): { fifths: number; mode?: string } | undefined {
  if (!isRecord(value)) return undefined;

  const fifths = asNumber(value.fifths);
  if (fifths === null) return undefined;

  const mode = asString(value.mode) ?? undefined;

  return { fifths, mode };
}

function asMeterMeta(
  value: GraphValue | undefined,
): { beats: number; beatType: number } | undefined {
  if (!isRecord(value)) return undefined;

  const beats = asNumber(value.beats);
  const beatType = asNumber(value.beatType);

  if (beats === null || beatType === null) return undefined;

  return { beats, beatType };
}

function asClefMeta(
  value: GraphValue | undefined,
): { sign: string; line: number; octaveChange?: number } | undefined {
  if (!isRecord(value)) return undefined;

  const sign = asString(value.sign);
  const line = asNumber(value.line);

  if (!sign || line === null) return undefined;

  const octaveChange = asNumber(value.octaveChange) ?? undefined;

  return { sign, line, octaveChange };
}
