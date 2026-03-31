import test from "node:test";
import assert from "node:assert/strict";
import { executeTat } from "../runtime/index";

test("match supports wildcard in subject position", () => {
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

@match(_ : "supports" : Y)
`);

  assert.equal(result.execution.state.queryResults.length, 1);

  const queryResult = result.execution.state.queryResults[0].result;
  assert.equal(queryResult.kind, "MatchResultSet");

  if (queryResult.kind === "MatchResultSet") {
    assert.equal(queryResult.items.length, 1);
    assert.equal(queryResult.items[0].bindings.Y, "node2");
    assert.deepEqual(Object.keys(queryResult.items[0].bindings), ["Y"]);
  }
});

test("match supports wildcard in object position", () => {
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

@match(X : "supports" : _)
`);

  const queryResult = result.execution.state.queryResults[0].result;
  assert.equal(queryResult.kind, "MatchResultSet");

  if (queryResult.kind === "MatchResultSet") {
    assert.equal(queryResult.items.length, 1);
    assert.equal(queryResult.items[0].bindings.X, "node1");
    assert.deepEqual(Object.keys(queryResult.items[0].bindings), ["X"]);
  }
});

test("match supports regex in relation position", () => {
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

@match(X : /support.*/ : Y)
`);

  const queryResult = result.execution.state.queryResults[0].result;
  assert.equal(queryResult.kind, "MatchResultSet");

  if (queryResult.kind === "MatchResultSet") {
    assert.equal(queryResult.items.length, 1);
    assert.equal(queryResult.items[0].bindings.X, "node1");
    assert.equal(queryResult.items[0].bindings.Y, "node2");
  }
});

test("match supports regex with no matches", () => {
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

@match(X : /^inside$/ : Y)
`);

  const queryResult = result.execution.state.queryResults[0].result;
  assert.equal(queryResult.kind, "MatchResultSet");

  if (queryResult.kind === "MatchResultSet") {
    assert.equal(queryResult.items.length, 0);
  }
});

test("match supports wildcard plus regex together", () => {
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

@match(_ : /support.*/ : Y)
`);

  const queryResult = result.execution.state.queryResults[0].result;
  assert.equal(queryResult.kind, "MatchResultSet");

  if (queryResult.kind === "MatchResultSet") {
    assert.equal(queryResult.items.length, 1);
    assert.equal(queryResult.items[0].bindings.Y, "node2");
  }
});