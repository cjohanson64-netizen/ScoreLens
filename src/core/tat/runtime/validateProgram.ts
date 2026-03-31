import type {
  ProgramNode,
  StatementNode,
  ValueBindingNode,
  SeedBlockNode,
  GraphPipelineNode,
  QueryStatementNode,
  ActionExprNode,
  MutationExprNode,
} from "../ast/nodeTypes";

export interface ValidationIssue {
  severity: "error" | "warning";
  message: string;
  span?: { line: number; column: number };
}

interface ValidationState {
  valueBindings: Set<string>;
  nodeBindings: Set<string>;
  operatorBindings: Set<string>;
  actionBindings: Set<string>;
  graphBindings: Set<string>;
  hasSeed: boolean;
  terminalProjectReached: boolean;
  issues: ValidationIssue[];
}

export function validateProgram(program: ProgramNode): ValidationIssue[] {
  const state: ValidationState = {
    valueBindings: new Set(),
    nodeBindings: new Set(),
    operatorBindings: new Set(),
    actionBindings: new Set(),
    graphBindings: new Set(),
    hasSeed: false,
    terminalProjectReached: false,
    issues: [],
  };

  for (const statement of program.body) {
    validateStatement(statement, state);
  }

  return state.issues;
}

function validateStatement(statement: StatementNode, state: ValidationState): void {
  switch (statement.type) {
    case "ImportDeclaration":
    case "ExportDeclaration":
      return;

    case "BindStatement":
      validateStatementAfterTerminalProject(statement.type, state);
      return;

    case "ValueBinding":
      validateValueBinding(statement, state);
      return;

    case "OperatorBinding":
      validateOperatorBinding(statement, state);
      return;

    case "SeedBlock":
      validateSeedBlock(statement, state);
      return;

    case "GraphPipeline":
      validateGraphPipeline(statement, state);
      return;

    case "QueryStatement":
      validateQueryStatement(statement, state);
      return;

    default:
      return;
  }
}

function validateValueBinding(statement: ValueBindingNode, state: ValidationState): void {
  const name = statement.name.name;

  if (isTopLevelNameTaken(name, state)) {
    pushIssue(state, "error", statement.name.span, `Duplicate binding "${name}"`);
    return;
  }

  state.valueBindings.add(name);

  if (statement.value.type === "NodeCapture") {
    state.nodeBindings.add(name);
    validateNodeCapture(statement, state);
  }
}

function validateOperatorBinding(
  statement: Extract<StatementNode, { type: "OperatorBinding" }>,
  state: ValidationState,
): void {
  const name = statement.name.name;

  if (isTopLevelNameTaken(name, state)) {
    pushIssue(state, "error", statement.name.span, `Duplicate binding "${name}"`);
    return;
  }

  state.operatorBindings.add(name);

  if (statement.value.type === "ActionExpr") {
    state.actionBindings.add(name);
    validateAction(statement.value, state);
  }
}

function validateSeedBlock(statement: SeedBlockNode, state: ValidationState): void {
  if (state.hasSeed) {
    pushIssue(state, "error", statement.span, "Multiple @seed blocks are not allowed");
  }

  state.hasSeed = true;
}

function validateGraphPipeline(statement: GraphPipelineNode, state: ValidationState): void {
  const name = statement.name.name;

  if (isTopLevelNameTaken(name, state)) {
    pushIssue(state, "error", statement.name.span, `Duplicate graph name "${name}"`);
    return;
  }

  state.graphBindings.add(name);

  if (statement.projection) {
    state.terminalProjectReached = true;
  }
}

function validateQueryStatement(statement: QueryStatementNode, state: ValidationState): void {
  // query validation can be expanded later
  return;
}

