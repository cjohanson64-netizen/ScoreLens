import test from "node:test";
import assert from "node:assert/strict";
import { executeTat } from "../runtime/index";

function seedProgramSuffix(pipeline: string): string {
  return `
A = <Ti>
B = <Do>
node1 = <A>
node2 = <B>

@seed:
  nodes: [node1, node2]
  edges: [
    e1 := [node1 : "supports" : node2]
  ]
  state: {}
  meta: {}
  root: node1

${pipeline}
`;
}

test("project defaults to graph when omitted", () => {
  const result = executeTat(
    seedProgramSuffix(`graph1 := @seed`),
  );

  assert.ok(result.execution.state.projections.has("graph1"));
  const projection = result.execution.state.projections.get("graph1") as any;
  assert.ok(projection && typeof projection === "object");
  assert.ok(Array.isArray(projection.nodes));
  assert.ok(Array.isArray(projection.edges));
  assert.ok(Array.isArray(projection.history));
});

test("project graph returns full graph object", () => {
  const result = executeTat(
    seedProgramSuffix(`
graph1 := @seed
  <> @project(format: "graph")`),
  );

  const projection = result.execution.state.projections.get("graph1") as any;
  assert.ok(projection && typeof projection === "object");
  assert.ok(Array.isArray(projection.nodes));
  assert.ok(Array.isArray(projection.edges));
  assert.ok(Array.isArray(projection.history));
});

test("project nodes returns only node list", () => {
  const result = executeTat(
    seedProgramSuffix(`
graph1 := @seed
  <> @project(format: "nodes")`),
  );

  const projection = result.execution.state.projections.get("graph1") as any;
  assert.ok(Array.isArray(projection));
  assert.equal(projection.length, 2);
  assert.ok("id" in projection[0]);
  assert.ok("value" in projection[0]);
});

test("project edges returns only edge list", () => {
  const result = executeTat(
    seedProgramSuffix(`
graph1 := @seed
  <> @project(format: "edges")`),
  );

  const projection = result.execution.state.projections.get("graph1") as any;
  assert.ok(Array.isArray(projection));
  assert.equal(projection.length, 1);
  assert.ok("id" in projection[0]);
  assert.ok("subject" in projection[0]);
  assert.ok("relation" in projection[0]);
  assert.ok("object" in projection[0]);
});

test("project history returns only history list", () => {
  const result = executeTat(`
A = <Ti>
B = <Do>
node1 = <A>
node2 = <B>

@seed:
  nodes: [node1, node2]
  edges: []
  state: {}
  meta: {}
  root: node1

graph1 := @seed
  -> @graft.branch(node1, "supports", node2)
  <> @project(format: "history")
`);

  const projection = result.execution.state.projections.get("graph1") as any;
  assert.ok(Array.isArray(projection));
  assert.ok(projection.length >= 1);
  assert.ok("op" in projection[0]);
});

test("project debug returns debug-style object", () => {
  const result = executeTat(
    seedProgramSuffix(`
graph1 := @seed
  <> @project(format: "debug")`),
  );

  const projection = result.execution.state.projections.get("graph1") as any;
  assert.ok(projection && typeof projection === "object");
  assert.ok(Array.isArray(projection.nodes));
  assert.ok(Array.isArray(projection.edges));
  assert.ok(Array.isArray(projection.history));
});

test("project edges includes edge context", () => {
  const result = executeTat(`
A = <Ti>
B = <Do>
node1 = <A>
node2 = <B>

@seed:
  nodes: [node1, node2]
  edges: [
    e1 := [node1 : "supports" : node2]
  ]
  state: {}
  meta: {}
  root: node1

graph1 := @seed
  -> @ctx.set(e1, "voiceLeading")
  <> @project(format: "edges")
`);

  const projection = result.execution.state.projections.get("graph1") as any;
  assert.ok(Array.isArray(projection));
  assert.equal(projection[0].id, "e1");
  assert.equal(projection[0].context, "voiceLeading");
});

test("project throws when format is missing", () => {
  assert.throws(
    () =>
      executeTat(`
A = <Ti>
node1 = <A>

@seed:
  nodes: [node1]
  edges: []
  state: {}
  meta: {}
  root: node1

graph1 := @seed
  <> @project()
`),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /@project requires a format argument/);
      return true;
    },
  );
});

test("project throws when format is unsupported", () => {
  assert.throws(
    () =>
      executeTat(`
A = <Ti>
node1 = <A>

@seed:
  nodes: [node1]
  edges: []
  state: {}
  meta: {}
  root: node1

graph1 := @seed
  <> @project(format: "banana")
`),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Unsupported project format "banana"/);
      return true;
    },
  );
});

test("project does not prevent graph from being stored in state.graphs", () => {
  const result = executeTat(
    seedProgramSuffix(`
graph1 := @seed
  <> @project(format: "nodes")`),
  );

  assert.ok(result.execution.state.graphs.has("graph1"));
  assert.ok(result.execution.state.projections.has("graph1"));
});
