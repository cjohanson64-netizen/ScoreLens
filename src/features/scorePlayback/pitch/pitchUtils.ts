export type PitchNote = {
  step: string;
  alter?: number;
  octave: number;
};

export type ParsedPitchData = {
  step: string;
  alter?: number | null;
  octave: number | string;
};

const STEP_TO_SEMITONE: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

export function parsePitchText(pitchText: string): PitchNote | null {
  const match = pitchText.trim().match(/^([A-Ga-g])(#{1,2}|b{1,2})?(-?\d+)$/);
  if (!match) return null;

  const [, rawStep, accidental, rawOctave] = match;
  const step = rawStep.toUpperCase();
  const octave = Number.parseInt(rawOctave, 10);

  if (!Number.isFinite(octave)) return null;

  let alter = 0;
  if (accidental) {
    for (const char of accidental) {
      alter += char === "#" ? 1 : -1;
    }
  }

  return {
    step,
    ...(alter !== 0 ? { alter } : {}),
    octave,
  };
}

export function parsedPitchToNote(parsedPitch: ParsedPitchData | null | undefined): PitchNote | null {
  if (!parsedPitch || typeof parsedPitch !== "object") return null;

  const step = String(parsedPitch.step ?? "").trim().toUpperCase();
  if (!/^[A-G]$/.test(step)) return null;

  const octave = Number.parseInt(String(parsedPitch.octave), 10);
  if (!Number.isFinite(octave)) return null;

  const rawAlter = parsedPitch.alter;
  const alter = Number.isFinite(rawAlter) ? Number(rawAlter) : 0;

  return {
    step,
    ...(alter !== 0 ? { alter } : {}),
    octave,
  };
}

export function pitchToMidi(pitch: PitchNote): number | null {
  const step = String(pitch.step ?? "").toUpperCase();
  const baseSemitone = STEP_TO_SEMITONE[step];
  if (baseSemitone === undefined) return null;

  const octave = Number.parseInt(String(pitch.octave), 10);
  if (!Number.isFinite(octave)) return null;

  const alter = Number.isFinite(pitch.alter) ? Number(pitch.alter) : 0;
  return (octave + 1) * 12 + baseSemitone + alter;
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function pitchToFrequency(pitch: PitchNote): number | null {
  const midi = pitchToMidi(pitch);
  if (midi === null) return null;
  return midiToFrequency(midi);
}
