import type { ProgramNode } from "./ast/nodeTypes";
import { printAST } from "./debug/printAST";
import { tokenize, type Token } from "./lexer/tokenize";
import { parse, ParseError } from "./parser/parse";
import { executeProgram, type ExecuteProgramResult } from "./runtime/executeProgram";
import { graphToDebugObject } from "./runtime/graph";
import { validateProgram, type ValidationIssue } from "./runtime/validateProgram";

export interface TatParseResult {
  source: string;
  tokens: Token[];
  ast: ProgramNode;
  printedAst: string;
}

export interface TatExecuteResult extends TatParseResult {
  validation: ValidationIssue[];
  execution: ExecuteProgramResult;
  debug: {
    graphs: Record<string, ReturnType<typeof graphToDebugObject>>;
    projections: Record<string, unknown>;
    systemRelations: ExecuteProgramResult["state"]["systemRelations"];
    queryResults: ExecuteProgramResult["state"]["queryResults"];
    bindings: {
      values: Record<string, unknown>;
      nodes: Record<string, ReturnType<typeof graphToDebugObject>["nodes"][number]>;
    };
  };
}

export function tokenizeTat(source: string): Token[] {
  return tokenize(source);
}

export function parseTatToAst(source: string): ProgramNode {
  const tokens = tokenize(source);
  return parse(tokens);
}

export function printTatAst(source: string): string {
  const tokens = tokenize(source);
  const ast = parse(tokens);
  return printAST(ast);
}

export function parseTat(source: string): TatParseResult {
  const tokens = tokenize(source);
  const ast = parse(tokens);
  const printedAst = printAST(ast);

  return {
    source,
    tokens,
    ast,
    printedAst,
  };
}

export function executeTat(source: string): TatExecuteResult {
  const parsed = parseTat(source);
  const validation = validateProgram(parsed.ast);

  const errors = validation.filter((issue: ValidationIssue) => issue.severity === "error");

  if (errors.length > 0) {
    const message = errors
      .map((issue: ValidationIssue) =>
        issue.span?.line && issue.span?.column
          ? `${issue.message} at ${issue.span.line}:${issue.span.column}`
          : issue.message
      )
      .join("\n");

    throw new Error(`Validation failed:\n${message}`);
  }

  const execution = executeProgram(parsed.ast);

  const graphs: Record<string, ReturnType<typeof graphToDebugObject>> = {};
  for (const [name, graph] of execution.state.graphs.entries()) {
    graphs[name] = graphToDebugObject(graph);
  }

  const projections: Record<string, unknown> = {};
  for (const [name, projection] of execution.state.projections.entries()) {
    projections[name] = structuredCloneSafe(projection);
  }

  const values: Record<string, unknown> = {};
  for (const [name, value] of execution.state.bindings.values.entries()) {
    values[name] = structuredCloneSafe(value);
  }

  const nodes: Record<string, ReturnType<typeof graphToDebugObject>["nodes"][number]> = {};
  for (const [name, node] of execution.state.bindings.nodes.entries()) {
    nodes[name] = {
      id: node.id,
      value: structuredCloneSafe(node.value),
      state: structuredCloneSafe(node.state),
      meta: structuredCloneSafe(node.meta),
    };
  }

  return {
    ...parsed,
    validation,
    execution,
    debug: {
      graphs,
      projections,
      systemRelations: execution.state.systemRelations,
      queryResults: execution.state.queryResults,
      bindings: {
        values,
        nodes,
      },
    },
  };
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

export type { Token, ProgramNode, ExecuteProgramResult };
export { ParseError, tokenize, parse, printAST, executeProgram };
