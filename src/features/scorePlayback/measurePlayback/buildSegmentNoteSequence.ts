import type { PlaybackTimelineProjection } from "../projectors/projectPlaybackTimeline.ts";
import { ticksToMilliseconds } from "../constants/timing.ts";
import { parsePitchText } from "../pitch/pitchUtils.ts";
import type { PitchNote } from "../pitch/pitchUtils.ts";

export type SegmentSelection = {
  partId: string;
  startMeasureNumber: number;
  endMeasureNumber: number;
};

export type SegmentPlayableNote = {
  nodeId: string;
  pitch: PitchNote;
  durationMs: number;
  onsetTicks: number;
  measureNumber: number;
};

type BuildSegmentNoteSequenceOptions = {
  timeline: PlaybackTimelineProjection;
  selection: SegmentSelection;
  bpm: number;
  activeNoteIds?: readonly string[];
  defaultDurationMs?: number;
  minDurationMs?: number;
};

const DEFAULT_DURATION_MS = 340;
const MIN_DURATION_MS = 120;

export function buildSegmentNoteSequence({
  timeline,
  selection,
  bpm,
  activeNoteIds,
  defaultDurationMs = DEFAULT_DURATION_MS,
  minDurationMs = MIN_DURATION_MS,
}: BuildSegmentNoteSequenceOptions): SegmentPlayableNote[] {
  const startMeasure = Math.min(selection.startMeasureNumber, selection.endMeasureNumber);
  const endMeasure = Math.max(selection.startMeasureNumber, selection.endMeasureNumber);
  const activeNoteIdSet =
    Array.isArray(activeNoteIds) && activeNoteIds.length > 0
      ? new Set(activeNoteIds)
      : null;

  return timeline.events
    .filter((event) => event.kind === "note")
    .filter(
      (event) =>
        activeNoteIdSet
          ? activeNoteIdSet.has(event.nodeId)
          : (
              event.partId === selection.partId &&
              event.measureNumber >= startMeasure &&
              event.measureNumber <= endMeasure
            ),
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
        measureNumber: event.measureNumber,
      } satisfies SegmentPlayableNote;
    })
    .filter((item): item is SegmentPlayableNote => item !== null)
    .sort((a, b) => {
      if (a.onsetTicks !== b.onsetTicks) return a.onsetTicks - b.onsetTicks;
      return a.nodeId.localeCompare(b.nodeId, undefined, { numeric: true });
    });
}