function validateAction(action: ActionExprNode, state: ValidationState): void {
  if (!action.pipeline || action.pipeline.length === 0) {
    pushIssue(state, "error", action.span, "@action must define at least one pipeline step");
  }

  if (action.guard) {
    validateActionExpression(action.guard, state);
  }

  if (action.project) {
    validateActionExpression(action.project, state);
  }

  for (const step of action.pipeline) {
    validateMutation(step, state);
  }
}

function validateNodeCapture(statement: ValueBindingNode, state: ValidationState): void {
  const value = statement.value;

  if (value.type !== "NodeCapture") return;
  const shape = value.shape;

  if (shape.type !== "TraversalExpr") return;

  for (const segment of shape.segments) {
    const operator =
      segment.type === "ActionSegment"
        ? segment.operator
        : segment.segment.operator;

    ensureKnownAction(state, operator.name, operator.span);
  }
}

function validateMutation(mutation: MutationExprNode, state: ValidationState): void {
  switch (mutation.type) {
    case "GraftBranchExpr":
    case "PruneBranchExpr":
      validateIdentifier(mutation.subject.name, mutation.subject.span, state);
      validateIdentifier(mutation.object.name, mutation.object.span, state);
      return;

    case "GraftProgressExpr":
      validateIdentifier(mutation.from.name, mutation.from.span, state);
      validateIdentifier(mutation.to.name, mutation.to.span, state);
      return;

    case "GraftStateExpr":
    case "GraftMetaExpr":
    case "PruneStateExpr":
    case "PruneMetaExpr":
      validateIdentifier(mutation.node.name, mutation.node.span, state);
      return;

    case "PruneNodesExpr":
    case "PruneEdgesExpr":
      return;

    default:
      return;
  }
}

function validateActionExpression(expr: any, state: ValidationState): void {
  if (!expr || typeof expr !== "object") return;

  switch (expr.type) {
    case "Identifier":
      validateIdentifier(expr.name, expr.span, state);
      return;

    case "PropertyAccess":
      validateIdentifier(expr.object.name, expr.object.span, state);
      return;

    case "BinaryBooleanExpr":
      validateActionExpression(expr.left, state);
      validateActionExpression(expr.right, state);
      return;

    case "UnaryBooleanExpr":
      validateActionExpression(expr.argument, state);
      return;

    case "ComparisonExpr":
      validateActionExpression(expr.left, state);
      validateActionExpression(expr.right, state);
      return;

    case "ObjectLiteral":
      for (const prop of expr.properties) {
        validateActionExpression(prop.value, state);
      }
      return;

    case "ArrayLiteral":
      for (const el of expr.elements) {
        validateActionExpression(el, state);
      }
      return;

    default:
      return;
  }
}

function validateIdentifier(name: string, span: any, state: ValidationState): void {
  if (name === "from" || name === "to") {
    return;
  }

  if (
    state.nodeBindings.has(name) ||
    state.valueBindings.has(name) ||
    state.actionBindings.has(name)
  ) {
    return;
  }

  pushIssue(
    state,
    "warning",
    span,
    `Unknown identifier "${name}" inside @action`,
  );
}

function ensureKnownAction(
  state: ValidationState,
  name: string,
  span?: { line: number; column: number },
): void {
  if (!state.actionBindings.has(name)) {
    pushIssue(state, "error", span, `Traversal operator "${name}" is not a declared action`);
  }
}

function isTopLevelNameTaken(name: string, state: ValidationState): boolean {
  return (
    state.valueBindings.has(name) ||
    state.operatorBindings.has(name) ||
    state.graphBindings.has(name)
  );
}

function pushIssue(
  state: ValidationState,
  severity: "error" | "warning",
  span: any,
  message: string,
): void {
  state.issues.push({
    severity,
    message,
    span,
  });
}

function validateStatementAfterTerminalProject(
  statementType: "BindStatement",
  state: ValidationState,
): void {
  if (!state.terminalProjectReached) {
    return;
  }

  pushIssue(
    state,
    "error",
    undefined,
    `${statementType} cannot appear after terminal @project(...)`,
  );
}
