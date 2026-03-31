import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { executeTat } from "../runtime/index";
import { executeTatModule } from "../runtime/executeModule";

function bindSeedProgram(statements: string): string {
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

${statements}
`;
}

test("executes seed graph creation", () => {
  const result = executeTat(`
A = <Ti>
B = <Do>

node1 = <A>
node2 = <B>

@seed:
  nodes: [node1, node2]
  edges: [
    [node1 : "supports" : node2]
  ]
  state: {}
  meta: {}
  root: node1
`);

  assert.equal(result.execution.state.seedGraph?.root, "node1");
  assert.equal(result.execution.state.seedGraph?.nodes.size, 2);
  assert.equal(result.execution.state.seedGraph?.edges.length, 1);

  const edge = result.execution.state.seedGraph?.edges[0];
  assert.ok(edge);
  assert.equal(edge.subject, "node1");
  assert.equal(edge.relation, "supports");
  assert.equal(edge.object, "node2");
  assert.equal(edge.kind, "branch");
});

test("bind writes generic and ctx bindings into execution context", () => {
  const result = executeTat(
    bindSeedProgram(`
@bind(boundNode := node1)
@bind.ctx(boundEdge := e1)
`),
  );

  assert.equal(result.debug.bindings.nodes.boundNode.id, "node1");
  assert.equal(result.debug.bindings.values.boundNode, "Ti");

  const edgeValue = result.debug.bindings.values.boundEdge as any;
  assert.ok(edgeValue && typeof edgeValue === "object");
  assert.equal(edgeValue.id, "e1");
  assert.equal(edgeValue.subject, "node1");
  assert.equal(edgeValue.object, "node2");
});

test("bind writes to graph state and meta", () => {
  const result = executeTat(
    bindSeedProgram(`
@bind.state.node(savedNode := node1)
@bind.meta.edge(savedEdge := e1)
`),
  );

  const graph = result.execution.state.seedGraph;
  assert.ok(graph);
  assert.ok(graph.state.savedNode && typeof graph.state.savedNode === "object");
  assert.ok(graph.meta.savedEdge && typeof graph.meta.savedEdge === "object");

  const stateNode = graph.state.savedNode as any;
  const metaEdge = graph.meta.savedEdge as any;
  assert.equal(stateNode.id, "node1");
  assert.equal(metaEdge.id, "e1");
});

test("bind entity validation rejects edge result for node bind", () => {
  assert.throws(
    () =>
      executeTat(
        bindSeedProgram(`
@bind.ctx.node(wrong := e1)
`),
      ),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /expected node result, got edge/);
      return true;
    },
  );
});

test("bind entity validation rejects node result for edge bind", () => {
  assert.throws(
    () =>
      executeTat(
        bindSeedProgram(`
@bind.ctx.edge(wrong := node1)
`),
      ),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /expected edge result, got node/);
      return true;
    },
  );
});

test("bind entity validation allows empty arrays", () => {
  const result = executeTat(
    bindSeedProgram(`
@bind.meta.edge(emptyEdges := [])
`),
  );

  const graph = result.execution.state.seedGraph;
  assert.ok(graph);
  assert.deepEqual(graph.meta.emptyEdges, []);
});

test("bind node succeeds on @where node result", () => {
  const result = executeTat(
    bindSeedProgram(`
@bind.ctx.node(selected := @where(node.id == "node1"))
`),
  );

  const selected = result.debug.bindings.values.selected as any[];
  assert.ok(Array.isArray(selected));
  assert.equal(selected.length, 1);
  assert.equal(selected[0].id, "node1");
});

test("bind edge succeeds on @where edge result", () => {
  const result = executeTat(
    bindSeedProgram(`
@bind.ctx.edge(selected := @where(edge.rel == "supports"))
`),
  );

  const selected = result.debug.bindings.values.selected as any[];
  assert.ok(Array.isArray(selected));
  assert.equal(selected.length, 1);
  assert.equal(selected[0].id, "e1");
});

test("bind with @where is top-to-bottom and can read earlier bind results", () => {
  const result = executeTat(
    bindSeedProgram(`
@bind.ctx(targetId := "node2")
@bind.ctx.node(selected := @where(node.id == targetId))
`),
  );

  const selected = result.debug.bindings.values.selected as any[];
  assert.ok(Array.isArray(selected));
  assert.equal(selected.length, 1);
  assert.equal(selected[0].id, "node2");
});

test("@where query is read-only and returns node result set", () => {
  const result = executeTat(
    bindSeedProgram(`
@where(node.id == "node1")
`),
  );

  const graph = result.execution.state.seedGraph;
  assert.ok(graph);
  assert.equal(graph.history.length, 1);

  const queryResult = result.execution.state.queryResults[0]?.result as any;
  assert.equal(queryResult.kind, "WhereResultSet");
  assert.equal(queryResult.sourceKind, "node");
  assert.equal(queryResult.items.length, 1);
  assert.equal(queryResult.items[0].id, "node1");
});

test("bind after terminal project fails", () => {
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
  <> @project(format: "graph")

@bind.ctx(x := node1)
`),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /cannot appear after terminal @project|cannot execute after terminal @project/);
      return true;
    },
  );
});

