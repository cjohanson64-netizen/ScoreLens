import type { ActivePitchTargetProjection } from "./projectors/projectActivePitchTarget";
import {
  evaluateSelectedPitch,
  type PitchEvaluationResult,
} from "./evaluateSelectedPitch";
import {
  evaluateRestSilence,
  type RestSilenceSnapshot,
} from "./evaluateRestSilence";

type EvaluateActiveTargetInput = {
  activeTarget: ActivePitchTargetProjection | null;
  isListening: boolean;
  detectedHz?: number | null;
  toleranceCents?: number;
  restSnapshot?: RestSilenceSnapshot | null;
  restMinWindowMs?: number;
};

export function evaluateActiveTarget({
  activeTarget,
  isListening,
  detectedHz,
  toleranceCents,
  restSnapshot,
  restMinWindowMs,
}: EvaluateActiveTargetInput): PitchEvaluationResult {
  if (!activeTarget) {
    return evaluateSelectedPitch({
      targetHz: 0,
      detectedHz,
      isListening: false,
      toleranceCents,
    });
  }

  if (activeTarget.targetType === "rest") {
    return evaluateRestSilence({
      isListening,
      snapshot:
        restSnapshot ?? {
          windowMs: 0,
          sampleCount: 0,
          quietFrameRatio: 0,
          stablePitchDetected: false,
          latestDetectedHz: null,
        },
      minWindowMs: restMinWindowMs,
    });
  }

  return evaluateSelectedPitch({
    targetHz: activeTarget.targetHz ?? 0,
    detectedHz,
    isListening,
    toleranceCents,
  });
}
