import type { NotePlayer } from "./createNotePlayer";
import type { MeasurePlayableNote } from "../measurePlayback/buildMeasureNoteSequence";

type PlayNoteSequenceOptions = {
  overlapRatio?: number;
  minStepMs?: number;
};

const DEFAULT_OVERLAP_RATIO = 0.9;
const DEFAULT_MIN_STEP_MS = 80;

export async function playNoteSequence(
  notePlayer: Pick<NotePlayer, "prepare" | "playNote">,
  notes: MeasurePlayableNote[],
  options: PlayNoteSequenceOptions = {},
): Promise<void> {
  if (!notes.length) return;

  const overlapRatio = options.overlapRatio ?? DEFAULT_OVERLAP_RATIO;
  const minStepMs = options.minStepMs ?? DEFAULT_MIN_STEP_MS;

  await notePlayer.prepare();

  for (const note of notes) {
    await notePlayer.playNote(note.pitch, { durationMs: note.durationMs });

    const nextDelay = Math.max(
      minStepMs,
      Math.round(note.durationMs * overlapRatio),
    );
    await delay(nextDelay);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, milliseconds));
  });
}