test("executes graft.branch in graph pipeline", () => {
  const result = executeTat(`
A = <Ti>
B = <Do>
C = <Mi>

node1 = <A>
node2 = <B>
node3 = <C>

@seed:
  nodes: [node1, node2, node3]
  edges: []
  state: {}
  meta: {}
  root: node1

graph1 := @seed
  -> @graft.branch(node1, "supports", node3)
  <> @project(format: "graph")
`);

  const graph = result.execution.state.graphs.get("graph1");
  assert.ok(graph);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0].subject, "node1");
  assert.equal(graph.edges[0].relation, "supports");
  assert.equal(graph.edges[0].object, "node3");
  assert.equal(graph.edges[0].kind, "branch");
});

test("executes graft.state in graph pipeline", () => {
  const result = executeTat(`
A = <Ti>
node1 = <A>

@seed:
  nodes: [node1]
  edges: []
  state: {}
  meta: {}
  root: node1

graph1 := @seed
  -> @graft.state(node1, "active", true)
  <> @project(format: "graph")
`);

  const graph = result.execution.state.graphs.get("graph1");
  assert.ok(graph);

  const node = graph.nodes.get("node1");
  assert.ok(node);
  assert.equal(node.state.active, true);
});

test("executes graft.meta in graph pipeline", () => {
  const result = executeTat(`
A = <Ti>
node1 = <A>

@seed:
  nodes: [node1]
  edges: []
  state: {}
  meta: {}
  root: node1

graph1 := @seed
  -> @graft.meta(node1, "priority", "high")
  <> @project(format: "graph")
`);

  const graph = result.execution.state.graphs.get("graph1");
  assert.ok(graph);

  const node = graph.nodes.get("node1");
  assert.ok(node);
  assert.equal(node.meta.priority, "high");
});

test("executes graft.progress in graph pipeline", () => {
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
  -> @graft.progress(node1, "transitionsTo", node2)
  <> @project(format: "graph")
`);

  const graph = result.execution.state.graphs.get("graph1");
  assert.ok(graph);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0].kind, "progress");
  assert.equal(graph.edges[0].relation, "transitionsTo");
});

test("executes prune.branch in graph pipeline", () => {
  const result = executeTat(`
A = <Ti>
B = <Do>

node1 = <A>
node2 = <B>

@seed:
  nodes: [node1, node2]
  edges: [
    [node1 : "supports" : node2]
  ]
  state: {}
  meta: {}
  root: node1

graph1 := @seed
  -> @prune.branch(node1, "supports", node2)
  <> @project(format: "graph")
`);

  const graph = result.execution.state.graphs.get("graph1");
  assert.ok(graph);
  assert.equal(graph.edges.length, 0);
});

test("executes prune.state in graph pipeline", () => {
  const result = executeTat(`
A = <Ti>
node1 = <A>

@seed:
  nodes: [node1]
  edges: []
  state: {}
  meta: {}
  root: node1

graph1 := @seed
  -> @graft.state(node1, "active", true)
  -> @prune.state(node1, "active")
  <> @project(format: "graph")
`);

  const graph = result.execution.state.graphs.get("graph1");
  assert.ok(graph);

  const node = graph.nodes.get("node1");
  assert.ok(node);
  assert.equal("active" in node.state, false);
});

test("executes prune.meta in graph pipeline", () => {
  const result = executeTat(`
A = <Ti>
node1 = <A>

@seed:
  nodes: [node1]
  edges: []
  state: {}
  meta: {}
  root: node1

graph1 := @seed
  -> @graft.meta(node1, "priority", "high")
  -> @prune.meta(node1, "priority")
  <> @project(format: "graph")
`);

  const graph = result.execution.state.graphs.get("graph1");
  assert.ok(graph);

  const node = graph.nodes.get("node1");
  assert.ok(node);
  assert.equal("priority" in node.meta, false);
});

test("records mutation history", () => {
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
  -> @graft.state(node1, "active", true)
  -> @graft.meta(node2, "priority", "high")
  <> @project(format: "graph")
`);

  const graph = result.execution.state.graphs.get("graph1");
  assert.ok(graph);
  assert.equal(graph.history.length, 3);
  assert.equal(graph.history[0].op, "@graft.branch");
  assert.equal(graph.history[1].op, "@graft.state");
  assert.equal(graph.history[2].op, "@graft.meta");
});

