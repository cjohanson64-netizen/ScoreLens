import type { EdgeExprNode, WhyExprNode } from "../ast/nodeTypes";
import type { Graph, GraphEdge, GraphHistoryEntry, GraphValue } from "./graph";
import type { MatchResultSet } from "./executeQuery";
import type { PathResultSet } from "./executePath";
import type { FilteredResultSet } from "./executeWhere";

export interface ReasonResult {
  kind: "ReasonResult";
  claim: {
    subject: string;
    relation: string;
    object: string;
  };
  matchedEdges: GraphEdge[];
  because: GraphHistoryEntry[];
}

export interface ReasonResultSet {
  kind: "ReasonResultSet";
  target: string;
  items: ReasonResult[];
}

export function executeWhy(graph: Graph, query: WhyExprNode): ReasonResultSet {
  const target = query.target;

  switch (target.type) {
    case "EdgeExpr":
      return explainEdgeExpr(graph, target);

    case "Identifier":
      return {
        kind: "ReasonResultSet",
        target: target.name,
        items: [],
      };

    case "MatchExpr":
      return {
        kind: "ReasonResultSet",
        target: "@match(...)",
        items: [],
      };

    case "PathExpr":
      return {
        kind: "ReasonResultSet",
        target: "@path(...)",
        items: [],
      };

    default: {
      const _exhaustive: never = target;
      throw new Error(`Unsupported @why target: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function explainEdgeExpr(graph: Graph, edgeExpr: EdgeExprNode): ReasonResultSet {
  const subject = edgeExpr.left.name;
  const relation = edgeExpr.relation.value;
  const object = edgeExpr.right.name;

  const matchedEdges = graph.edges.filter(
    (edge) =>
      edge.subject === subject &&
      edge.relation === relation &&
      edge.object === object,
  );

  const because = graph.history.filter((entry) =>
    historyRelatesToEdge(entry, subject, relation, object),
  );

  return {
    kind: "ReasonResultSet",
    target: `${subject} : ${JSON.stringify(relation)} : ${object}`,
    items: [
      {
        kind: "ReasonResult",
        claim: {
          subject,
          relation,
          object,
        },
        matchedEdges,
        because,
      },
    ],
  };
}

function historyRelatesToEdge(
  entry: GraphHistoryEntry,
  subject: string,
  relation: string,
  object: string,
): boolean {
  const payload = entry.payload;

  const payloadSubject =
    typeof payload.subject === "string" ? payload.subject : null;
  const payloadRelation =
    typeof payload.relation === "string" ? payload.relation : null;
  const payloadObject =
    typeof payload.object === "string" ? payload.object : null;

  return (
    payloadSubject === subject &&
    payloadRelation === relation &&
    payloadObject === object
  );
}