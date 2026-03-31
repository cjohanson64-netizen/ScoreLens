import type { PitchEvaluationResult } from "./evaluateSelectedPitch";

export type RestSilenceSnapshot = {
  windowMs: number;
  sampleCount: number;
  quietFrameRatio: number;
  quietRunMs?: number;
  stablePitchDetected: boolean;
  latestDetectedHz: number | null;
};

type EvaluateRestSilenceInput = {
  isListening: boolean;
  snapshot: RestSilenceSnapshot;
  minWindowMs?: number;
};

export function evaluateRestSilence({
  isListening,
  snapshot,
  minWindowMs = 500,
}: EvaluateRestSilenceInput): PitchEvaluationResult {
  if (!isListening) {
    return {
      targetHz: 0,
      detectedHz: snapshot.latestDetectedHz,
      centError: null,
      inTune: false,
      status: "idle",
    };
  }

  const quietRunMs = snapshot.quietRunMs ?? 0;
  if (snapshot.sampleCount === 0 || quietRunMs < minWindowMs) {
    return {
      targetHz: 0,
      detectedHz: snapshot.latestDetectedHz,
      centError: null,
      inTune: false,
      status: "listening",
    };
  }

  // A continuous quiet run of minWindowMs is sufficient evidence of silence.
  // The overall frame ratio is intentionally not checked here: during measure
  // mode auto-advance, non-quiet frames from the preceding note's decay are
  // present at the start of the fresh rest window and would otherwise prevent
  // the rest from ever evaluating as correct.
  const isSilent = quietRunMs >= minWindowMs;

  return {
    targetHz: 0,
    detectedHz: snapshot.latestDetectedHz,
    centError: null,
    inTune: isSilent,
    status: isSilent ? "correct" : "review",
  };
}