test("executes match query against seed graph", () => {
  const result = executeTat(`
A = <Ti>
B = <Do>

node1 = <A>
node2 = <B>

@seed:
  nodes: [node1, node2]
  edges: [
    [node1 : "supports" : node2]
  ]
  state: {}
  meta: {}
  root: node1

@match(X : "supports" : Y)
`);

  assert.equal(result.execution.state.queryResults.length, 1);

  const queryResult = result.execution.state.queryResults[0].result;
  assert.equal(queryResult.kind, "MatchResultSet");

  if (queryResult.kind === "MatchResultSet") {
    assert.equal(queryResult.items.length, 1);
    assert.equal(queryResult.items[0].bindings.X, "node1");
    assert.equal(queryResult.items[0].bindings.Y, "node2");
  }
});

test("executes where filter on match results", () => {
  const result = executeTat(`
A = <Ti>
B = <Do>

node1 = <A>
node2 = <B>

@seed:
  nodes: [node1, node2]
  edges: [
    [node1 : "supports" : node2]
  ]
  state: {}
  meta: {}
  root: node1

graph1 := @seed
  -> @graft.state(node2, "active", true)
  -> @graft.meta(node2, "priority", "high")
  <> @project(format: "graph")

@match(X : "supports" : Y)
@where(Y.priority == "high" && Y.active === true)
`);

  assert.equal(result.execution.state.queryResults.length, 1);

  const queryResult = result.execution.state.queryResults[0].result;
  assert.equal(queryResult.kind, "FilteredResultSet");

  if (queryResult.kind === "FilteredResultSet") {
    assert.equal(queryResult.items.length, 1);
    assert.equal(queryResult.items[0].bindings.X, "node1");
    assert.equal(queryResult.items[0].bindings.Y, "node2");
  }
});

test("compose two imported graphs with shared merge root", () => {
  const project = createModuleProject({
    "core.tat": `
character_root = <{type: "root"}>
identityNode = <{type: "identity"}>
abilityNode = <{type: "ability"}>

@seed:
  nodes: [character_root, identityNode]
  edges: [[character_root : "hasIdentity" : identityNode]]
  state: {}
  meta: {}
  root: character_root

identityGraph := @seed
  <> @project(format: "graph")

@seed:
  nodes: [character_root, abilityNode]
  edges: [[character_root : "hasAbility" : abilityNode]]
  state: {}
  meta: {}
  root: character_root

abilityGraph := @seed
  <> @project(format: "graph")

export { character_root, identityGraph, abilityGraph }
`,
    "app.tat": `
import { character_root, identityGraph, abilityGraph } from "./core.tat"

appGraph := @compose([
  identityGraph,
  abilityGraph
], merge: character_root)
  <> @project(format: "graph")
`,
  });

  const result = executeTatModule(path.join(project, "app.tat"));
  const graph = result.state.graphs.get("appGraph");
  assert.ok(graph);
  assert.equal(graph.root, "character_root");
  assert.equal(graph.nodes.has("identityNode"), true);
  assert.equal(graph.nodes.has("abilityNode"), true);
  assert.equal(graph.nodes.has("character_root"), true);
});

