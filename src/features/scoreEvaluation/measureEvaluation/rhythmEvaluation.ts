import {
  RHYTHM_DURATION_TOLERANCE_BEAT_RATIO,
  RHYTHM_DURATION_TOLERANCE_MAX_MS,
  RHYTHM_ONSET_TOLERANCE_BEAT_RATIO,
  RHYTHM_ONSET_TOLERANCE_MAX_MS,
} from "./rhythmConfig";

export function getRhythmToleranceMs(beatDurationMs?: number | null): number {
  if (!Number.isFinite(beatDurationMs) || (beatDurationMs ?? 0) <= 0) {
    return RHYTHM_ONSET_TOLERANCE_MAX_MS;
  }

  return Math.min(
    RHYTHM_ONSET_TOLERANCE_MAX_MS,
    (beatDurationMs ?? 0) * RHYTHM_ONSET_TOLERANCE_BEAT_RATIO,
  );
}

export function getRhythmDurationToleranceMs(beatDurationMs?: number | null): number {
  if (!Number.isFinite(beatDurationMs) || (beatDurationMs ?? 0) <= 0) {
    return RHYTHM_DURATION_TOLERANCE_MAX_MS;
  }

  return Math.min(
    RHYTHM_DURATION_TOLERANCE_MAX_MS,
    (beatDurationMs ?? 0) * RHYTHM_DURATION_TOLERANCE_BEAT_RATIO,
  );
}

export function isRhythmCorrect(
  expectedOnsetMs: number,
  detectedOnsetMs: number | null,
  beatDurationMs?: number | null,
): boolean {
  if (!Number.isFinite(detectedOnsetMs)) return false;
  const toleranceMs = getRhythmToleranceMs(beatDurationMs);
  return Math.abs((detectedOnsetMs ?? 0) - expectedOnsetMs) <= toleranceMs;
}
