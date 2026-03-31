export type PitchEvaluationStatus =
  | "idle"
  | "listening"
  | "no-pitch"
  | "correct"
  | "review";

export type PitchEvaluationResult = {
  targetHz: number;
  detectedHz: number | null;
  centError: number | null;
  inTune: boolean;
  status: PitchEvaluationStatus;
};

type EvaluateSelectedPitchInput = {
  targetHz: number;
  detectedHz?: number | null;
  isListening: boolean;
  toleranceCents?: number;
};

export function evaluateSelectedPitch({
  targetHz,
  detectedHz,
  isListening,
  toleranceCents = 25,
}: EvaluateSelectedPitchInput): PitchEvaluationResult {
  if (!isListening) {
    return {
      targetHz,
      detectedHz: detectedHz ?? null,
      centError: null,
      inTune: false,
      status: "idle",
    };
  }

  if (detectedHz === undefined) {
    return {
      targetHz,
      detectedHz: null,
      centError: null,
      inTune: false,
      status: "listening",
    };
  }

  if (!detectedHz || !Number.isFinite(detectedHz) || detectedHz <= 0) {
    return {
      targetHz,
      detectedHz: null,
      centError: null,
      inTune: false,
      status: "no-pitch",
    };
  }

  const centError = 1200 * Math.log2(detectedHz / targetHz);
  const inTune = Math.abs(centError) <= toleranceCents;

  return {
    targetHz,
    detectedHz,
    centError,
    inTune,
    status: inTune ? "correct" : "review",
  };
}