test("compose multiple imported graphs sharing merge root", () => {
  const project = createModuleProject({
    "core.tat": `
character_root = <{type: "root"}>
identityNode = <{type: "identity"}>
abilityNode = <{type: "ability"}>
combatNode = <{type: "combat"}>

@seed:
  nodes: [character_root, identityNode]
  edges: [[character_root : "hasIdentity" : identityNode]]
  state: {}
  meta: {}
  root: character_root
identityGraph := @seed <> @project(format: "graph")

@seed:
  nodes: [character_root, abilityNode]
  edges: [[character_root : "hasAbility" : abilityNode]]
  state: {}
  meta: {}
  root: character_root
abilityGraph := @seed <> @project(format: "graph")

@seed:
  nodes: [character_root, combatNode]
  edges: [[character_root : "hasCombat" : combatNode]]
  state: {}
  meta: {}
  root: character_root
combatGraph := @seed <> @project(format: "graph")

export { character_root, identityGraph, abilityGraph, combatGraph }
`,
    "app.tat": `
import {
  character_root,
  identityGraph,
  abilityGraph,
  combatGraph,
} from "./core.tat"

appGraph := @compose([identityGraph, abilityGraph, combatGraph], merge: character_root)
  <> @project(format: "graph")
`,
  });

  const result = executeTatModule(path.join(project, "app.tat"));
  const graph = result.state.graphs.get("appGraph");
  assert.ok(graph);
  assert.equal(graph.nodes.size, 4);
  assert.equal(graph.root, "character_root");
});

test("compose rejects duplicate non-merge node ids", () => {
  const project = createModuleProject({
    "core.tat": `
character_root = <{type: "root"}>
dup = <{type: "identity"}>

@seed:
  nodes: [character_root, dup]
  edges: [[character_root : "a" : dup]]
  state: {}
  meta: {}
  root: character_root
graphA := @seed <> @project(format: "graph")

@seed:
  nodes: [character_root, dup]
  edges: [[character_root : "b" : dup]]
  state: {}
  meta: {}
  root: character_root
graphB := @seed <> @project(format: "graph")

export { character_root, graphA, graphB }
`,
    "app.tat": `
import { character_root, graphA, graphB } from "./core.tat"
appGraph := @compose([graphA, graphB], merge: character_root)
  <> @project(format: "graph")
`,
  });

  assert.throws(
    () => executeTatModule(path.join(project, "app.tat")),
    /Duplicate non-merge node id/,
  );
});

test("compose rejects invalid input kind", () => {
  const project = createModuleProject({
    "core.tat": `
character_root = <{type: "root"}>
export { character_root }
`,
    "app.tat": `
import { character_root } from "./core.tat"
appGraph := @compose([character_root], merge: character_root)
  <> @project(format: "graph")
`,
  });

  assert.throws(
    () => executeTatModule(path.join(project, "app.tat")),
    /Invalid @compose input kind/,
  );
});

test("compose rejects program input kind", () => {
  const project = createModuleProject({
    "core.tat": `
character_root = <{type: "root"}>
doThing := @action {
  pipeline:
    -> @graft.branch(from, "supports", to)
}
export { character_root, doThing }
`,
    "app.tat": `
import { character_root, doThing } from "./core.tat"
appGraph := @compose([doThing], merge: character_root)
  <> @project(format: "graph")
`,
  });

  assert.throws(
    () => executeTatModule(path.join(project, "app.tat")),
    /Invalid @compose input kind/,
  );
});

test("aliased import binds to local name", () => {
  const project = createModuleProject({
    "core.tat": `
character_root = <{type: "root"}>
identityNode = <{type: "identity"}>
@seed:
  nodes: [character_root, identityNode]
  edges: []
  state: {}
  meta: {}
  root: character_root
identityGraph := @seed <> @project(format: "graph")
export { character_root, identityGraph }
`,
    "app.tat": `
import {
  character_root as root,
  identityGraph as identity
} from "./core.tat"

appGraph := @compose([identity], merge: root)
  <> @project(format: "graph")
`,
  });

  const result = executeTatModule(path.join(project, "app.tat"));
  const graph = result.state.graphs.get("appGraph");
  assert.ok(graph);
  assert.equal(graph.root, "character_root");
});

test("compose rejects invalid merge symbol", () => {
  const project = createModuleProject({
    "core.tat": `
character_root = <{type: "root"}>
identityNode = <{type: "identity"}>
@seed:
  nodes: [character_root, identityNode]
  edges: []
  state: {}
  meta: {}
  root: character_root
identityGraph := @seed <> @project(format: "graph")
export { identityGraph }
`,
    "app.tat": `
import { identityGraph } from "./core.tat"
appGraph := @compose([identityGraph], merge: missing_root)
  <> @project(format: "graph")
`,
  });

  assert.throws(
    () => executeTatModule(path.join(project, "app.tat")),
    /Invalid merge symbol/,
  );
});

