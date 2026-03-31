export type ScoreSourceRef = {
  partId: string;
  measureNumber: number;
  voice: string;
  eventIndex: number;
  chordIndex?: number;
};

export type CanonicalNoteIdentity = {
  tatNodeId: string;
  sourceRef: ScoreSourceRef;
  sourceKey: string;
};

export function makeScoreSourceKey(ref: ScoreSourceRef): string {
  const base = `${ref.partId}|m${ref.measureNumber}|v${ref.voice}|e${ref.eventIndex}`;
  return typeof ref.chordIndex === "number" ? `${base}|c${ref.chordIndex}` : base;
}

export function normalizeScoreSourceRef(
  value: Partial<ScoreSourceRef> & Pick<ScoreSourceRef, "partId" | "measureNumber">
): ScoreSourceRef {
  return {
    partId: value.partId,
    measureNumber: value.measureNumber,
    voice: value.voice ?? "1",
    eventIndex: value.eventIndex ?? 1,
    ...(typeof value.chordIndex === "number" ? { chordIndex: value.chordIndex } : {}),
  };
}

export function createCanonicalNoteIdentity(
  tatNodeId: string,
  ref: ScoreSourceRef
): CanonicalNoteIdentity {
  return {
    tatNodeId,
    sourceRef: ref,
    sourceKey: makeScoreSourceKey(ref),
  };
}

export function isScoreSourceRef(value: unknown): value is ScoreSourceRef {
  if (!isRecord(value)) return false;

  if (typeof value.partId !== "string") return false;
  if (typeof value.measureNumber !== "number") return false;
  if (typeof value.voice !== "string") return false;
  if (typeof value.eventIndex !== "number") return false;

  if (
    "chordIndex" in value &&
    value.chordIndex !== undefined &&
    typeof value.chordIndex !== "number"
  ) {
    return false;
  }

  return true;
}

export function parseScoreSourceKey(key: string): ScoreSourceRef | null {
  const match = key.match(
    /^([^|]+)\|m(-?\d+)\|v([^|]+)\|e(-?\d+)(?:\|c(-?\d+))?$/
  );

  if (!match) return null;

  const [, partId, measureNumberRaw, voice, eventIndexRaw, chordIndexRaw] = match;

  const measureNumber = Number.parseInt(measureNumberRaw, 10);
  const eventIndex = Number.parseInt(eventIndexRaw, 10);

  if (Number.isNaN(measureNumber) || Number.isNaN(eventIndex)) {
    return null;
  }

  const ref: ScoreSourceRef = {
    partId,
    measureNumber,
    voice,
    eventIndex,
  };

  if (typeof chordIndexRaw === "string") {
    const chordIndex = Number.parseInt(chordIndexRaw, 10);
    if (Number.isNaN(chordIndex)) return null;
    ref.chordIndex = chordIndex;
  }

  return ref;
}

export function sameScoreSourceRef(a: ScoreSourceRef, b: ScoreSourceRef): boolean {
  return (
    a.partId === b.partId &&
    a.measureNumber === b.measureNumber &&
    a.voice === b.voice &&
    a.eventIndex === b.eventIndex &&
    a.chordIndex === b.chordIndex
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}