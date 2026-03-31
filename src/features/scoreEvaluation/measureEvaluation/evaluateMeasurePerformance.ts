import type { MeasurePlayableNote } from "../../scorePlayback/measurePlayback/buildMeasureNoteSequence";
import { midiToFrequency, pitchToMidi } from "../../scorePlayback/pitch/pitchUtils";
import { ticksToMilliseconds } from "../../scorePlayback/constants/timing";
import type {
  MeasureEvaluationDebug,
  MeasureExpectedNote,
  MeasureNoteEvaluation,
  MeasurePerformedFrame,
  MeasurePerformedNote,
  PitchRhythmMarker,
} from "./types";
import { getRhythmToleranceMs, isRhythmCorrect } from "./rhythmEvaluation";
import { centsDifference, isPitchCorrect, medianFrequency } from "./pitchEvaluation";

const STABLE_WINDOW_MS = 140;
const RELEASE_GAP_MS = 110;
const PITCH_SPLIT_CENTS = 95;
const PITCH_SPLIT_HOLD_MS = 95;
const MIN_EVENT_DURATION_MS = 70;
const MIN_PITCH_SAMPLES = 2;
const FIRST_NOTE_GUARD_MS = 45;
const DEBUG_MEASURE_ALIGNMENT = false;

export function normalizeExpectedTimeline({
  notes,
  bpm,
  ppq,
}: {
  notes: MeasurePlayableNote[];
  bpm: number;
  ppq: number;
}): MeasureExpectedNote[] {
  if (!notes.length) return [];

  const firstOnsetTicks = notes[0].onsetTicks;

  return notes.map((note) => {
    const expectedMidi = pitchToMidi(note.pitch);
    return {
      noteId: note.nodeId,
      expectedMidi,
      expectedPitchHz:
        typeof expectedMidi === "number" ? midiToFrequency(expectedMidi) : null,
      expectedOnsetMs: Math.max(
        0,
        ticksToMilliseconds(note.onsetTicks - firstOnsetTicks, bpm, ppq),
      ),
      expectedDurationMs: Math.max(1, note.durationMs),
    };
  });
}

