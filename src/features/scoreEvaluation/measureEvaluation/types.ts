export type PitchRhythmMarker = "" | "P" | "R" | "PR";

export type MeasureExpectedNote = {
  noteId: string;
  expectedMidi: number | null;
  expectedPitchHz: number | null;
  expectedOnsetMs: number;
  expectedDurationMs: number;
};

export type MeasurePerformedFrame = {
  timeMs: number;
  detectedHz: number | null;
  clarity: number;
  rmsDb: number;
  hasStablePitch: boolean;
  isQuiet: boolean;
};

export type MeasurePerformedNote = {
  onsetMs: number;
  stablePitchHz: number | null;
  sampleCount: number;
  noteDurationMs: number;
  avgClarity: number | null;
  avgRmsDb: number | null;
};

export type MeasureNoteEvaluation = {
  selectionKey: string;
  noteId: string;
  expectedMidi: number | null;
  expectedPitchHz: number | null;
  expectedOnsetMs: number;
  matchedPerformedPitch: number | null;
  matchedPerformedOnsetMs: number | null;
  pitchCorrect: boolean;
  rhythmCorrect: boolean;
  marker: PitchRhythmMarker;
};

export type MeasureEvaluationDebug = {
  selectionKey: string;
  rhythmToleranceMs: number;
  likelyCause: string;
  expectedNotes: MeasureExpectedNote[];
  performedNotes: MeasurePerformedNote[];
  matches: Array<{
    expectedIndex: number;
    performedIndex: number | null;
    onsetDeltaMs: number | null;
    pitchDeltaCents: number | null;
    label: "OK" | "P" | "R" | "PR" | "missed";
  }>;
  unmatchedPerformedIndices: number[];
};
