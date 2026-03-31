import type { PlaybackTimelineProjection } from "../projectors/projectPlaybackTimeline";
import { ticksToMilliseconds } from "../constants/timing";
import { parsePitchText } from "../pitch/pitchUtils";
import type { PitchNote } from "../pitch/pitchUtils";

export type MeasureSelection = {
  partId: string;
  measureNumber: number;
};

export type MeasurePlayableNote = {
  nodeId: string;
  pitch: PitchNote;
  durationMs: number;
  onsetTicks: number;
};

type BuildMeasureNoteSequenceOptions = {
  timeline: PlaybackTimelineProjection;
  selection: MeasureSelection;
  bpm: number;
  defaultDurationMs?: number;
  minDurationMs?: number;
};

const DEFAULT_DURATION_MS = 340;
const MIN_DURATION_MS = 120;

export function buildMeasureNoteSequence({
  timeline,
  selection,
  bpm,
  defaultDurationMs = DEFAULT_DURATION_MS,
  minDurationMs = MIN_DURATION_MS,
}: BuildMeasureNoteSequenceOptions): MeasurePlayableNote[] {
  return timeline.events
    .filter((event) => event.kind === "note")
    .filter(
      (event) =>
        event.partId === selection.partId &&
        event.measureNumber === selection.measureNumber,
    )
    .map((event) => {
      const pitch = event.pitchText ? parsePitchText(event.pitchText) : null;
      if (!pitch) return null;

      const durationFromTicks = Math.round(
        ticksToMilliseconds(event.durationTicks, bpm, timeline.ppq),
      );

      return {
        nodeId: event.nodeId,
        pitch,
        durationMs: Math.max(
          minDurationMs,
          Number.isFinite(durationFromTicks) && durationFromTicks > 0
            ? durationFromTicks
            : defaultDurationMs,
        ),
        onsetTicks: event.onsetTicks,
      };
    })
    .filter((item): item is MeasurePlayableNote => item !== null)
    .sort((a, b) => {
      if (a.onsetTicks !== b.onsetTicks) return a.onsetTicks - b.onsetTicks;
      return a.nodeId.localeCompare(b.nodeId, undefined, { numeric: true });
    });
}
