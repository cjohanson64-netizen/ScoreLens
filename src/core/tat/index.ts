import { printAST } from "./debug/printAST";
import { tokenize, type Token } from "./lexer/tokenize";
import { parse, ParseError } from "./parser/parse";
import type { ProgramNode } from "./ast/nodeTypes";

export interface TatParseResult {
  source: string;
  tokens: Token[];
  ast: ProgramNode;
  printedAst: string;
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

export type { Token, ProgramNode };
export { ParseError, tokenize, parse, printAST };