export function extractPerformedNotes(
  frames: MeasurePerformedFrame[],
): MeasurePerformedNote[] {
  if (!frames.length) return [];

  const orderedFrames = [...frames].sort((a, b) => a.timeMs - b.timeMs);
  const notes: MeasurePerformedNote[] = [];
  let active:
    | {
        onsetMs: number;
        samples: number[];
        silentMs: number;
        lastPitchMs: number;
        anchorPitchHz: number;
        splitCandidateStartMs: number | null;
        claritySum: number;
        rmsSum: number;
        frameCount: number;
      }
    | null = null;

  for (let index = 0; index < orderedFrames.length; index += 1) {
    const frame = orderedFrames[index];
    const previous = index > 0 ? orderedFrames[index - 1] : null;
    const deltaMs = Math.max(0, frame.timeMs - (previous?.timeMs ?? frame.timeMs));
    const hasPitch =
      frame.hasStablePitch &&
      Number.isFinite(frame.detectedHz) &&
      frame.clarity >= 0.9;

    if (!active && hasPitch) {
      active = {
        onsetMs: frame.timeMs,
        samples: [],
        silentMs: 0,
        lastPitchMs: frame.timeMs,
        anchorPitchHz: frame.detectedHz ?? 0,
        splitCandidateStartMs: null,
        claritySum: 0,
        rmsSum: 0,
        frameCount: 0,
      };
    }

    if (!active) continue;

    if (hasPitch) {
      active.silentMs = 0;
      active.lastPitchMs = frame.timeMs;
      active.claritySum += frame.clarity;
      active.rmsSum += frame.rmsDb;
      active.frameCount += 1;
      const withinWindow = frame.timeMs - active.onsetMs <= STABLE_WINDOW_MS;
      if (withinWindow && typeof frame.detectedHz === "number") {
        active.samples.push(frame.detectedHz);
      }

      if (typeof frame.detectedHz === "number") {
        const cents = centsDifference(active.anchorPitchHz, frame.detectedHz);
        const pitchMoved = Number.isFinite(cents) && Math.abs(cents) >= PITCH_SPLIT_CENTS;

        if (pitchMoved) {
          if (active.splitCandidateStartMs === null) {
            active.splitCandidateStartMs = frame.timeMs;
          } else if (frame.timeMs - active.splitCandidateStartMs >= PITCH_SPLIT_HOLD_MS) {
            notes.push({
              onsetMs: active.onsetMs,
              stablePitchHz: medianFrequency(active.samples),
              sampleCount: active.samples.length,
              noteDurationMs: Math.max(
                0,
                active.splitCandidateStartMs - active.onsetMs,
              ),
              avgClarity:
                active.frameCount > 0
                  ? active.claritySum / active.frameCount
                  : null,
              avgRmsDb:
                active.frameCount > 0
                  ? active.rmsSum / active.frameCount
                  : null,
            });

            active = {
              onsetMs: active.splitCandidateStartMs,
              samples: [frame.detectedHz],
              silentMs: 0,
              lastPitchMs: frame.timeMs,
              anchorPitchHz: frame.detectedHz,
              splitCandidateStartMs: null,
              claritySum: frame.clarity,
              rmsSum: frame.rmsDb,
              frameCount: 1,
            };
          }
        } else {
          active.splitCandidateStartMs = null;
        }
      }

      continue;
    }

    active.silentMs += deltaMs;
    if (active.silentMs < RELEASE_GAP_MS) continue;

    notes.push({
      onsetMs: active.onsetMs,
      stablePitchHz: medianFrequency(active.samples),
      sampleCount: active.samples.length,
      noteDurationMs: Math.max(0, active.lastPitchMs - active.onsetMs),
      avgClarity:
        active.frameCount > 0 ? active.claritySum / active.frameCount : null,
      avgRmsDb: active.frameCount > 0 ? active.rmsSum / active.frameCount : null,
    });
    active = null;
  }

  if (active) {
    notes.push({
      onsetMs: active.onsetMs,
      stablePitchHz: medianFrequency(active.samples),
      sampleCount: active.samples.length,
      noteDurationMs: Math.max(0, active.lastPitchMs - active.onsetMs),
      avgClarity:
        active.frameCount > 0 ? active.claritySum / active.frameCount : null,
      avgRmsDb: active.frameCount > 0 ? active.rmsSum / active.frameCount : null,
    });
  }

  return notes;
}

export function normalizePerformedTimeline(
  performedNotes: MeasurePerformedNote[],
): MeasurePerformedNote[] {
  return performedNotes.filter((note) => {
    if (!Number.isFinite(note.onsetMs) || note.onsetMs < 0) return false;
    if (note.sampleCount < MIN_PITCH_SAMPLES) return false;

    if (note.onsetMs < FIRST_NOTE_GUARD_MS && note.noteDurationMs < MIN_EVENT_DURATION_MS) {
      return false;
    }

    return note.noteDurationMs >= MIN_EVENT_DURATION_MS || note.sampleCount >= 3;
  });
}

export function evaluateMeasurePerformance({
  selectionKey,
  expectedNotes,
  performedNotes,
  beatDurationMs,
}: {
  selectionKey: string;
  expectedNotes: MeasureExpectedNote[];
  performedNotes: MeasurePerformedNote[];
  beatDurationMs?: number | null;
}): MeasureNoteEvaluation[] {
  return evaluateMeasurePerformanceDetailed({
    selectionKey,
    expectedNotes,
    performedNotes,
    beatDurationMs,
  }).evaluations;
}

