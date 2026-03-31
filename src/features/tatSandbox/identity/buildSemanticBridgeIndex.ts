import type { Graph, GraphValue } from "@core/tat/runtime/graph";
import { isScoreSourceRef } from "./scoreSourceRef";

export type SemanticBridgeEntry = {
  tatNodeId: string;
  sourceKey: string;
  kind: "note" | "rest" | null;
  pitchText: string | null;
  sourceRef: {
    partId: string;
    measureNumber: number;
    voice: string;
    eventIndex: number;
    chordIndex?: number;
  };
};

export type SemanticBridgeIndex = {
  bySourceKey: Map<string, SemanticBridgeEntry>;
  byTatNodeId: Map<string, SemanticBridgeEntry>;
};

export function buildSemanticBridgeIndex(graph: Graph): SemanticBridgeIndex {
  const bySourceKey = new Map<string, SemanticBridgeEntry>();
  const byTatNodeId = new Map<string, SemanticBridgeEntry>();

  for (const node of graph.nodes.values()) {
    const sourceKey = asString(node.meta.sourceKey);
    const sourceRef = asSourceRef(node.meta.sourceRef);

    if (!sourceKey || !sourceRef) continue;

    const entry: SemanticBridgeEntry = {
      tatNodeId: node.id,
      sourceKey,
      kind: asTargetKind(getRecordValue(node.value, "kind")),
      pitchText: asString(node.meta.pitchText),
      sourceRef,
    };

    bySourceKey.set(sourceKey, entry);
    byTatNodeId.set(node.id, entry);
  }

  return {
    bySourceKey,
    byTatNodeId,
  };
}

function getRecordValue(value: GraphValue | undefined, key: string): GraphValue | undefined {
  if (!isRecord(value)) return undefined;
  return value[key];
}

function asString(value: GraphValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function asSourceRef(
  value: GraphValue | undefined,
): SemanticBridgeEntry["sourceRef"] | null {
  if (!isRecord(value)) return null;
  if (!isScoreSourceRef(value)) return null;

  return {
    partId: value.partId,
    measureNumber: value.measureNumber,
    voice: value.voice,
    eventIndex: value.eventIndex,
    ...(typeof value.chordIndex === "number"
      ? { chordIndex: value.chordIndex }
      : {}),
  };
}

function asTargetKind(value: GraphValue | undefined): "note" | "rest" | null {
  return value === "note" || value === "rest" ? value : null;
}

function isRecord(value: GraphValue | undefined): value is Record<string, GraphValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
