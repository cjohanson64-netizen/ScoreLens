import type { Graph, GraphNode, GraphValue } from "@core/tat/runtime/graph";
import { PLAYBACK_PPQ, divisionsToTicks } from "../constants/timing";

export type PlaybackTimelineEvent = {
  nodeId: string;
  kind: "note" | "rest";
  sourceKey: string | null;
  partId: string;
  measureNumber: number;
  voice: string;
  eventIndex: number;
  onsetDivision: number;
  durationDivision: number;
  onsetTicks: number;
  durationTicks: number;
  endTicks: number;
  measureStartTicks: number;
  divisionsPerQuarter: number;
  pitchText: string | null;
  tieStop: boolean;
};

export type PlaybackTimelineMeasure = {
  nodeId: string;
  partId: string;
  measureNumber: number;
  measureStartTicks: number;
  measureDurationTicks: number;
  measureEndTicks: number;
  divisionsPerQuarter: number;
  beats?: number;
  beatType?: number;
  beatTicks?: number;
};

export type PlaybackTimelineProjection = {
  ppq: number;
  events: PlaybackTimelineEvent[];
  measures: PlaybackTimelineMeasure[];
  totalDurationTicks: number;
};

export function projectPlaybackTimeline(graph: Graph): PlaybackTimelineProjection {
  const measureByPartAndNumber = buildMeasureIndex(graph);

  const events = Array.from(graph.nodes.values())
    .filter((node) => {
      const kind = asString(getRecordValue(node.value, "kind"));
      return kind === "note" || kind === "rest";
    })
    .map((node) => projectEventNode(node, measureByPartAndNumber))
    .filter((event): event is PlaybackTimelineEvent => event !== null)
    .sort(comparePlaybackEvents);

  const measures = Array.from(measureByPartAndNumber.values())
    .map((entry) => entry.measure)
    .sort(comparePlaybackMeasures);

  const totalDurationTicks =
    events.length > 0
      ? Math.max(...events.map((event) => event.endTicks))
      : measures.length > 0
        ? Math.max(...measures.map((measure) => measure.measureEndTicks))
        : 0;

  return {
    ppq: PLAYBACK_PPQ,
    events,
    measures,
    totalDurationTicks,
  };
}