export function evaluateMeasurePerformanceDetailed({
  selectionKey,
  expectedNotes,
  performedNotes,
  beatDurationMs,
}: {
  selectionKey: string;
  expectedNotes: MeasureExpectedNote[];
  performedNotes: MeasurePerformedNote[];
  beatDurationMs?: number | null;
}): { evaluations: MeasureNoteEvaluation[]; debug: MeasureEvaluationDebug } {
  const normalizedExpected = [...expectedNotes];
  const normalizedPerformed = normalizePerformedTimeline(performedNotes);
  const rhythmToleranceMs = getRhythmToleranceMs(beatDurationMs);
  const pairs = matchPerformedToExpected({
    expectedNotes: normalizedExpected,
    performedNotes: normalizedPerformed,
    rhythmToleranceMs,
  });

  if (DEBUG_MEASURE_ALIGNMENT) {
    console.log("[measure-eval] expected timeline", normalizedExpected);
    console.log("[measure-eval] performed timeline", normalizedPerformed);
    console.log("[measure-eval] matched pairs", pairs);
  }

  const usedPerformedIndices = new Set<number>();

  const evaluations = normalizedExpected.map((expectedNote, index) => {
    const pair = pairs[index] ?? null;
    const matchedPerformed = pair?.performed ?? null;
    const matchedPerformedPitch = matchedPerformed?.stablePitchHz ?? null;
    const matchedPerformedOnsetMs = matchedPerformed?.onsetMs ?? null;
    const matchedPerformedIndex = pair?.performedIndex ?? null;
    if (typeof matchedPerformedIndex === "number") {
      usedPerformedIndices.add(matchedPerformedIndex);
    }

    const pitchCorrect = isPitchCorrect(
      expectedNote.expectedPitchHz,
      matchedPerformedPitch,
      50,
    );
    const rhythmCorrect = isRhythmCorrect(
      expectedNote.expectedOnsetMs,
      matchedPerformedOnsetMs,
      beatDurationMs,
    );

    return {
      selectionKey,
      noteId: expectedNote.noteId,
      expectedMidi: expectedNote.expectedMidi,
      expectedPitchHz: expectedNote.expectedPitchHz,
      expectedOnsetMs: expectedNote.expectedOnsetMs,
      matchedPerformedPitch,
      matchedPerformedOnsetMs,
      pitchCorrect,
      rhythmCorrect,
      marker: getMarker(pitchCorrect, rhythmCorrect),
    };
  });

  const matches = evaluations.map((evaluation, index) => {
    const pair = pairs[index] ?? null;
    const label: "OK" | "P" | "R" | "PR" | "missed" =
      pair?.performed === null
        ? "missed"
        : evaluation.marker === ""
          ? "OK"
          : evaluation.marker;

    return {
      expectedIndex: index,
      performedIndex: pair?.performedIndex ?? null,
      onsetDeltaMs:
        typeof evaluation.matchedPerformedOnsetMs === "number"
          ? evaluation.matchedPerformedOnsetMs - evaluation.expectedOnsetMs
          : null,
      pitchDeltaCents:
        typeof evaluation.expectedPitchHz === "number" &&
        typeof evaluation.matchedPerformedPitch === "number"
          ? centsDifference(
              evaluation.expectedPitchHz,
              evaluation.matchedPerformedPitch,
            )
          : null,
      label,
    };
  });

  const unmatchedPerformedIndices = normalizedPerformed
    .map((_, index) => index)
    .filter((index) => !usedPerformedIndices.has(index));

  if (DEBUG_MEASURE_ALIGNMENT) {
    console.log("[measure-eval] unmatched performed indices", unmatchedPerformedIndices);
  }

  return {
    evaluations,
    debug: {
      selectionKey,
      rhythmToleranceMs,
      likelyCause: deriveLikelyCause({
        expectedCount: normalizedExpected.length,
        performedCount: normalizedPerformed.length,
        matches,
      }),
      expectedNotes: normalizedExpected,
      performedNotes: normalizedPerformed,
      matches,
      unmatchedPerformedIndices,
    },
  };
}