test("importing a non-exported symbol fails", () => {
  const project = createModuleProject({
    "core.tat": `
character_root = <{type: "root"}>
export { }
`,
    "app.tat": `
import { character_root } from "./core.tat"
`,
  });

  assert.throws(
    () => executeTatModule(path.join(project, "app.tat")),
    /Unresolved imported symbol/,
  );
});

test("unresolved import path fails", () => {
  const project = createModuleProject({
    "app.tat": `
import { x } from "./missing.tat"
`,
  });

  assert.throws(
    () => executeTatModule(path.join(project, "app.tat")),
    /Unresolved import path/,
  );
});

test("invalid export reference fails", () => {
  const project = createModuleProject({
    "core.tat": `
export missingSymbol
`,
  });

  assert.throws(
    () => executeTatModule(path.join(project, "core.tat")),
    /Invalid export reference/,
  );
});

test("compose fails when merge anchor is missing in an asset", () => {
  const project = createModuleProject({
    "core.tat": `
character_root = <{type: "root"}>
other_root = <{type: "root"}>
identityNode = <{type: "identity"}>
abilityNode = <{type: "ability"}>

@seed:
  nodes: [character_root, identityNode]
  edges: []
  state: {}
  meta: {}
  root: character_root
identityGraph := @seed <> @project(format: "graph")

@seed:
  nodes: [other_root, abilityNode]
  edges: []
  state: {}
  meta: {}
  root: other_root
abilityGraph := @seed <> @project(format: "graph")

export { character_root, identityGraph, abilityGraph }
`,
    "app.tat": `
import { character_root, identityGraph, abilityGraph } from "./core.tat"
appGraph := @compose([identityGraph, abilityGraph], merge: character_root)
`,
  });

  assert.throws(
    () => executeTatModule(path.join(project, "app.tat")),
    /Missing merge anchor/,
  );
});

test("@where node context supports type/state/meta and compound operators", () => {
  const result = executeTat(`
character_root = <{type: "root"}>
choice_fighting_style = <{type: "choice"}>
option_defense_style = <{type: "option"}>
option_debug = <{type: "option"}>

@seed:
  nodes: [character_root, choice_fighting_style, option_defense_style, option_debug]
  edges: [
    [choice_fighting_style : "offers" : option_defense_style],
    [choice_fighting_style : "offers" : option_debug]
  ]
  state: {}
  meta: {}
  root: character_root

graph1 := @seed
  -> @graft.state(option_defense_style, "selected", false)
  -> @graft.meta(option_debug, "category", "debug")
  -> @prune.nodes(@where(type == "option" && (state.selected == false || meta.category == "debug")))
  <> @project(format: "graph")
`);

  const graph = result.execution.state.graphs.get("graph1");
  assert.ok(graph);
  assert.equal(graph.nodes.has("option_defense_style"), false);
  assert.equal(graph.nodes.has("option_debug"), false);
});

test("@where ordered comparisons support numeric ranges", () => {
  const result = executeTat(`
score = <{type: "score"}>
note1 = <{type: "note"}>
note2 = <{type: "note"}>
note3 = <{type: "note"}>

@seed:
  nodes: [score, note1, note2, note3]
  edges: []
  state: {}
  meta: {}
  root: score

graph1 := @seed
  -> @graft.meta(note1, "measureNumber", 1)
  -> @graft.meta(note2, "measureNumber", 2)
  -> @graft.meta(note3, "measureNumber", 3)

@bind.state(selectedRangePartId := "P1")
@bind.ctx(startMeasure := 2)
@bind.ctx(endMeasure := 3)
@bind.state(selectedRangeStart := startMeasure)
@bind.state(selectedRangeEnd := endMeasure)
@bind.state.node(activePracticeNotes := @where(node.value.type == "note" && node.meta.measureNumber >= startMeasure && node.meta.measureNumber <= endMeasure))
`);

  const graph = result.execution.state.graphs.get("graph1");
  assert.ok(graph);
  assert.equal(graph.state.selectedRangePartId, "P1");
  assert.equal(graph.state.selectedRangeStart, 2);
  assert.equal(graph.state.selectedRangeEnd, 3);
  const activePracticeNotes = graph.state.activePracticeNotes as any[];
  assert.ok(Array.isArray(activePracticeNotes));
  assert.deepEqual(
    activePracticeNotes.map((node) => node.id),
    ["note2", "note3"],
  );
});

