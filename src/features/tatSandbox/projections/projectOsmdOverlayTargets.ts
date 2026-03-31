import type { Graph, GraphNode, GraphValue } from "@core/tat/runtime/graph";

export type OsmdOverlayTargetsProjection = {
  measureNumber: number | null;
  measureDurationDivision: number;
  targets: Array<{
    tatNodeId: string;
    sourceKey: string;
    sourceRef: {
      partId: string;
      measureNumber: number;
      voice: string;
      eventIndex: number;
      chordIndex?: number;
    };
    onsetDivision?: number | null;
    durationDivision?: number | null;
    pitch?: {
      step: string;
      alter?: number;
      octave: number;
    } | null;
    pitchText?: string | null;
    lyricText?: string | null;
    state: {
      selected?: boolean;
      correct?: boolean;
      needsReview?: boolean;
    };
  }>;
};

export function projectOsmdOverlayTargets(
  graph: Graph,
  selectedNodeId?: string | null,
): OsmdOverlayTargetsProjection {
  const selectedNode = selectedNodeId
    ? graph.nodes.get(selectedNodeId) ?? null
    : findSelectedNode(graph);
  const selectedMeasureNumberFromState = asNumberLike(graph.state.selectedMeasureNumber);

  if (!selectedNode && selectedMeasureNumberFromState === null) {
    return {
      measureNumber: null,
      measureDurationDivision: 0,
      targets: [],
    };
  }

  const selectedMeasureNumber =
    selectedMeasureNumberFromState ??
    asNumber(getRecordValue(selectedNode?.value, "measureNumber")) ??
    asNumber(getRecordValue(selectedNode?.meta.sourceRef, "measureNumber")) ??
    null;

  if (selectedMeasureNumber === null) {
    return {
      measureNumber: null,
      measureDurationDivision: 0,
      targets: [],
    };
  }

  const targets = getSelectedMeasureNoteNodes(graph)
    .filter((node) => asString(getRecordValue(node.value, "kind")) === "note")
    .map((node) => {
      const sourceKey = asString(node.meta.sourceKey);
      const sourceRef = asSourceRef(node.meta.sourceRef);

      if (!sourceKey || !sourceRef) {
        return null;
      }

      return {
        tatNodeId: node.id,
        sourceKey,
        sourceRef,
        onsetDivision: asNumberLike(node.meta.onsetDivision),
        durationDivision: asNumberLike(node.meta.durationDivision),
        pitch: getPitchForEvent(graph, node.id),
        pitchText:
          asString(node.meta.pitchText) ?? getPitchTextForEvent(graph, node.id),
        lyricText: getLyricTextForEvent(graph, node.id),
        state: {
          selected:
            selectedNode && node.id === selectedNode.id
              ? true
              : asBoolean(node.state.selected) ?? undefined,
          correct: asBoolean(node.state.correct) ?? undefined,
          needsReview: asBoolean(node.state.needsReview) ?? undefined,
        },
      };
    })
    .filter(
      (
        target,
      ): target is NonNullable<typeof target> => target !== null,
    )
    .sort(compareOverlayTargets);

  const measureDurationDivision =
    targets.length > 0
      ? Math.max(
          ...targets.map(
            (target) =>
              (target.onsetDivision ?? 0) + (target.durationDivision ?? 0),
          ),
        )
      : 0;

  return {
    measureNumber: selectedMeasureNumber,
    measureDurationDivision,
    targets,
  };
}

function getSelectedMeasureNoteNodes(graph: Graph): GraphNode[] {
  const selectedMeasureNotes = graph.state.selectedMeasureNotes;
  if (!Array.isArray(selectedMeasureNotes)) return [];

  return selectedMeasureNotes
    .map((node) => {
      if (!node || typeof node !== "object") return null;
      const nodeId = "id" in node && typeof node.id === "string" ? node.id : null;
      return nodeId ? graph.nodes.get(nodeId) ?? null : null;
    })
    .filter((node): node is GraphNode => node !== null);
}

function findSelectedNode(graph: Graph): GraphNode | null {
  for (const node of graph.nodes.values()) {
    if (asBoolean(node.state.selected) === true) {
      return node;
    }
  }
  return null;
}