function matchPerformedToExpected({
  expectedNotes,
  performedNotes,
  rhythmToleranceMs,
}: {
  expectedNotes: MeasureExpectedNote[];
  performedNotes: MeasurePerformedNote[];
  rhythmToleranceMs: number;
}): Array<{ performedIndex: number; performed: MeasurePerformedNote } | null> {
  if (!expectedNotes.length) return [];
  if (!performedNotes.length) return expectedNotes.map(() => null);

  const firstAnchorIndex = findFirstAnchorIndex(performedNotes, rhythmToleranceMs);
  const pairs: Array<{ performedIndex: number; performed: MeasurePerformedNote } | null> =
    [];
  let cursor = firstAnchorIndex;

  for (let expectedIndex = 0; expectedIndex < expectedNotes.length; expectedIndex += 1) {
    if (cursor >= performedNotes.length) {
      pairs.push(null);
      continue;
    }

    const expected = expectedNotes[expectedIndex];
    const lookaheadEnd = Math.min(performedNotes.length, cursor + 4);
    const plausibleWindowMs = Math.max(260, rhythmToleranceMs * 2.5);

    let bestIndex = -1;
    let bestAbsDelta = Number.POSITIVE_INFINITY;

    for (let candidateIndex = cursor; candidateIndex < lookaheadEnd; candidateIndex += 1) {
      const candidate = performedNotes[candidateIndex];
      const deltaMs = candidate.onsetMs - expected.expectedOnsetMs;
      const absDeltaMs = Math.abs(deltaMs);
      if (absDeltaMs > plausibleWindowMs) continue;

      if (absDeltaMs < bestAbsDelta) {
        bestAbsDelta = absDeltaMs;
        bestIndex = candidateIndex;
      }
    }

    if (bestIndex < 0) {
      // Fall back to strict sequential matching when no plausible event appears.
      bestIndex = cursor;
      bestAbsDelta = Math.abs(
        performedNotes[bestIndex].onsetMs - expected.expectedOnsetMs,
      );
    }

    const matched = performedNotes[bestIndex];
    if (DEBUG_MEASURE_ALIGNMENT) {
      console.log("[measure-eval] pair", {
        expectedIndex,
        expectedOnsetMs: expected.expectedOnsetMs,
        performedIndex: bestIndex,
        performedOnsetMs: matched?.onsetMs ?? null,
        onsetDeltaMs:
          typeof matched?.onsetMs === "number"
            ? matched.onsetMs - expected.expectedOnsetMs
            : null,
        pitchDeltaCents:
          typeof expected.expectedPitchHz === "number" &&
          typeof matched?.stablePitchHz === "number"
            ? centsDifference(expected.expectedPitchHz, matched.stablePitchHz)
            : null,
        nearestAbsDeltaMs: bestAbsDelta,
      });
    }

    pairs.push(matched ? { performedIndex: bestIndex, performed: matched } : null);
    cursor = bestIndex + 1;
  }

  return pairs;
}

function findFirstAnchorIndex(
  performedNotes: MeasurePerformedNote[],
  rhythmToleranceMs: number,
): number {
  const firstWindowMs = Math.max(260, rhythmToleranceMs * 1.8);

  let anchoredIndex = -1;
  let bestAbs = Number.POSITIVE_INFINITY;
  for (let index = 0; index < performedNotes.length; index += 1) {
    const note = performedNotes[index];
    const absOnset = Math.abs(note.onsetMs);
    if (absOnset > firstWindowMs) continue;
    if (absOnset < bestAbs) {
      bestAbs = absOnset;
      anchoredIndex = index;
    }
  }

  return anchoredIndex >= 0 ? anchoredIndex : 0;
}

function getMarker(pitchCorrect: boolean, rhythmCorrect: boolean): PitchRhythmMarker {
  if (pitchCorrect && rhythmCorrect) return "";
  if (!pitchCorrect && rhythmCorrect) return "P";
  if (pitchCorrect && !rhythmCorrect) return "R";
  return "PR";
}

function deriveLikelyCause({
  expectedCount,
  performedCount,
  matches,
}: {
  expectedCount: number;
  performedCount: number;
  matches: Array<{
    expectedIndex: number;
    performedIndex: number | null;
    onsetDeltaMs: number | null;
    pitchDeltaCents: number | null;
    label: "OK" | "P" | "R" | "PR" | "missed";
  }>;
}): string {
  if (expectedCount > 1 && performedCount <= 1) {
    return "Only one performed event survived segmentation; likely note-boundary collapse.";
  }

  const missedAfterFirst = matches.filter(
    (match) => match.expectedIndex > 0 && match.label === "missed",
  ).length;
  if (missedAfterFirst >= Math.max(1, expectedCount - 2)) {
    return "Matcher is running out of performed events after the first note.";
  }

  const onsetErrors = matches
    .map((match) => match.onsetDeltaMs)
    .filter((value): value is number => typeof value === "number")
    .map((value) => Math.abs(value));
  if (onsetErrors.length > 1) {
    const largeErrors = onsetErrors.filter((value) => value > 220).length;
    if (largeErrors >= Math.ceil(onsetErrors.length * 0.6)) {
      return "Performed timing is consistently offset; check entrance timing and tolerance.";
    }
  }

  return "No single dominant failure mode. Inspect per-note match rows.";
}
