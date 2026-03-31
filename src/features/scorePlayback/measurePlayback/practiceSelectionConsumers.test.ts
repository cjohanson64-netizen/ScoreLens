import test from "node:test";
import assert from "node:assert/strict";
import { buildSegmentNoteSequence } from "./buildSegmentNoteSequence.ts";
import {
  buildFullSongPlaybackEvents,
  buildSegmentPlaybackEvents,
} from "./buildSegmentPlaybackEvents.ts";

const timeline = {
  ppq: 480,
  totalDurationTicks: 1440,
  measures: [
    {
      nodeId: "measure-1",
      partId: "P1",
      measureNumber: 1,
      measureStartTicks: 0,
      measureDurationTicks: 480,
      measureEndTicks: 480,
      divisionsPerQuarter: 1,
    },
    {
      nodeId: "measure-2",
      partId: "P1",
      measureNumber: 2,
      measureStartTicks: 480,
      measureDurationTicks: 480,
      measureEndTicks: 960,
      divisionsPerQuarter: 1,
    },
  ],
  events: [
    {
      nodeId: "note-1",
      kind: "note",
      sourceKey: "P1::1::0",
      partId: "P1",
      measureNumber: 1,
      voice: "1",
      eventIndex: 0,
      onsetDivision: 0,
      durationDivision: 1,
      onsetTicks: 0,
      durationTicks: 240,
      endTicks: 240,
      measureStartTicks: 0,
      divisionsPerQuarter: 1,
      pitchText: "C4",
      tieStop: false,
    },
    {
      nodeId: "rest-2",
      kind: "rest",
      sourceKey: "P1::2::0",
      partId: "P1",
      measureNumber: 2,
      voice: "1",
      eventIndex: 0,
      onsetDivision: 0,
      durationDivision: 1,
      onsetTicks: 480,
      durationTicks: 120,
      endTicks: 600,
      measureStartTicks: 480,
      divisionsPerQuarter: 1,
      pitchText: null,
      tieStop: false,
    },
    {
      nodeId: "note-2",
      kind: "note",
      sourceKey: "P1::2::1",
      partId: "P1",
      measureNumber: 2,
      voice: "1",
      eventIndex: 1,
      onsetDivision: 1,
      durationDivision: 1,
      onsetTicks: 600,
      durationTicks: 240,
      endTicks: 840,
      measureStartTicks: 480,
      divisionsPerQuarter: 1,
      pitchText: "D4",
      tieStop: false,
    },
  ],
};

test("segment note sequence can consume graph-derived active practice note ids", () => {
  const notes = buildSegmentNoteSequence({
    timeline,
    selection: {
      partId: "P1",
      startMeasureNumber: 1,
      endMeasureNumber: 1,
    },
    bpm: 120,
    activeNoteIds: ["note-2"],
  });

  assert.deepEqual(
    notes.map((note) => note.nodeId),
    ["note-2"],
  );
});

test("segment playback events can consume graph-derived active practice event ids", () => {
  const events = buildSegmentPlaybackEvents({
    timeline,
    selection: {
      partId: "P1",
      startMeasureNumber: 1,
      endMeasureNumber: 1,
    },
    bpm: 120,
    activeEventIds: ["rest-2", "note-2"],
  });

  assert.deepEqual(
    events.map((event) => event.eventId),
    ["rest-2", "note-2"],
  );
  assert.equal(events[0]?.startTicks, 0);
});

test("full-song playback merges tied notes even when other events intervene", () => {
  const fullSongTimeline = {
    ppq: 480,
    totalDurationTicks: 960,
    measures: [
      {
        nodeId: "measure-1",
        partId: "P1",
        measureNumber: 1,
        measureStartTicks: 0,
        measureDurationTicks: 480,
        measureEndTicks: 480,
        divisionsPerQuarter: 1,
      },
      {
        nodeId: "measure-2",
        partId: "P1",
        measureNumber: 2,
        measureStartTicks: 480,
        measureDurationTicks: 480,
        measureEndTicks: 960,
        divisionsPerQuarter: 1,
      },
    ],
    events: [
      {
        nodeId: "tie-start",
        kind: "note",
        sourceKey: "P1::1::0",
        partId: "P1",
        measureNumber: 1,
        voice: "1",
        eventIndex: 0,
        onsetDivision: 0,
        durationDivision: 1,
        onsetTicks: 0,
        durationTicks: 480,
        endTicks: 480,
        measureStartTicks: 0,
        divisionsPerQuarter: 1,
        pitchText: "C4",
        tieStop: false,
      },
      {
        nodeId: "intervening-other-voice",
        kind: "note",
        sourceKey: "P1::2::0",
        partId: "P1",
        measureNumber: 2,
        voice: "2",
        eventIndex: 0,
        onsetDivision: 0,
        durationDivision: 1,
        onsetTicks: 480,
        durationTicks: 120,
        endTicks: 600,
        measureStartTicks: 480,
        divisionsPerQuarter: 1,
        pitchText: "E4",
        tieStop: false,
      },
      {
        nodeId: "tie-stop",
        kind: "note",
        sourceKey: "P1::2::1",
        partId: "P1",
        measureNumber: 2,
        voice: "1",
        eventIndex: 1,
        onsetDivision: 0,
        durationDivision: 1,
        onsetTicks: 480,
        durationTicks: 480,
        endTicks: 960,
        measureStartTicks: 480,
        divisionsPerQuarter: 1,
        pitchText: "C4",
        tieStop: true,
      },
    ],
  };

  const events = buildFullSongPlaybackEvents({
    timeline: fullSongTimeline,
    bpm: 120,
  });

  assert.deepEqual(
    events.map((event) => event.eventId),
    ["tie-start", "intervening-other-voice"],
  );
  assert.equal(events[0]?.durationTicks, 960);
});
