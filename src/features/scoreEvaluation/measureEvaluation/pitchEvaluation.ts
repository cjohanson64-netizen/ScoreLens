export function centsDifference(expectedHz: number, detectedHz: number): number {
  if (!Number.isFinite(expectedHz) || !Number.isFinite(detectedHz)) {
    return Number.POSITIVE_INFINITY;
  }
  if (expectedHz <= 0 || detectedHz <= 0) return Number.POSITIVE_INFINITY;
  return 1200 * Math.log2(detectedHz / expectedHz);
}

export function isPitchCorrect(
  expectedHz: number | null,
  detectedHz: number | null,
  toleranceCents: number = 50,
): boolean {
  if (typeof expectedHz !== "number" || typeof detectedHz !== "number") return false;
  if (!Number.isFinite(expectedHz) || !Number.isFinite(detectedHz)) return false;
  return Math.abs(centsDifference(expectedHz, detectedHz)) <= toleranceCents;
}

export function medianFrequency(values: number[]): number | null {
  if (!values.length) return null;

  const sorted = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (!sorted.length) return null;

  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}
