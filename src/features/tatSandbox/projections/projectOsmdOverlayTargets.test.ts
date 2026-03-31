import test from "node:test";
import assert from "node:assert/strict";
import { projectOsmdOverlayTargets } from "./projectOsmdOverlayTargets.ts";

function makeNode(id, value, meta = {}, state = {}) {
  return {
    id,
    value,
    meta,
    state,
  };
}

test("overlay projection consumes graph-derived selected measure notes", () => {
  const noteMeasureOne = makeNode(
    "note-m1",
    { kind: "note", measureNumber: 1 },
    {
      sourceKey: "P1|m1|v1|e1",
      sourceRef: { partId: "P1", measureNumber: 1, voice: "1", eventIndex: 1 },
      onsetDivision: 0,
      durationDivision: 1,
    },
  );
  const noteMeasureTwo = makeNode(
    "note-m2",
    { kind: "note", measureNumber: 2 },
    {
      sourceKey: "P1|m2|v1|e1",
      sourceRef: { partId: "P1", measureNumber: 2, voice: "1", eventIndex: 1 },
      onsetDivision: 0,
      durationDivision: 1,
    },
  );

  const graph = {
    nodes: new Map([
      [noteMeasureOne.id, noteMeasureOne],
      [noteMeasureTwo.id, noteMeasureTwo],
    ]),
    edges: [],
    root: null,
    state: {
      selectedMeasurePartId: "P1",
      selectedMeasureNumber: 1,
      selectedMeasureNotes: [
        { id: "note-m1", value: noteMeasureOne.value, meta: noteMeasureOne.meta, state: {} },
      ],
    },
    meta: {},
    history: [],
  };

  const projection = projectOsmdOverlayTargets(graph, "note-m2");

  assert.equal(projection.measureNumber, 1);
  assert.deepEqual(
    projection.targets.map((target) => target.tatNodeId),
    ["note-m1"],
  );
});

test("overlay projection handles selected measures with no derived notes safely", () => {
  const graph = {
    nodes: new Map(),
    edges: [],
    root: null,
    state: {
      selectedMeasurePartId: "P1",
      selectedMeasureNumber: 9,
      selectedMeasureNotes: [],
    },
    meta: {},
    history: [],
  };

  const projection = projectOsmdOverlayTargets(graph);

  assert.equal(projection.measureNumber, 9);
  assert.equal(projection.measureDurationDivision, 0);
  assert.deepEqual(projection.targets, []);
});
