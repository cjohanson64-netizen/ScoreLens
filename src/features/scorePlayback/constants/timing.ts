export const PLAYBACK_PPQ = 480;

export const DEFAULT_BPM = 72;
export const MIN_BPM = 20;
export const MAX_BPM = 320;

export function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return DEFAULT_BPM;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, bpm));
}

export function divisionsToTicks(
  divisions: number,
  divisionsPerQuarter: number,
  ppq: number = PLAYBACK_PPQ,
): number {
  if (!Number.isFinite(divisions) || !Number.isFinite(divisionsPerQuarter)) {
    return 0;
  }
  if (divisionsPerQuarter <= 0 || ppq <= 0) return 0;

  return Math.round((divisions / divisionsPerQuarter) * ppq);
}

export function ticksToMilliseconds(
  ticks: number,
  bpm: number,
  ppq: number = PLAYBACK_PPQ,
): number {
  if (!Number.isFinite(ticks) || !Number.isFinite(bpm) || ppq <= 0) {
    return 0;
  }

  const beats = ticks / ppq;
  const minutes = beats / clampBpm(bpm);
  return minutes * 60_000;
}

export function millisecondsToTicks(
  milliseconds: number,
  bpm: number,
  ppq: number = PLAYBACK_PPQ,
): number {
  if (!Number.isFinite(milliseconds) || !Number.isFinite(bpm) || ppq <= 0) {
    return 0;
  }

  const beatsPerMillisecond = clampBpm(bpm) / 60_000;
  return milliseconds * beatsPerMillisecond * ppq;
}
