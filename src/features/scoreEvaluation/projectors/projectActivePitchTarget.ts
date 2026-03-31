import type { ActiveTargetProjection } from "../../tatSandbox/projections/projectActiveTarget";

export type ActivePitchTargetProjection = {
  tatNodeId: string;
  targetType: "note" | "rest";
  pitchText: string | null;
  targetHz: number | null;
  goalText: "Pitch Match" | "Silence";
};

export function projectActivePitchTarget(
  activeTarget: ActiveTargetProjection | null | undefined,
): ActivePitchTargetProjection | null {
  const target = activeTarget?.target;
  if (!target || (target.kind !== "note" && target.kind !== "rest")) return null;

  if (target.kind === "rest") {
    return {
      tatNodeId: target.id,
      targetType: "rest",
      pitchText: null,
      targetHz: null,
      goalText: "Silence",
    };
  }

  const pitchText = target.expected.pitch;
  if (!pitchText) return null;

  const targetHz = pitchTextToHz(pitchText);
  if (!targetHz) return null;

  return {
    tatNodeId: target.id,
    targetType: "note",
    pitchText,
    targetHz,
    goalText: "Pitch Match",
  };
}

function pitchTextToHz(pitchText: string): number | null {
  const match = pitchText.trim().match(/^([A-Ga-g])(#{1,2}|b{1,2})?(-?\d+)$/);
  if (!match) return null;

  const [, rawStep, rawAccidental = "", rawOctave] = match;

  const stepOffsets: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };

  const step = rawStep.toUpperCase();
  const baseSemitone = stepOffsets[step];
  if (baseSemitone === undefined) return null;

  const octave = Number.parseInt(rawOctave, 10);
  if (Number.isNaN(octave)) return null;

  const accidentalOffset =
    rawAccidental === "#"
      ? 1
      : rawAccidental === "##"
        ? 2
        : rawAccidental === "b"
          ? -1
          : rawAccidental === "bb"
            ? -2
            : 0;

  const midi = (octave + 1) * 12 + baseSemitone + accidentalOffset;
  return 440 * 2 ** ((midi - 69) / 12);
}