test("@first can derive a selected measure default target node", () => {
  const result = executeTat(`
score = <{type: "score"}>
noteA = <{type: "note"}>
noteB = <{type: "note"}>
restC = <{type: "rest"}>

@seed:
  nodes: [score, noteA, noteB, restC]
  edges: []
  state: {}
  meta: {}
  root: score

graph1 := @seed
  -> @graft.meta(noteA, "sourceRef", {partId: "P1", measureNumber: 4})
  -> @graft.meta(noteA, "measureDefaultTargetRank", 1)
  -> @graft.meta(noteB, "sourceRef", {partId: "P1", measureNumber: 4})
  -> @graft.meta(noteB, "measureDefaultTargetRank", 0)
  -> @graft.meta(restC, "sourceRef", {partId: "P1", measureNumber: 4})

@bind.ctx(selectedMeasurePartId := "P1")
@bind.ctx(selectedMeasureNumber := 4)
@bind.state(selectedMeasurePartId := selectedMeasurePartId)
@bind.state(selectedMeasureNumber := selectedMeasureNumber)
@bind.state.node(selectedMeasureNotes := @where(node.value.type == "note" && node.meta.sourceRef.partId == selectedMeasurePartId && node.meta.sourceRef.measureNumber == selectedMeasureNumber))
@bind.state.node(selectedMeasureDefaultTarget := @first(@where(node.value.type == "note" && node.meta.sourceRef.partId == selectedMeasurePartId && node.meta.sourceRef.measureNumber == selectedMeasureNumber && node.meta.measureDefaultTargetRank == 0)))
`);

  const graph = result.execution.state.graphs.get("graph1");
  assert.ok(graph);
  assert.equal(graph.state.selectedMeasurePartId, "P1");
  assert.equal(graph.state.selectedMeasureNumber, 4);
  const selectedMeasureNotes = graph.state.selectedMeasureNotes as any[];
  assert.deepEqual(
    selectedMeasureNotes.map((node) => node.id),
    ["noteA", "noteB"],
  );
  const selectedMeasureDefaultTarget = graph.state.selectedMeasureDefaultTarget as any;
  assert.equal(selectedMeasureDefaultTarget?.id, "noteB");
});

test("@first can derive an initial default target node", () => {
  const result = executeTat(`
score = <{type: "score"}>
noteA = <{type: "note"}>
noteB = <{type: "note"}>

@seed:
  nodes: [score, noteA, noteB]
  edges: []
  state: {}
  meta: {}
  root: score

graph1 := @seed
  -> @graft.meta(noteA, "initialSelectionRank", 0)
  -> @graft.meta(noteB, "initialSelectionRank", 1)

@bind.state.node(initialDefaultTarget := @first(@where(node.value.type == "note" && node.meta.initialSelectionRank == 0)))
`);

  const graph = result.execution.state.graphs.get("graph1");
  assert.ok(graph);
  const initialDefaultTarget = graph.state.initialDefaultTarget as any;
  assert.equal(initialDefaultTarget?.id, "noteA");
});

test("@first returns empty when a selected measure has no playable note", () => {
  const result = executeTat(`
score = <{type: "score"}>
restA = <{type: "rest"}>

@seed:
  nodes: [score, restA]
  edges: []
  state: {}
  meta: {}
  root: score

graph1 := @seed
  -> @graft.meta(restA, "sourceRef", {partId: "P1", measureNumber: 8})

@bind.ctx(selectedMeasurePartId := "P1")
@bind.ctx(selectedMeasureNumber := 8)
@bind.state(selectedMeasurePartId := selectedMeasurePartId)
@bind.state(selectedMeasureNumber := selectedMeasureNumber)
@bind.state.node(selectedMeasureNotes := @where(node.value.type == "note" && node.meta.sourceRef.partId == selectedMeasurePartId && node.meta.sourceRef.measureNumber == selectedMeasureNumber))
@bind.state.node(selectedMeasureDefaultTarget := @first(@where(node.value.type == "note" && node.meta.sourceRef.partId == selectedMeasurePartId && node.meta.sourceRef.measureNumber == selectedMeasureNumber && node.meta.measureDefaultTargetRank == 0)))
`);

  const graph = result.execution.state.graphs.get("graph1");
  assert.ok(graph);
  assert.deepEqual(graph.state.selectedMeasureNotes, []);
  assert.equal(graph.state.selectedMeasureDefaultTarget, null);
});

