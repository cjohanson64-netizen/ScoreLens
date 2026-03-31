import type { SegmentPlaybackEvent } from "./buildSegmentPlaybackEvents";

type RunMeasureEventTimelineOptions = {
  events: SegmentPlaybackEvent[];
  startTimeMs?: number;
  isCancelled?: () => boolean;
  onEventStart?: (event: SegmentPlaybackEvent) => Promise<void> | void;
  onComplete?: () => Promise<void> | void;
};

export async function runMeasureEventTimeline({
  events,
  startTimeMs = performance.now(),
  isCancelled = () => false,
  onEventStart,
  onComplete,
}: RunMeasureEventTimelineOptions): Promise<void> {
  if (!events.length) return;

  for (const event of events) {
    await waitUntilTime(startTimeMs + event.startMs, isCancelled);
    if (isCancelled()) return;
    await onEventStart?.(event);
    if (isCancelled()) return;
  }

  const totalDurationMs = events.reduce(
    (maxDuration, event) =>
      Math.max(maxDuration, event.startMs + event.durationMs),
    0,
  );
  await waitUntilTime(startTimeMs + totalDurationMs, isCancelled);
  if (isCancelled()) return;

  await onComplete?.();
}

async function waitUntilTime(
  targetTimeMs: number,
  isCancelled: () => boolean,
): Promise<void> {
  while (!isCancelled()) {
    const remainingMs = targetTimeMs - performance.now();
    if (remainingMs <= 1) return;
    await delay(Math.min(remainingMs, 24));
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, milliseconds));
  });
}
