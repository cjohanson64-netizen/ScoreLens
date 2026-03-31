// Rhythm tolerances are intentionally centralized so classroom tuning is easy.
// v1 evaluation currently uses onset timing; duration tolerance is defined for
// upcoming duration-aware checks.
export const RHYTHM_ONSET_TOLERANCE_MAX_MS = 200;
export const RHYTHM_ONSET_TOLERANCE_BEAT_RATIO = 0.4;

export const RHYTHM_DURATION_TOLERANCE_MAX_MS = 220;
export const RHYTHM_DURATION_TOLERANCE_BEAT_RATIO = 0.45;
