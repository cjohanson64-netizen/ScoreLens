import type { Graph, GraphNode, GraphValue } from "@core/tat/runtime/graph";

export type NextActionProjection = {
  targetId: string | null;
  progression: string | null;
  nextStep: string | null;
  supportAction: string | null;
  decisionReason: string | null;
  teacherControls: {
    minimumAttempts?: number;
    maximumAttempts?: number;
    allowMoveOn?: boolean;
    allowScaffold?: boolean;
    allowSlowDown?: boolean;
    stopAfterMaximumAttempts?: boolean;
  } | null;
};

export function projectNextAction(
  graph: Graph,
  selectedNodeId?: string | null,
): NextActionProjection {
  const selectedNode = selectedNodeId
    ? graph.nodes.get(selectedNodeId) ?? null
    : findSelectedNode(graph);

  if (!selectedNode) {
    return {
      targetId: null,
      progression: null,
      nextStep: null,
      supportAction: null,
      decisionReason: null,
      teacherControls: null,
    };
  }

  return {
    targetId: selectedNode.id,
    progression: asString(selectedNode.state.progression) ?? null,
    nextStep: asString(selectedNode.state.nextStep) ?? null,
    supportAction: asString(selectedNode.meta.supportAction) ?? null,
    decisionReason: asString(selectedNode.meta.decisionReason) ?? null,
    teacherControls: asTeacherControls(selectedNode.meta.teacherControls),
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

function asTeacherControls(
  value: GraphValue | undefined,
): {
  minimumAttempts?: number;
  maximumAttempts?: number;
  allowMoveOn?: boolean;
  allowScaffold?: boolean;
  allowSlowDown?: boolean;
  stopAfterMaximumAttempts?: boolean;
} | null {
  if (!isRecord(value)) return null;

  return {
    minimumAttempts: asNumber(value.minimumAttempts) ?? undefined,
    maximumAttempts: asNumber(value.maximumAttempts) ?? undefined,
    allowMoveOn: asBoolean(value.allowMoveOn) ?? undefined,
    allowScaffold: asBoolean(value.allowScaffold) ?? undefined,
    allowSlowDown: asBoolean(value.allowSlowDown) ?? undefined,
    stopAfterMaximumAttempts: asBoolean(value.stopAfterMaximumAttempts) ?? undefined,
  };
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