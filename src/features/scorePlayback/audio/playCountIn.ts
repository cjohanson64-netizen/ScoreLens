import type { NotePlayer } from "./createNotePlayer";

type PlayCountInOptions = {
  beatDurationMs?: number | null;
  beats?: number;
  beepDurationMs?: number;
  gain?: number;
  baseFrequencyHz?: number;
  finalFrequencyHz?: number;
};

const DEFAULT_BEAT_DURATION_MS = 500;
const DEFAULT_BEATS = 4;
const DEFAULT_BEEP_DURATION_MS = 80;
const DEFAULT_GAIN = 0.14;
const DEFAULT_BASE_FREQUENCY_HZ = 880;
const DEFAULT_FINAL_FREQUENCY_HZ = 1175;
const MIN_FINAL_CUE_SEPARATION_CENTS = 60;

export async function playCountIn(
  notePlayer: Pick<NotePlayer, "prepare" | "playFrequency">,
  options: PlayCountInOptions = {},
): Promise<void> {
  const beatDurationMs = getBeatDurationMs(options.beatDurationMs);
  const beats = Math.max(1, Math.round(options.beats ?? DEFAULT_BEATS));
  const beepDurationMs = Math.max(40, options.beepDurationMs ?? DEFAULT_BEEP_DURATION_MS);
  const gain = Math.max(0.03, options.gain ?? DEFAULT_GAIN);
  const baseFrequencyHz = options.baseFrequencyHz ?? DEFAULT_BASE_FREQUENCY_HZ;
  const finalFrequencyHz = resolveFinalCueFrequency(
    baseFrequencyHz,
    options.finalFrequencyHz ?? DEFAULT_FINAL_FREQUENCY_HZ,
  );

  await notePlayer.prepare();

  for (let beatIndex = 0; beatIndex < beats; beatIndex += 1) {
    const isFinalCue = beatIndex === beats - 1;
    await notePlayer.playFrequency(
      isFinalCue ? finalFrequencyHz : baseFrequencyHz,
      { durationMs: beepDurationMs, gain },
    );

    // Keep one beat boundary after every cue, including the final cue.
    await delay(beatDurationMs);
  }
}

function resolveFinalCueFrequency(baseFrequencyHz: number, candidateFrequencyHz: number): number {
  if (
    !Number.isFinite(baseFrequencyHz) ||
    !Number.isFinite(candidateFrequencyHz) ||
    baseFrequencyHz <= 0 ||
    candidateFrequencyHz <= 0
  ) {
    return DEFAULT_FINAL_FREQUENCY_HZ;
  }

  const centsApart = Math.abs(1200 * Math.log2(candidateFrequencyHz / baseFrequencyHz));
  if (centsApart >= MIN_FINAL_CUE_SEPARATION_CENTS) {
    return candidateFrequencyHz;
  }

  // Keep the final cue musically distinct if the measure starts near the default cue pitch.
  return baseFrequencyHz * 2 ** (7 / 12);
}

function getBeatDurationMs(value?: number | null): number {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) {
    return DEFAULT_BEAT_DURATION_MS;
  }

  return Math.max(120, value ?? DEFAULT_BEAT_DURATION_MS);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, milliseconds));
  });
}
