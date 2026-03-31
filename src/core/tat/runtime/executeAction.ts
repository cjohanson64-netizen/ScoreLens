import type {
  ActionProjectExprNode,
  ArrayLiteralNode,
  BooleanExprNode,
  BooleanValueNode,
  MutationExprNode,
  NodeCaptureNode,
  ObjectLiteralNode,
  PropertyAccessNode,
  ValueExprNode,
} from "../ast/nodeTypes";
import type { RuntimeAction } from "./actionRegistry";
import type { Graph, GraphValue } from "./graph";
import {
  addBranch,
  addProgress,
  setNodeMeta,
  setNodeState,
  removeBranch,
  removeNodeMeta,
  removeNodeState,
} from "./graph";

export interface ActionScope {
  from: string;
  to: string;
}

export interface ActionExecutionResult {
  graph: Graph;
  didRun: boolean;
  project: GraphValue | null;
}

export function executeAction(
  graph: Graph,
  action: RuntimeAction,
  scope: ActionScope,
): ActionExecutionResult {
  if (action.guard) {
    const passes = evaluateActionBooleanExpr(action.guard, graph, scope);
    if (!passes) {
      return {
        graph,
        didRun: false,
        project: null,
      };
    }
  }

  for (const step of action.pipeline) {
    executeActionMutation(graph, step, scope);
  }

  const project = action.project
    ? evaluateActionProjectExpr(action.project, graph, scope)
    : null;

  return {
    graph,
    didRun: true,
    project,
  };
}

function executeActionMutation(
  graph: Graph,
  mutation: MutationExprNode,
  scope: ActionScope,
): void {
  switch (mutation.type) {
    case "GraftBranchExpr":
      addBranch(
        graph,
        resolveScopedIdentifier(mutation.subject.name, scope),
        mutation.relation.value,
        resolveScopedIdentifier(mutation.object.name, scope),
      );
      return;

    case "GraftStateExpr":
      setNodeState(
        graph,
        resolveScopedIdentifier(mutation.node.name, scope),
        mutation.key.value,
        evaluateActionProjectExpr(mutation.value, graph, scope),
      );
      return;

    case "GraftMetaExpr":
      setNodeMeta(
        graph,
        resolveScopedIdentifier(mutation.node.name, scope),
        mutation.key.value,
        evaluateActionProjectExpr(mutation.value, graph, scope),
      );
      return;

    case "GraftProgressExpr":
      addProgress(
        graph,
        resolveScopedIdentifier(mutation.from.name, scope),
        mutation.relation.value,
        resolveScopedIdentifier(mutation.to.name, scope),
      );
      return;

    case "PruneBranchExpr":
      removeBranch(
        graph,
        resolveScopedIdentifier(mutation.subject.name, scope),
        mutation.relation.value,
        resolveScopedIdentifier(mutation.object.name, scope),
      );
      return;

    case "PruneStateExpr":
      removeNodeState(
        graph,
        resolveScopedIdentifier(mutation.node.name, scope),
        mutation.key.value,
      );
      return;

    case "PruneMetaExpr":
      removeNodeMeta(
        graph,
        resolveScopedIdentifier(mutation.node.name, scope),
        mutation.key.value,
      );
      return;
  }
}

function evaluateActionBooleanExpr(
  expr: BooleanExprNode,
  graph: Graph,
  scope: ActionScope,
): boolean {
  switch (expr.type) {
    case "BinaryBooleanExpr":
      if (expr.operator === "&&") {
        return (
          evaluateActionBooleanExpr(expr.left, graph, scope) &&
          evaluateActionBooleanExpr(expr.right, graph, scope)
        );
      }
      return (
        evaluateActionBooleanExpr(expr.left, graph, scope) ||
        evaluateActionBooleanExpr(expr.right, graph, scope)
      );

    case "UnaryBooleanExpr":
      return !evaluateActionBooleanExpr(expr.argument, graph, scope);

    case "GroupedBooleanExpr":
      return evaluateActionBooleanExpr(expr.expression, graph, scope);

    case "ComparisonExpr": {
      const left = evaluateBooleanValue(expr.left, graph, scope);
      const right = evaluateBooleanValue(expr.right, graph, scope);

      switch (expr.operator) {
        case "==":
          return compareCaseInsensitive(left, right);
        case "===":
          return compareStrict(left, right);
        case "!=":
          return !compareCaseInsensitive(left, right);
        case "!==":
          return !compareStrict(left, right);
        case "<":
          return compareOrdered(left, right, (a, b) => a < b);
        case "<=":
          return compareOrdered(left, right, (a, b) => a <= b);
        case ">":
          return compareOrdered(left, right, (a, b) => a > b);
        case ">=":
          return compareOrdered(left, right, (a, b) => a >= b);
      }

      return false;
    }

    case "Identifier":
      return truthy(resolveIdentifierValue(expr.name, graph, scope));

    case "PropertyAccess":
      return truthy(resolvePropertyAccess(expr, graph, scope));

    case "StringLiteral":
      return truthy(expr.value);

    case "NumberLiteral":
      return truthy(expr.value);

    case "BooleanLiteral":
      return expr.value;

    case "RegexLiteral":
      return truthy(expr.raw);
    default:
      return exhaustiveNever(expr);
  }
}

