import type { PlaybackTimelineProjection } from "../projectors/projectPlaybackTimeline.ts";
import { ticksToMilliseconds } from "../constants/timing.ts";
import { parsePitchText } from "../pitch/pitchUtils.ts";
import type { PitchNote } from "../pitch/pitchUtils.ts";
import type { SegmentSelection } from "./buildSegmentNoteSequence.ts";

export type SegmentPlaybackEvent = {
  eventId: string;
  kind: "note" | "rest";
  noteId: string | null;
  partId: string;
  voice: string;
  startMs: number;
  durationMs: number;
  startTicks: number;
  durationTicks: number;
  pitch: PitchNote | null;
  measureNumber: number;
  tieStop: boolean;
};

type BuildSegmentPlaybackEventsOptions = {
  timeline: PlaybackTimelineProjection;
  selection: SegmentSelection;
  bpm: number;
  activeEventIds?: readonly string[];
};

const MIN_EVENT_DURATION_MS = 40;

type BuildFullSongPlaybackEventsOptions = {
  timeline: PlaybackTimelineProjection;
  bpm: number;
};

export function buildFullSongPlaybackEvents({
  timeline,
  bpm,
}: BuildFullSongPlaybackEventsOptions): SegmentPlaybackEvent[] {
  const rawEvents = timeline.events
    .filter((event) => event.kind === "note" || event.kind === "rest")
    .sort((a, b) => {
      if (a.onsetTicks !== b.onsetTicks) return a.onsetTicks - b.onsetTicks;
      return a.nodeId.localeCompare(b.nodeId, undefined, { numeric: true });
    });

  if (!rawEvents.length) return [];

  const anchorTick = rawEvents[0].onsetTicks;
  const normalizedEvents = rawEvents.map((event) => {
    const pitch =
      event.kind === "note" && event.pitchText
        ? parsePitchText(event.pitchText)
        : null;
    const startMs = Math.max(
      0,
      ticksToMilliseconds(event.onsetTicks - anchorTick, bpm, timeline.ppq),
    );
    const durationMs = Math.max(
      MIN_EVENT_DURATION_MS,
      ticksToMilliseconds(event.durationTicks, bpm, timeline.ppq),
    );

    return {
      eventId: event.nodeId,
      kind: event.kind,
      noteId: event.kind === "note" && pitch ? event.nodeId : null,
      partId: event.partId,
      voice: event.voice,
      startMs,
      durationMs,
      startTicks: Math.max(0, event.onsetTicks - anchorTick),
      durationTicks: Math.max(0, event.durationTicks),
      pitch: event.kind === "note" ? pitch : null,
      measureNumber: event.measureNumber,
      tieStop: event.tieStop,
    } satisfies SegmentPlaybackEvent;
  });

  return mergeSustainedEvents(normalizedEvents);
}

export function buildSegmentPlaybackEvents({
  timeline,
  selection,
  bpm,
  activeEventIds,
}: BuildSegmentPlaybackEventsOptions): SegmentPlaybackEvent[] {
  const startMeasure = Math.min(selection.startMeasureNumber, selection.endMeasureNumber);
  const endMeasure = Math.max(selection.startMeasureNumber, selection.endMeasureNumber);
  const activeEventIdSet =
    Array.isArray(activeEventIds) && activeEventIds.length > 0
      ? new Set(activeEventIds)
      : null;

  const rawEvents = timeline.events
    .filter(
      (event) =>
        (
          activeEventIdSet
            ? activeEventIdSet.has(event.nodeId)
            : (
                event.partId === selection.partId &&
                event.measureNumber >= startMeasure &&
                event.measureNumber <= endMeasure
              )
        ) &&
        (event.kind === "note" || event.kind === "rest"),
    )
    .sort((a, b) => {
      if (a.onsetTicks !== b.onsetTicks) return a.onsetTicks - b.onsetTicks;
      return a.nodeId.localeCompare(b.nodeId, undefined, { numeric: true });
    });

  if (!rawEvents.length) return [];

  const anchorTick = rawEvents[0].onsetTicks;
  const normalizedEvents = rawEvents.map((event) => {
    const pitch = event.kind === "note" && event.pitchText
      ? parsePitchText(event.pitchText)
      : null;
    const startMs = Math.max(
      0,
      ticksToMilliseconds(event.onsetTicks - anchorTick, bpm, timeline.ppq),
    );
    const durationMs = Math.max(
      MIN_EVENT_DURATION_MS,
      ticksToMilliseconds(event.durationTicks, bpm, timeline.ppq),
    );

    return {
      eventId: event.nodeId,
      kind: event.kind,
      noteId: event.kind === "note" && pitch ? event.nodeId : null,
      partId: event.partId,
      voice: event.voice,
      startMs,
      durationMs,
      startTicks: Math.max(0, event.onsetTicks - anchorTick),
      durationTicks: Math.max(0, event.durationTicks),
      pitch: event.kind === "note" ? pitch : null,
      measureNumber: event.measureNumber,
      tieStop: event.tieStop,
    } satisfies SegmentPlaybackEvent;
  });

  return mergeSustainedEvents(normalizedEvents);
}

function mergeSustainedEvents(events: SegmentPlaybackEvent[]): SegmentPlaybackEvent[] {
  if (!events.length) return [];

  const merged: SegmentPlaybackEvent[] = [events[0]];

  for (let index = 1; index < events.length; index += 1) {
    const current = events[index];
    const previous = merged[merged.length - 1];

    if (
      current.tieStop &&
      current.kind === "note" &&
      current.pitch &&
      previous.kind === "note" &&
      previous.pitch &&
      isSamePitch(previous.pitch, current.pitch)
    ) {
      previous.durationMs = Math.max(
        previous.durationMs,
        current.startMs + current.durationMs - previous.startMs,
      );
      previous.durationTicks = Math.max(
        previous.durationTicks,
        current.startTicks + current.durationTicks - previous.startTicks,
      );
      continue;
    }

    if (current.tieStop && current.kind === "note" && current.pitch) {
      const tieSource = findTieSourceEvent(merged, current);
      if (tieSource) {
        tieSource.durationMs = Math.max(
          tieSource.durationMs,
          current.startMs + current.durationMs - tieSource.startMs,
        );
        tieSource.durationTicks = Math.max(
          tieSource.durationTicks,
          current.startTicks + current.durationTicks - tieSource.startTicks,
        );
        continue;
      }
    }

    merged.push(current);
  }

  return merged;
}

function findTieSourceEvent(
  merged: SegmentPlaybackEvent[],
  current: SegmentPlaybackEvent,
): SegmentPlaybackEvent | null {
  for (let index = merged.length - 1; index >= 0; index -= 1) {
    const candidate = merged[index];
    if (
      candidate.kind !== "note" ||
      !candidate.pitch ||
      candidate.partId !== current.partId ||
      candidate.voice !== current.voice ||
      !isSamePitch(candidate.pitch, current.pitch)
    ) {
      continue;
    }

    const candidateEndTicks = candidate.startTicks + candidate.durationTicks;
    if (candidateEndTicks === current.startTicks) {
      return candidate;
    }
  }

  return null;
}

function isSamePitch(a: PitchNote, b: PitchNote): boolean {
  return (
    a.step === b.step &&
    (a.alter ?? 0) === (b.alter ?? 0) &&
    a.octave === b.octave
  );
}