function getPitchTextForEvent(graph: Graph, eventId: string): string | null {
  const pitch = getPitchForEvent(graph, eventId);
  if (!pitch) return null;

  return `${pitch.step}${alterToAccidental(pitch.alter ?? 0)}${pitch.octave}`;
}

function getPitchForEvent(
  graph: Graph,
  eventId: string,
): { step: string; alter?: number; octave: number } | null {
  const pitchNode = getRelatedNodeByRelation(graph, eventId, "hasPitch");
  if (!pitchNode) return null;

  const step = asString(getRecordValue(pitchNode.value, "step")) ?? "";
  const octave = asNumber(getRecordValue(pitchNode.value, "octave"));
  const alterRaw = getRecordValue(pitchNode.value, "alter");

  const alter =
    typeof alterRaw === "number"
      ? alterRaw
      : typeof alterRaw === "string"
        ? Number.parseInt(alterRaw, 10)
        : null;

  if (!step || octave === null) return null;

  const normalizedAlter =
    alter === null || Number.isNaN(alter) ? undefined : alter;

  return {
    step: step.toUpperCase(),
    ...(typeof normalizedAlter === "number" ? { alter: normalizedAlter } : {}),
    octave,
  };
}

function getLyricTextForEvent(graph: Graph, eventId: string): string | null {
  const lyricNode = getRelatedNodeByRelation(graph, eventId, "hasLyric");
  if (!lyricNode) return null;

  return asString(getRecordValue(lyricNode.value, "text")) ?? null;
}

function getRelatedNodeByRelation(
  graph: Graph,
  subjectId: string,
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

function compareOverlayTargets(
  a: OsmdOverlayTargetsProjection["targets"][number],
  b: OsmdOverlayTargetsProjection["targets"][number],
): number {
  const partCompare = a.sourceRef.partId.localeCompare(b.sourceRef.partId, undefined, {
    numeric: true,
  });
  if (partCompare !== 0) return partCompare;

  const voiceCompare = a.sourceRef.voice.localeCompare(b.sourceRef.voice, undefined, {
    numeric: true,
  });
  if (voiceCompare !== 0) return voiceCompare;

  const onsetCompare = (a.onsetDivision ?? 0) - (b.onsetDivision ?? 0);
  if (onsetCompare !== 0) return onsetCompare;

  const eventCompare = a.sourceRef.eventIndex - b.sourceRef.eventIndex;
  if (eventCompare !== 0) return eventCompare;

  return (a.sourceRef.chordIndex ?? 0) - (b.sourceRef.chordIndex ?? 0);
}

function asSourceRef(
  value: GraphValue | undefined,
):
  | {
      partId: string;
      measureNumber: number;
      voice: string;
      eventIndex: number;
      chordIndex?: number;
    }
  | null {
  if (!isRecord(value)) return null;

  const partId = asString(value.partId);
  const measureNumber = asNumberLike(value.measureNumber);
  const voice = asString(value.voice);
  const eventIndex = asNumberLike(value.eventIndex);
  const chordIndex = asOptionalNumberLike(value.chordIndex);

  if (!partId || measureNumber === null || !voice || eventIndex === null) {
    return null;
  }

  return {
    partId,
    measureNumber,
    voice,
    eventIndex,
    ...(typeof chordIndex === "number" ? { chordIndex } : {}),
  };
}

function getRecordValue(value: GraphValue | undefined, key: string): GraphValue | undefined {
  if (!isRecord(value)) return undefined;
  return value[key];
}

function isRecord(value: GraphValue | undefined): value is Record<string, GraphValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: GraphValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: GraphValue | undefined): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asNumber(value: GraphValue | undefined): number | null {
  return typeof value === "number" ? value : null;
}

function asNumberLike(value: GraphValue | undefined): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function asOptionalNumberLike(value: GraphValue | undefined): number | null {
  if (value === undefined) return null;
  return asNumberLike(value);
}

function alterToAccidental(alter: number | null): string {
  if (alter === 1) return "#";
  if (alter === 2) return "##";
  if (alter === -1) return "b";
  if (alter === -2) return "bb";
  return "";
}