export function findPlaybackEventIndexAtTick(
  timeline: PlaybackTimelineProjection,
  tick: number,
): number {
  if (timeline.events.length === 0) return -1;

  const targetTick = Number.isFinite(tick) ? tick : 0;
  let left = 0;
  let right = timeline.events.length - 1;
  let answer = -1;

  while (left <= right) {
    const mid = (left + right) >> 1;
    const event = timeline.events[mid];

    if (event.onsetTicks <= targetTick) {
      answer = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return answer;
}

export function findPlaybackEventAtTick(
  timeline: PlaybackTimelineProjection,
  tick: number,
): PlaybackTimelineEvent | null {
  const index = findPlaybackEventIndexAtTick(timeline, tick);
  if (index < 0) return null;
  return timeline.events[index] ?? null;
}

export function findPlaybackEventsAtTick(
  timeline: PlaybackTimelineProjection,
  tick: number,
): PlaybackTimelineEvent[] {
  if (timeline.events.length === 0) return [];

  const targetTick = Number.isFinite(tick) ? Math.max(0, tick) : 0;
  return timeline.events.filter(
    (event) => event.onsetTicks <= targetTick && targetTick < event.endTicks,
  );
}

export function findPlaybackMeasuresAtTick(
  timeline: PlaybackTimelineProjection,
  tick: number,
): PlaybackTimelineMeasure[] {
  if (timeline.measures.length === 0) return [];

  const targetTick = Number.isFinite(tick) ? Math.max(0, tick) : 0;
  return timeline.measures.filter(
    (measure) =>
      measure.measureStartTicks <= targetTick &&
      targetTick < measure.measureEndTicks,
  );
}

function buildMeasureIndex(graph: Graph):
  Map<string, { measure: PlaybackTimelineMeasure; node: GraphNode }> {
  const map = new Map<string, { measure: PlaybackTimelineMeasure; node: GraphNode }>();

  for (const node of graph.nodes.values()) {
    if (asString(getRecordValue(node.value, "kind")) !== "measure") continue;

    const partId =
      asString(getRecordValue(node.value, "partId")) ??
      asString(getRecordValue(node.meta, "partId"));
    const measureNumber =
      asNumberLike(getRecordValue(node.value, "number")) ??
      asNumberLike(getRecordValue(node.value, "measureNumber"));

    if (!partId || measureNumber === null) continue;

    const measureStartTicks = asNumberLike(getRecordValue(node.meta, "measureStartTicks")) ?? 0;
    const measureDurationTicks =
      asNumberLike(getRecordValue(node.meta, "measureDurationTicks")) ?? 0;
    const divisionsPerQuarter =
      asNumberLike(getRecordValue(node.meta, "divisionsPerQuarter")) ?? 1;

    const meter = asRecord(getRecordValue(node.meta, "meter"));
    const beats = asNumberLike(meter?.beats);
    const beatType = asNumberLike(meter?.beatType);
    const beatDivisionDuration =
      typeof beatType === "number" && beatType > 0
        ? (4 / beatType) * divisionsPerQuarter
        : null;
    const beatTicks =
      typeof beatDivisionDuration === "number" && Number.isFinite(beatDivisionDuration)
        ? divisionsToTicks(beatDivisionDuration, divisionsPerQuarter, PLAYBACK_PPQ)
        : null;

    const measure: PlaybackTimelineMeasure = {
      nodeId: node.id,
      partId,
      measureNumber,
      measureStartTicks,
      measureDurationTicks,
      measureEndTicks: measureStartTicks + measureDurationTicks,
      divisionsPerQuarter,
      ...(typeof beats === "number" ? { beats } : {}),
      ...(typeof beatType === "number" ? { beatType } : {}),
      ...(typeof beatTicks === "number" ? { beatTicks } : {}),
    };

    map.set(makeMeasureKey(partId, measureNumber), { measure, node });
  }

  return map;
}

function projectEventNode(
  node: GraphNode,
  measureByPartAndNumber: Map<string, { measure: PlaybackTimelineMeasure; node: GraphNode }>,
): PlaybackTimelineEvent | null {
  const kind = asString(getRecordValue(node.value, "kind"));
  if (kind !== "note" && kind !== "rest") return null;

  const sourceRef = asRecord(getRecordValue(node.meta, "sourceRef"));

  const partId =
    asString(getRecordValue(node.value, "partId")) ??
    asString(sourceRef?.partId);
  const measureNumber =
    asNumberLike(getRecordValue(node.value, "measureNumber")) ??
    asNumberLike(sourceRef?.measureNumber);
  const voice =
    asString(getRecordValue(node.value, "voice")) ??
    asString(sourceRef?.voice) ??
    "1";
  const eventIndex = asNumberLike(sourceRef?.eventIndex) ?? 0;

  if (!partId || measureNumber === null) return null;

  const measureEntry = measureByPartAndNumber.get(makeMeasureKey(partId, measureNumber));
  const measureStartTicks =
    asNumberLike(getRecordValue(node.meta, "measureStartTicks")) ??
    measureEntry?.measure.measureStartTicks ??
    0;

  const divisionsPerQuarter =
    asNumberLike(getRecordValue(node.meta, "divisionsPerQuarter")) ??
    measureEntry?.measure.divisionsPerQuarter ??
    1;

  const onsetDivision = asNumberLike(getRecordValue(node.meta, "onsetDivision")) ?? 0;
  const durationDivision = asNumberLike(getRecordValue(node.meta, "durationDivision")) ?? 0;

  const onsetTicks =
    asNumberLike(getRecordValue(node.meta, "onsetTicks")) ??
    measureStartTicks + divisionsToTicks(onsetDivision, divisionsPerQuarter, PLAYBACK_PPQ);

  const durationTicks =
    asNumberLike(getRecordValue(node.meta, "durationTicks")) ??
    divisionsToTicks(durationDivision, divisionsPerQuarter, PLAYBACK_PPQ);

  return {
    nodeId: node.id,
    kind,
    sourceKey: asString(getRecordValue(node.meta, "sourceKey")),
    partId,
    measureNumber,
    voice,
    eventIndex,
    onsetDivision,
    durationDivision,
    onsetTicks,
    durationTicks,
    endTicks: onsetTicks + durationTicks,
    measureStartTicks,
    divisionsPerQuarter,
    pitchText: asString(getRecordValue(node.meta, "pitchText")),
    tieStop: getRecordValue(node.meta, "tieStop") === true,
  };
}

function makeMeasureKey(partId: string, measureNumber: number): string {
  return `${partId}::${measureNumber}`;
}

function comparePlaybackEvents(a: PlaybackTimelineEvent, b: PlaybackTimelineEvent): number {
  if (a.onsetTicks !== b.onsetTicks) return a.onsetTicks - b.onsetTicks;

  const partCompare = a.partId.localeCompare(b.partId, undefined, { numeric: true });
  if (partCompare !== 0) return partCompare;

  if (a.measureNumber !== b.measureNumber) return a.measureNumber - b.measureNumber;

  const voiceCompare = a.voice.localeCompare(b.voice, undefined, { numeric: true });
  if (voiceCompare !== 0) return voiceCompare;

  if (a.eventIndex !== b.eventIndex) return a.eventIndex - b.eventIndex;

  return a.nodeId.localeCompare(b.nodeId, undefined, { numeric: true });
}

function comparePlaybackMeasures(
  a: PlaybackTimelineMeasure,
  b: PlaybackTimelineMeasure,
): number {
  const partCompare = a.partId.localeCompare(b.partId, undefined, { numeric: true });
  if (partCompare !== 0) return partCompare;

  if (a.measureStartTicks !== b.measureStartTicks) {
    return a.measureStartTicks - b.measureStartTicks;
  }

  return a.measureNumber - b.measureNumber;
}

function getRecordValue(
  value: GraphValue | undefined,
  key: string,
): GraphValue | undefined {
  if (!isRecord(value)) return undefined;
  return value[key];
}

function asRecord(
  value: GraphValue | undefined,
): Record<string, GraphValue> | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: GraphValue | undefined): value is Record<string, GraphValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: GraphValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function asNumberLike(value: GraphValue | undefined): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}