test("@where can derive an ordered measure practice note sequence for a selected voice", () => {
  const result = executeTat(`
score = <{type: "score"}>
noteVoice2A = <{type: "note"}>
noteVoice1 = <{type: "note"}>
noteVoice2B = <{type: "note"}>
noteOtherMeasure = <{type: "note"}>

@seed:
  nodes: [score, noteVoice2A, noteVoice1, noteVoice2B, noteOtherMeasure]
  edges: []
  state: {}
  meta: {}
  root: score

graph1 := @seed
  -> @graft.meta(noteVoice2A, "sourceRef", {partId: "P1", measureNumber: 4, voice: "2", eventIndex: 0})
  -> @graft.meta(noteVoice1, "sourceRef", {partId: "P1", measureNumber: 4, voice: "1", eventIndex: 1})
  -> @graft.meta(noteVoice2B, "sourceRef", {partId: "P1", measureNumber: 4, voice: "2", eventIndex: 2})
  -> @graft.meta(noteOtherMeasure, "sourceRef", {partId: "P1", measureNumber: 5, voice: "2", eventIndex: 0})

@bind.ctx(selectedMeasurePartId := "P1")
@bind.ctx(selectedMeasureNumber := 4)
@bind.ctx(selectedMeasureVoice := "2")
@bind.state(selectedMeasurePartId := selectedMeasurePartId)
@bind.state(selectedMeasureNumber := selectedMeasureNumber)
@bind.state(selectedMeasureVoice := selectedMeasureVoice)
@bind.state.node(orderedMeasurePracticeNotes := @where(node.value.type == "note" && node.meta.sourceRef.partId == selectedMeasurePartId && node.meta.sourceRef.measureNumber == selectedMeasureNumber && node.meta.sourceRef.voice == selectedMeasureVoice))
`);

  const graph = result.execution.state.graphs.get("graph1");
  assert.ok(graph);
  assert.equal(graph.state.selectedMeasurePartId, "P1");
  assert.equal(graph.state.selectedMeasureNumber, 4);
  assert.equal(graph.state.selectedMeasureVoice, "2");
  const orderedMeasurePracticeNotes = graph.state.orderedMeasurePracticeNotes as any[];
  assert.deepEqual(
    orderedMeasurePracticeNotes.map((node) => node.id),
    ["noteVoice2A", "noteVoice2B"],
  );
});

test("@where node context missing keys are non-match", () => {
  const result = executeTat(`
character_root = <{type: "root"}>
option_a = <{type: "option"}>
option_b = <{type: "option"}>

@seed:
  nodes: [character_root, option_a, option_b]
  edges: []
  state: {}
  meta: {}
  root: character_root

graph1 := @seed
  -> @graft.meta(option_b, "category", "debug")
  -> @prune.nodes(@where(meta.category == "debug"))
  <> @project(format: "graph")
`);

  const graph = result.execution.state.graphs.get("graph1");
  assert.ok(graph);
  assert.equal(graph.nodes.has("option_a"), true);
  assert.equal(graph.nodes.has("option_b"), false);
});

test("@where edge context supports rel/source symbol matching", () => {
  const result = executeTat(`
character_root = <{type: "root"}>
choice_fighting_style = <{type: "choice"}>
option_defense_style = <{type: "option"}>
class_fighter = <{type: "class"}>

@seed:
  nodes: [character_root, choice_fighting_style, option_defense_style, class_fighter]
  edges: [
    [choice_fighting_style : "offers" : option_defense_style],
    [class_fighter : "grantsFeature" : option_defense_style]
  ]
  state: {}
  meta: {}
  root: character_root

graph1 := @seed
  -> @prune.edges(@where(rel == "offers"))
  <> @project(format: "graph")

graph2 := @seed
  -> @prune.edges(@where(source == class_fighter && rel == "grantsFeature"))
  <> @project(format: "graph")
`);

  const graph1 = result.execution.state.graphs.get("graph1");
  const graph2 = result.execution.state.graphs.get("graph2");
  assert.ok(graph1);
  assert.ok(graph2);
  assert.equal(graph1.edges.some((edge) => edge.relation === "offers"), false);
  assert.equal(
    graph2.edges.some(
      (edge) => edge.subject === "class_fighter" && edge.relation === "grantsFeature",
    ),
    false,
  );
});

