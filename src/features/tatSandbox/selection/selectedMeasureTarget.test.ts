import test from "node:test";
import assert from "node:assert/strict";
import {
  readInitialDefaultTargetId,
  readOrderedMeasurePracticeNoteIds,
  readSelectedMeasureDefaultTargetId,
} from "./selectedMeasureTarget.ts";

test("reads a TAT-derived initial default target id from graph state", () => {
  const graph = {
    state: {
      initialDefaultTarget: {
        id: "note-1",
      },
    },
  };

  assert.equal(readInitialDefaultTargetId(graph), "note-1");
});

test("reads a TAT-derived selected measure default target id from graph state", () => {
  const graph = {
    state: {
      selectedMeasurePartId: "P1",
      selectedMeasureNumber: 4,
      selectedMeasureDefaultTarget: {
        id: "note-4",
      },
    },
  };

  assert.equal(
    readSelectedMeasureDefaultTargetId(graph, {
      partId: "P1",
      measureNumber: 4,
    }),
    "note-4",
  );
});

test("ignores stale graph state when the selected measure context no longer matches", () => {
  const graph = {
    state: {
      selectedMeasurePartId: "P1",
      selectedMeasureNumber: 4,
      selectedMeasureDefaultTarget: {
        id: "note-4",
      },
    },
  };

  assert.equal(
    readSelectedMeasureDefaultTargetId(graph, {
      partId: "P1",
      measureNumber: 5,
    }),
    null,
  );
});

test("handles measures with no derived default target safely", () => {
  const graph = {
    state: {
      selectedMeasurePartId: "P1",
      selectedMeasureNumber: 8,
      selectedMeasureDefaultTarget: null,
    },
  };

  assert.equal(
    readSelectedMeasureDefaultTargetId(graph, {
      partId: "P1",
      measureNumber: 8,
    }),
    null,
  );
});

test("handles missing initial default target safely", () => {
  const graph = {
    state: {
      initialDefaultTarget: null,
    },
  };

  assert.equal(readInitialDefaultTargetId(graph), null);
});

test("reads ordered measure practice note ids from TAT-derived graph state", () => {
  const graph = {
    state: {
      selectedMeasurePartId: "P1",
      selectedMeasureNumber: 4,
      selectedMeasureVoice: "2",
      orderedMeasurePracticeNotes: [
        { id: "note-4a" },
        { id: "note-4b" },
        { id: "note-4c" },
      ],
    },
  };

  assert.deepEqual(
    readOrderedMeasurePracticeNoteIds(graph, {
      partId: "P1",
      measureNumber: 4,
      voice: "2",
    }),
    ["note-4a", "note-4b", "note-4c"],
  );
});

test("ignores stale ordered measure practice notes when the selection context differs", () => {
  const graph = {
    state: {
      selectedMeasurePartId: "P1",
      selectedMeasureNumber: 4,
      selectedMeasureVoice: "2",
      orderedMeasurePracticeNotes: [
        { id: "note-4a" },
        { id: "note-4b" },
      ],
    },
  };

  assert.deepEqual(
    readOrderedMeasurePracticeNoteIds(graph, {
      partId: "P1",
      measureNumber: 5,
      voice: "2",
    }),
    [],
  );
  assert.deepEqual(
    readOrderedMeasurePracticeNoteIds(graph, {
      partId: "P1",
      measureNumber: 4,
      voice: "1",
    }),
    [],
  );
});
