import * as fs from "fs";
import * as path from "path";
import { executeTat } from "./runtime/index";
import { printGraphs } from "./runtime/printGraphs";

function main() {
  try {
    const fileArg = process.argv[2] ?? "examples/basic.tat";

    const filePath = path.isAbsolute(fileArg)
      ? fileArg
      : path.resolve(process.cwd(), fileArg);

    const source = fs.readFileSync(filePath, "utf8");

    console.log("========== FILE ==========");
    console.log(filePath);

    console.log("\n========== SOURCE ==========");
    console.log(source);

    const result = executeTat(source);

    console.log("\n========== TOKENS ==========");
    for (const token of result.tokens) {
      console.log(
        `${token.type.padEnd(14)} ${JSON.stringify(token.value).padEnd(20)} (${token.line}:${token.column})`,
      );
    }

    console.log("\n========== AST ==========");
    console.log(result.printedAst);

    console.log("\n========== BINDINGS: VALUES ==========");
    console.log(JSON.stringify(result.debug.bindings.values, null, 2));

    console.log("\n========== BINDINGS: NODES ==========");
    console.log(JSON.stringify(result.debug.bindings.nodes, null, 2));

    console.log("\n========== REALIZED GRAPHS ==========");
    console.log(JSON.stringify(result.debug.graphs, null, 2));

    console.log("\n========== SYSTEM RELATIONS ==========");
    console.log(JSON.stringify(result.debug.systemRelations, null, 2));

    console.log("\n========== PRETTY GRAPHS ==========");
    console.log(printGraphs(result.execution.state.graphs));

    console.log("\n========== QUERY RESULTS ==========");
    console.log(JSON.stringify(result.debug.queryResults, null, 2));
    
  } catch (err) {
    console.error("\n❌ ERROR\n");

    if (err instanceof Error) {
      console.error(err.message);
      console.error(err.stack);
    } else {
      console.error(err);
    }

    process.exit(1);
  }
}

main();