test("@prune.nodes removes matching nodes, attached edges, and node state/meta", () => {
  const result = executeTat(`
character_root = <{type: "root"}>
option_defense_style = <{type: "option"}>
option_other = <{type: "option"}>

@seed:
  nodes: [character_root, option_defense_style, option_other]
  edges: [
    [character_root : "offers" : option_defense_style],
    [character_root : "offers" : option_other]
  ]
  state: {}
  meta: {}
  root: character_root

graph1 := @seed
  -> @graft.state(option_defense_style, "selected", false)
  -> @graft.meta(option_defense_style, "category", "debug")
  -> @prune.nodes(@where(id == "option_defense_style"))
  <> @project(format: "graph")
`);

  const graph = result.execution.state.graphs.get("graph1");
  assert.ok(graph);
  assert.equal(graph.nodes.has("option_defense_style"), false);
  assert.equal(
    graph.edges.some(
      (edge) => edge.subject === "option_defense_style" || edge.object === "option_defense_style",
    ),
    false,
  );
});

test("@prune.edges removes matching edges only and keeps nodes", () => {
  const result = executeTat(`
character_root = <{type: "root"}>
choice_fighting_style = <{type: "choice"}>
option_defense_style = <{type: "option"}>

@seed:
  nodes: [character_root, choice_fighting_style, option_defense_style]
  edges: [
    [choice_fighting_style : "offers" : option_defense_style]
  ]
  state: {}
  meta: {}
  root: character_root

graph1 := @seed
  -> @prune.edges(@where(rel == "offers"))
  <> @project(format: "graph")
`);

  const graph = result.execution.state.graphs.get("graph1");
  assert.ok(graph);
  assert.equal(graph.edges.length, 0);
  assert.equal(graph.nodes.has("choice_fighting_style"), true);
  assert.equal(graph.nodes.has("option_defense_style"), true);
});

test("invalid @where field for edge prune fails", () => {
  assert.throws(
    () =>
      executeTat(`
character_root = <{type: "root"}>
option_a = <{type: "option"}>
@seed:
  nodes: [character_root, option_a]
  edges: [[character_root : "offers" : option_a]]
  state: {}
  meta: {}
  root: character_root
graph1 := @seed
  -> @prune.edges(@where(state.selected == false))
`),
    /Invalid @where field for edge prune/,
  );
});

test("malformed @where predicate syntax fails", () => {
  assert.throws(
    () =>
      executeTat(`
character_root = <{type: "root"}>
option_a = <{type: "option"}>
@seed:
  nodes: [character_root, option_a]
  edges: []
  state: {}
  meta: {}
  root: character_root
graph1 := @seed
  -> @prune.nodes(@where(!type))
`),
    /Malformed @where predicate syntax/,
  );
});

function createModuleProject(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "tat-mod-"));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(root, name), content.trimStart(), "utf8");
  }
  return root;
}

test("executes path query", () => {
  const result = executeTat(`
A = <Ti>
B = <Do>
C = <Mi>

node1 = <A>
node2 = <B>
node3 = <C>

@seed:
  nodes: [node1, node2, node3]
  edges: [
    [node1 : "supports" : node2],
    [node2 : "inside" : node3]
  ]
  state: {}
  meta: {}
  root: node1

@path(node1, node3)
`);

  assert.equal(result.execution.state.queryResults.length, 1);

  const queryResult = result.execution.state.queryResults[0].result;
  assert.equal(queryResult.kind, "PathResultSet");

  if (queryResult.kind === "PathResultSet") {
    assert.equal(queryResult.items.length, 1);
    assert.equal(queryResult.items[0].length, 2);
    assert.equal(queryResult.items[0].steps[0].relation, "supports");
    assert.equal(queryResult.items[0].steps[1].relation, "inside");
  }
});

test("executes why query", () => {
  const result = executeTat(`
A = <Ti>
B = <Do>

node1 = <A>
node2 = <B>

@seed:
  nodes: [node1, node2]
  edges: [
    [node1 : "supports" : node2]
  ]
  state: {}
  meta: {}
  root: node1

@why(node1 : "supports" : node2)
`);

  assert.equal(result.execution.state.queryResults.length, 1);

  const queryResult = result.execution.state.queryResults[0].result;
  assert.equal(queryResult.kind, "ReasonResultSet");

  if (queryResult.kind === "ReasonResultSet") {
    assert.equal(queryResult.items.length, 1);
    assert.equal(queryResult.items[0].claim.subject, "node1");
    assert.equal(queryResult.items[0].claim.relation, "supports");
    assert.equal(queryResult.items[0].claim.object, "node2");
    assert.equal(queryResult.items[0].matchedEdges.length, 1);
    assert.ok(queryResult.items[0].because.length >= 1);
  }
});
