import type { Graph, GraphNode, GraphValue } from "@core/tat/runtime/graph";

export type EvaluationSummaryProjection = {
  targetId: string | null;
  status: {
    correct?: boolean;
    needsReview?: boolean;
    progression?: string;
  };
  feedback: string | null;
  diagnostics: Array<{
    name: string;
    severity?: string;
    confidence?: number;
    explanation?: string;
  }>;
  goals: Array<{
    name: string;
    threshold?: number;
    met?: boolean;
  }>;
  comparison: {
    expectedPitch?: string | null;
    observedPitch?: string | null;
    expectedRhythm?: string | null;
    observedRhythm?: string | null;
  };
};

export function projectEvaluationSummary(
  graph: Graph,
  selectedNodeId?: string | null,
): EvaluationSummaryProjection {
  const selectedNode = selectedNodeId
    ? graph.nodes.get(selectedNodeId) ?? null
    : findSelectedNode(graph);

  if (!selectedNode) {
    return {
      targetId: null,
      status: {},
      feedback: null,
      diagnostics: [],
      goals: [],
      comparison: {},
    };
  }

  const diagnostics = asDiagnosticArray(selectedNode.meta.diagnostics);
  const goals = asGoalsArray(selectedNode.meta.goals);

  return {
    targetId: selectedNode.id,
    status: {
      correct: asBoolean(selectedNode.state.correct) ?? undefined,
      needsReview: asBoolean(selectedNode.state.needsReview) ?? undefined,
      progression: asString(selectedNode.state.progression) ?? undefined,
    },
    feedback: asString(selectedNode.meta.feedback) ?? null,
    diagnostics,
    goals,
    comparison: {
      expectedPitch: asString(selectedNode.meta.expectedPitch) ?? null,
      observedPitch: asString(selectedNode.meta.observedPitch) ?? null,
      expectedRhythm: asString(selectedNode.meta.expectedRhythm) ?? null,
      observedRhythm: asString(selectedNode.meta.observedRhythm) ?? null,
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

function asDiagnosticArray(
  value: GraphValue | undefined,
): Array<{
  name: string;
  severity?: string;
  confidence?: number;
  explanation?: string;
}> {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((item) => {
      const name = asString(item.name);
      if (!name) return null;

      return {
        name,
        severity: asString(item.severity) ?? undefined,
        confidence: asNumber(item.confidence) ?? undefined,
        explanation: asString(item.explanation) ?? undefined,
      };
    })
    .filter((item): item is NonNullable<typeof item> => !!item);
}

function asGoalsArray(
  value: GraphValue | undefined,
): Array<{
  name: string;
  threshold?: number;
  met?: boolean;
}> {
  if (!isRecord(value)) return [];

  const goals: Array<{
    name: string;
    threshold?: number;
    met?: boolean;
  }> = [];

  for (const [name, goalValue] of Object.entries(value)) {
    if (!isRecord(goalValue)) continue;

    goals.push({
      name,
      threshold: asNumber(goalValue.threshold) ?? undefined,
      met: asBoolean(goalValue.met) ?? undefined,
    });
  }

  return goals;
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