function evaluateBooleanValue(
  value: BooleanValueNode,
  graph: Graph,
  scope: ActionScope,
): GraphValue {
  switch (value.type) {
    case "Identifier":
      return resolveIdentifierValue(value.name, graph, scope);
    case "PropertyAccess":
      return resolvePropertyAccess(value, graph, scope);
    case "StringLiteral":
      return value.value;
    case "NumberLiteral":
      return value.value;
    case "BooleanLiteral":
      return value.value;
    case "RegexLiteral":
      return value.raw;
    default:
      return exhaustiveNever(value);
  }
}

function evaluateActionProjectExpr(
  expr: ActionProjectExprNode | ValueExprNode,
  graph: Graph,
  scope: ActionScope,
): GraphValue {
  switch (expr.type) {
    case "Identifier":
      return resolveScopedIdentifier(expr.name, scope);

    case "StringLiteral":
      return expr.value;

    case "NumberLiteral":
      return expr.value;

    case "BooleanLiteral":
      return expr.value;

    case "NodeCapture":
      return printNodeCapture(expr);

    case "ObjectLiteral":
      return evaluateObjectLiteralProject(expr, graph, scope);

    case "ArrayLiteral":
      return evaluateArrayLiteralProject(expr, graph, scope);

    case "WhereExpr":
      throw new Error(`@where is not supported inside @action project expressions`);

    case "FirstExpr":
      throw new Error(`@first is not supported inside @action project expressions`);

    default:
      return exhaustiveNever(expr);
  }
}

function evaluateArrayLiteralProject(
  expr: ArrayLiteralNode,
  graph: Graph,
  scope: ActionScope,
): GraphValue {
  return expr.elements.map((el) => evaluateActionProjectExpr(el, graph, scope));
}

function evaluateObjectLiteralProject(
  expr: ObjectLiteralNode,
  graph: Graph,
  scope: ActionScope,
): GraphValue {
  const out: Record<string, GraphValue> = {};

  for (const prop of expr.properties) {
    out[prop.key] = evaluateActionProjectExpr(prop.value, graph, scope);
  }

  return out;
}

function resolveIdentifierValue(
  name: string,
  graph: Graph,
  scope: ActionScope,
): GraphValue {
  const resolved = resolveScopedIdentifier(name, scope);
  return graph.nodes.has(resolved) ? resolved : resolved;
}

function resolveScopedIdentifier(name: string, scope: ActionScope): string {
  if (name === "from") return scope.from;
  if (name === "to") return scope.to;
  return name;
}

function resolvePropertyAccess(
  access: PropertyAccessNode,
  graph: Graph,
  scope: ActionScope,
): GraphValue {
  const base = resolveIdentifierValue(access.object.name, graph, scope);

  if (typeof base === "string" && graph.nodes.has(base)) {
    const node = graph.nodes.get(base)!;
    const first = access.chain[0]?.name;
    if (!first) return null;

    if (first === "state") {
      return dig(node.state, access.chain.slice(1).map((p) => p.name));
    }

    if (first === "meta") {
      return dig(node.meta, access.chain.slice(1).map((p) => p.name));
    }

    if (first === "value") {
      return dig(node.value, access.chain.slice(1).map((p) => p.name));
    }

    if (first in node.state) {
      return dig(node.state, access.chain.map((p) => p.name));
    }

    if (first in node.meta) {
      return dig(node.meta, access.chain.map((p) => p.name));
    }

    if (isRecord(node.value) && first in node.value) {
      return dig(node.value, access.chain.map((p) => p.name));
    }
  }

  return null;
}

function dig(value: GraphValue, path: string[]): GraphValue {
  let current: GraphValue = value;

  for (const key of path) {
    if (!isRecord(current)) return null;
    if (!(key in current)) return null;
    current = current[key];
  }

  return current;
}

function compareStrict(a: GraphValue, b: GraphValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function compareCaseInsensitive(a: GraphValue, b: GraphValue): boolean {
  return JSON.stringify(normalizeCaseInsensitive(a)) === JSON.stringify(normalizeCaseInsensitive(b));
}

function compareOrdered(
  a: GraphValue,
  b: GraphValue,
  compare: (left: number | string, right: number | string) => boolean,
): boolean {
  if (typeof a === "number" && typeof b === "number") {
    return compare(a, b);
  }

  if (typeof a === "string" && typeof b === "string") {
    return compare(a, b);
  }

  return false;
}

function normalizeCaseInsensitive(value: GraphValue): GraphValue {
  if (typeof value === "string") return value.toLowerCase();
  if (Array.isArray(value)) return value.map((item) => normalizeCaseInsensitive(item));
  if (isRecord(value)) {
    const out: Record<string, GraphValue> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = normalizeCaseInsensitive(v);
    }
    return out;
  }
  return value;
}

function truthy(value: GraphValue): boolean {
  if (value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return false;
}

function isRecord(value: GraphValue): value is Record<string, GraphValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function printNodeCapture(node: NodeCaptureNode): string {
  switch (node.shape.type) {
    case "Identifier":
      return `<${node.shape.name}>`;
    case "StringLiteral":
      return `<${node.shape.raw}>`;
    case "NumberLiteral":
      return `<${node.shape.raw}>`;
    case "BooleanLiteral":
      return `<${node.shape.raw}>`;
    case "ObjectLiteral":
      return "<{...}>";
    case "TraversalExpr":
      return "<traversal>";
    default:
      return exhaustiveNever(node.shape);
  }
}

function exhaustiveNever(value: never): never {
  throw new Error(`Unexpected node shape: ${String(value)}`);
}
