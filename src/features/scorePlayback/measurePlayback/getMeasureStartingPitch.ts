import { pitchToFrequency } from "../pitch/pitchUtils";
import type { MeasurePlayableNote } from "./buildMeasureNoteSequence";

export function getMeasureStartingPitch(
  notes: MeasurePlayableNote[],
): { frequencyHz: number; noteId: string } | null {
  if (!Array.isArray(notes) || notes.length === 0) return null;

  for (const note of notes) {
    const frequencyHz = pitchToFrequency(note.pitch);
    if (typeof frequencyHz !== "number") continue;
    if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) continue;

    return {
      frequencyHz,
      noteId: note.nodeId,
    };
  }

  return null;
}
