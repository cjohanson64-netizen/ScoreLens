import {
  makeScoreSourceKey,
  normalizeScoreSourceRef,
} from "../identity/scoreSourceRef";
import { divisionsToTicks } from "../../scorePlayback/constants/timing";

type ExtractedPartInfo = {
  id: string;
  name: string;
  abbreviation?: string;
};

type ExtractedMeasureContext = {
  divisionsPerQuarter?: number;
  key?: { fifths: number; mode?: string };
  meter?: { beats: number; beatType: number };
  clef?: { sign: string; line: number; octaveChange?: number };
  tempo?: number;
};

type ExtractedLyric = {
  number?: string;
  text?: string;
  syllabic?: string;
  extendStart?: boolean;
  extendStop?: boolean;
};

type ExtractedEvent = {
  idBase: string;
  kind: "note" | "rest";
  partId: string;
  measureNumber: number;
  voice: string;
  eventIndex: number;
  duration?: number;
  type?: string;
  dots: number;
  isChord: boolean;
  onsetDivision: number;
  durationDivision: number;
  pitch?: {
    step: string;
    alter?: number;
    octave: number;
  };
  lyric?: ExtractedLyric;
  meta: {
    slurStart?: boolean;
    slurStop?: boolean;
    tieStart?: boolean;
    tieStop?: boolean;
    fermata?: boolean;
    breathMark?: boolean;
    stem?: string;
    accidentalDisplay?: string;
  };
};

type GenerateTatOptions = {
  programName?: string;
  rootName?: string;
  limitParts?: number;
  limitMeasuresPerPart?: number;
  includeProjection?: boolean;
  practiceSelection?: {
    partId: string | null;
    startMeasureNumber: number | null;
    endMeasureNumber: number | null;
  };
  measureSelection?: {
    partId: string | null;
    measureNumber: number | null;
  };
};

const DEFAULT_DIVISIONS_PER_QUARTER = 1;

export function generateTatFromMusicXml(
  xmlSource: string,
  options: GenerateTatOptions = {},
): string {
  const {
    programName = "importedScore",
    rootName = "scoreMain",
    limitParts,
    limitMeasuresPerPart,
    includeProjection = true,
    practiceSelection,
    measureSelection,
  } = options;

  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlSource, "application/xml");

  const parserError = xml.querySelector("parsererror");
  if (parserError) {
    throw new Error(
      `Invalid MusicXML: ${parserError.textContent?.trim() ?? "parser error"}`,
    );
  }

  const scoreTitle =
    textContent(xml.querySelector("movement-title")) ??
    textContent(xml.querySelector("work > work-title")) ??
    "Untitled Score";

  const partInfoMap = extractPartInfoMap(xml);
  const partElements = Array.from(xml.querySelectorAll("score-partwise > part")).slice(
    0,
    limitParts ?? Infinity,
  );

  const nodeDecls: string[] = [];
  const seedNodeNames: string[] = [];
  const seedEdgeDecls: string[] = [];
  const mutations: string[] = [];
  const progressEdges: Array<{ from: string; to: string }> = [];
  let nextInitialSelectionRank = 0;

  const usedNames = new Set<string>();

  function reserveName(name: string): string {
    let next = sanitizeName(name);
    let i = 2;
    while (usedNames.has(next)) {
      next = `${sanitizeName(name)}_${i}`;
      i += 1;
    }
    usedNames.add(next);
    return next;
  }

  function declareNode(name: string, value: Record<string, unknown>) {
    nodeDecls.push(`${name} = <${toTatObject(value)}>`); 
    seedNodeNames.push(name);
  }

  function declareSeedEdge(name: string, left: string, relation: string, right: string) {
    seedEdgeDecls.push(`${name} := [${left} : ${quote(relation)} : ${right}]`);
  }

  const scoreNodeName = reserveName(rootName);
  declareNode(scoreNodeName, {
    kind: "score",
    title: scoreTitle,
  });

  const rights = textContent(xml.querySelector("identification > rights"));
  const encodingSoftware = textContent(xml.querySelector("encoding > software"));
  const encodingDate = textContent(xml.querySelector("encoding > encoding-date"));

  if (rights) {
    mutations.push(`@graft.meta(${scoreNodeName}, ${quote("rights")}, ${quote(rights)})`);
  }
  if (encodingSoftware) {
    mutations.push(
      `@graft.meta(${scoreNodeName}, ${quote("encodingSoftware")}, ${quote(encodingSoftware)})`,
    );
  }
  if (encodingDate) {
    mutations.push(
      `@graft.meta(${scoreNodeName}, ${quote("encodingDate")}, ${quote(encodingDate)})`,
    );
  }

  for (const partEl of partElements) {
    const partId = partEl.getAttribute("id");
    if (!partId) continue;

    const partInfo = partInfoMap.get(partId) ?? {
      id: partId,
      name: partId,
    };

    const partNodeName = reserveName(`part_${partId}`);
    declareNode(partNodeName, {
      kind: "part",
      partId,
      name: partInfo.name,
      ...(partInfo.abbreviation ? { abbreviation: partInfo.abbreviation } : {}),
    });

    declareSeedEdge(
      reserveName(`scoreContains${partId}`),
      scoreNodeName,
      "contains",
      partNodeName,
    );

    const measureElements = Array.from(partEl.querySelectorAll(":scope > measure")).slice(
      0,
      limitMeasuresPerPart ?? Infinity,
    );

    let previousEventNodeName: string | null = null;
    let runningContext: ExtractedMeasureContext = {};
    let runningMeasureStartTicks = 0;
    let remainingMultiRestMeasures = 0;
    let multiRestSingleMeasureTicks = 0;

    for (const measureEl of measureElements) {
      const measureNumber = parseIntSafe(measureEl.getAttribute("number")) ?? 0;

      // Phantom measures after an explicit <multiple-rest N> block (P1 etc.):
      // the originating measure already owns the full N-measure tick block, so
      // phantoms need no node and no tick advancement.
      if (remainingMultiRestMeasures > 0) {
        remainingMultiRestMeasures -= 1;
        runningContext = mergeMeasureContext(
          runningContext,
          extractMeasureContext(measureEl),
        );
        continue;
      }

      // Width-0 phantom measures appear in parts that don't carry the
      // <multiple-rest> directive themselves (e.g. alto/bass when only soprano
      // has it), but OSMD still renders them as a single multi-rest visual group.
      // Skip node creation and advance the tick counter by one meter-slice so
      // the measure-number list stays aligned with OSMD's visual groups.
      const measureWidthPx = parseFloatSafe(measureEl.getAttribute("width")) ?? null;
      if (measureWidthPx !== null && measureWidthPx === 0) {
        const phantomContext = mergeMeasureContext(
          runningContext,
          extractMeasureContext(measureEl),
        );
        runningContext = phantomContext;
        const phantomDpq =
          phantomContext.divisionsPerQuarter ?? DEFAULT_DIVISIONS_PER_QUARTER;
        const phantomMeasureDivision = computeMeasureDurationDivision({
          voiceOnsets: new Map(),
          divisionsPerQuarter: phantomDpq,
          meter: phantomContext.meter,
        });
        runningMeasureStartTicks += divisionsToTicks(phantomMeasureDivision, phantomDpq);
        continue;
      }

      const measureNodeName = reserveName(`measure_${partId}_${measureNumber}`);

      declareNode(measureNodeName, {
        kind: "measure",
        partId,
        number: measureNumber,
      });

      declareSeedEdge(
        reserveName(`part${partId}ContainsMeasure${measureNumber}`),
        partNodeName,
        "contains",
        measureNodeName,
      );

      const updatedContext = mergeMeasureContext(
        runningContext,
        extractMeasureContext(measureEl),
      );
      runningContext = updatedContext;
      const divisionsPerQuarter =
        updatedContext.divisionsPerQuarter ?? DEFAULT_DIVISIONS_PER_QUARTER;

      if (updatedContext.key) {
        mutations.push(
          `@graft.meta(${measureNodeName}, ${quote("key")}, ${toTatObject(updatedContext.key)})`,
        );
      }
      if (updatedContext.meter) {
        mutations.push(
          `@graft.meta(${measureNodeName}, ${quote("meter")}, ${toTatObject(updatedContext.meter)})`,
        );
      }
      if (updatedContext.clef) {
        mutations.push(
          `@graft.meta(${measureNodeName}, ${quote("clef")}, ${toTatObject(updatedContext.clef)})`,
        );
      }
      if (typeof updatedContext.tempo === "number") {
        mutations.push(
          `@graft.meta(${measureNodeName}, ${quote("tempo")}, ${formatNumber(updatedContext.tempo)})`,
        );
      }
      mutations.push(
        `@graft.meta(${measureNodeName}, ${quote("divisionsPerQuarter")}, ${divisionsPerQuarter})`,
      );
      mutations.push(
        `@graft.meta(${measureNodeName}, ${quote("measureStartTicks")}, ${runningMeasureStartTicks})`,
      );

      const noteElements = Array.from(measureEl.querySelectorAll(":scope > note"));
      let eventIndex = 0;
      const extractedEvents = noteElements.map((noteEl) => {
        eventIndex += 1;
        return extractEvent(noteEl, {
          partId,
          measureNumber,
          eventIndex,
        });
      });
      const noteDefaultTargetRanks = buildMeasureDefaultTargetRanks(extractedEvents);

      const voiceOnsets = new Map<string, number>();
      const chordAnchorOnsets = new Map<string, number>();

      for (const event of extractedEvents) {
        const voiceOnsetCursor = voiceOnsets.get(event.voice) ?? 0;
        const durationDivision = event.duration ?? 0;
        const onsetDivision = event.isChord
          ? chordAnchorOnsets.get(event.voice) ?? voiceOnsetCursor
          : voiceOnsetCursor;
        const onsetTicks =
          runningMeasureStartTicks +
          divisionsToTicks(onsetDivision, divisionsPerQuarter);
        const durationTicks = divisionsToTicks(durationDivision, divisionsPerQuarter);

        const eventNodeName = reserveName(
          `${event.kind}_${partId}_${measureNumber}_${event.voice}_${event.eventIndex}`,
        );

        const sourceRef = normalizeScoreSourceRef({
          partId: event.partId,
          measureNumber: event.measureNumber,
          voice: event.voice,
          eventIndex: event.eventIndex,
        });

        const sourceKey = makeScoreSourceKey(sourceRef);

        declareNode(eventNodeName, {
          kind: event.kind,
          partId: event.partId,
          measureNumber: event.measureNumber,
          voice: event.voice,
          ...(event.type ? { type: event.type } : {}),
        });

        declareSeedEdge(
          reserveName(`measure${partId}_${measureNumber}ContainsEvent${eventIndex}`),
          measureNodeName,
          "contains",
          eventNodeName,
        );

        mutations.push(
          `@graft.meta(${eventNodeName}, ${quote("sourceRef")}, ${toTatObject(sourceRef)})`,
        );
        mutations.push(
          `@graft.meta(${eventNodeName}, ${quote("sourceKey")}, ${quote(sourceKey)})`,
        );
        mutations.push(
          `@graft.meta(${eventNodeName}, ${quote("onsetDivision")}, ${onsetDivision})`,
        );
        mutations.push(
          `@graft.meta(${eventNodeName}, ${quote("durationDivision")}, ${durationDivision})`,
        );
        mutations.push(
          `@graft.meta(${eventNodeName}, ${quote("onsetTicks")}, ${onsetTicks})`,
        );
        mutations.push(
          `@graft.meta(${eventNodeName}, ${quote("durationTicks")}, ${durationTicks})`,
        );
        mutations.push(
          `@graft.meta(${eventNodeName}, ${quote("measureNumber")}, ${event.measureNumber})`,
        );
        mutations.push(
          `@graft.meta(${eventNodeName}, ${quote("measureStartTicks")}, ${runningMeasureStartTicks})`,
        );
        mutations.push(
          `@graft.meta(${eventNodeName}, ${quote("divisionsPerQuarter")}, ${divisionsPerQuarter})`,
        );
        if (event.kind === "note") {
          mutations.push(
            `@graft.meta(${eventNodeName}, ${quote("initialSelectionRank")}, ${nextInitialSelectionRank})`,
          );
          nextInitialSelectionRank += 1;
        }
        const measureDefaultTargetRank = noteDefaultTargetRanks.get(event.eventIndex);
        if (typeof measureDefaultTargetRank === "number") {
          mutations.push(
            `@graft.meta(${eventNodeName}, ${quote("measureDefaultTargetRank")}, ${measureDefaultTargetRank})`,
          );
        }

        if (typeof event.duration === "number") {
          mutations.push(
            `@graft.meta(${eventNodeName}, ${quote("duration")}, ${event.duration})`,
          );
        }
        if (event.meta.stem) {
          mutations.push(
            `@graft.meta(${eventNodeName}, ${quote("stem")}, ${quote(event.meta.stem)})`,
          );
        }
        if (event.meta.slurStart) {
          mutations.push(`@graft.meta(${eventNodeName}, ${quote("slurStart")}, true)`);
        }
        if (event.meta.slurStop) {
          mutations.push(`@graft.meta(${eventNodeName}, ${quote("slurStop")}, true)`);
        }
        if (event.meta.tieStart) {
          mutations.push(`@graft.meta(${eventNodeName}, ${quote("tieStart")}, true)`);
        }
        if (event.meta.tieStop) {
          mutations.push(`@graft.meta(${eventNodeName}, ${quote("tieStop")}, true)`);
        }
        if (event.meta.fermata) {
          mutations.push(`@graft.meta(${eventNodeName}, ${quote("fermata")}, true)`);
        }
        if (event.meta.breathMark) {
          mutations.push(`@graft.meta(${eventNodeName}, ${quote("breathMark")}, true)`);
        }
        if (event.meta.accidentalDisplay) {
          mutations.push(
            `@graft.meta(${eventNodeName}, ${quote("accidentalDisplay")}, ${quote(event.meta.accidentalDisplay)})`,
          );
        }

        const rhythmNodeName = reserveName(
          `rhythm_${partId}_${measureNumber}_${event.voice}_${event.eventIndex}`,
        );
        declareNode(rhythmNodeName, {
          kind: "rhythm",
          ...(typeof event.duration === "number" ? { duration: event.duration } : {}),
          ...(event.type ? { type: event.type } : {}),
          dots: event.dots,
        });
        declareSeedEdge(
          reserveName(`event${partId}_${measureNumber}_${eventIndex}HasRhythm`),
          eventNodeName,
          "hasRhythm",
          rhythmNodeName,
        );

        if (event.kind === "note" && event.pitch) {
          const pitchNodeName = reserveName(
            `pitch_${partId}_${measureNumber}_${event.voice}_${event.eventIndex}`,
          );
          declareNode(pitchNodeName, {
            kind: "pitch",
            step: event.pitch.step,
            ...(typeof event.pitch.alter === "number"
              ? { alter: event.pitch.alter }
              : {}),
            octave: event.pitch.octave,
          });
          declareSeedEdge(
            reserveName(`event${partId}_${measureNumber}_${eventIndex}HasPitch`),
            eventNodeName,
            "hasPitch",
            pitchNodeName,
          );

          mutations.push(
            `@graft.meta(${eventNodeName}, ${quote("pitchText")}, ${quote(formatPitchText(event.pitch))})`,
          );
        }

        if (event.lyric?.text) {
          const lyricNodeName = reserveName(
            `lyric_${partId}_${measureNumber}_${event.voice}_${event.eventIndex}`,
          );
          declareNode(lyricNodeName, {
            kind: "lyric",
            ...(event.lyric.number ? { number: event.lyric.number } : {}),
            text: event.lyric.text,
            ...(event.lyric.syllabic ? { syllabic: event.lyric.syllabic } : {}),
          });
          declareSeedEdge(
            reserveName(`event${partId}_${measureNumber}_${eventIndex}HasLyric`),
            eventNodeName,
            "hasLyric",
            lyricNodeName,
          );

          if (event.lyric.extendStart) {
            mutations.push(
              `@graft.meta(${eventNodeName}, ${quote("lyricExtendStart")}, true)`,
            );
          }
          if (event.lyric.extendStop) {
            mutations.push(
              `@graft.meta(${eventNodeName}, ${quote("lyricExtendStop")}, true)`,
            );
          }
        }

        if (previousEventNodeName) {
          progressEdges.push({
            from: previousEventNodeName,
            to: eventNodeName,
          });
        }

        previousEventNodeName = eventNodeName;
        if (!event.isChord) {
          chordAnchorOnsets.set(event.voice, onsetDivision);
        }

        const nextVoiceOnset = Math.max(voiceOnsetCursor, onsetDivision + durationDivision);
        voiceOnsets.set(event.voice, nextVoiceOnset);
      }

      // Detect <multiple-rest N> — this measure is the originating measure of a
      // multi-measure rest block spanning N measures.
      const multipleRestCount =
        parseIntSafe(
          textContent(
            measureEl.querySelector(":scope > attributes > measure-style > multiple-rest"),
          ),
        ) ?? 1;

      // Always compute the single-measure duration from the meter so we have a
      // reliable baseline independent of what the note's <duration> says.
      const singleMeasureDivision = computeMeasureDurationDivision({
        voiceOnsets: new Map(),
        divisionsPerQuarter,
        meter: updatedContext.meter,
      });
      const singleMeasureTicks = divisionsToTicks(singleMeasureDivision, divisionsPerQuarter);

      const measureDurationDivision = computeMeasureDurationDivision({
        voiceOnsets,
        divisionsPerQuarter,
        meter: updatedContext.meter,
      });

      // For a multi-rest originating measure, store the full N-measure block
      // duration so the tracker stays on this measure for the entire rest.
      // Phantom measures carry measureDurationTicks=0 and never match the tracker.
      const measureDurationTicks =
        multipleRestCount > 1
          ? singleMeasureTicks * multipleRestCount
          : divisionsToTicks(measureDurationDivision, divisionsPerQuarter);

      if (multipleRestCount > 1) {
        remainingMultiRestMeasures = multipleRestCount - 1;
        multiRestSingleMeasureTicks = singleMeasureTicks;
      }

      mutations.push(
        `@graft.meta(${measureNodeName}, ${quote("measureDurationTicks")}, ${measureDurationTicks})`,
      );

      runningMeasureStartTicks += measureDurationTicks;
    }
  }

  for (const { from, to } of progressEdges) {
    mutations.push(`@graft.progress(${from}, ${quote("precedes")}, ${to})`);
  }

  const selectionPartId = practiceSelection?.partId ?? null;
  const selectionStartMeasure = practiceSelection?.startMeasureNumber ?? null;
  const selectionEndMeasure = practiceSelection?.endMeasureNumber ?? null;
  const hasPracticeSelection =
    typeof selectionPartId === "string" &&
    typeof selectionStartMeasure === "number" &&
    typeof selectionEndMeasure === "number";
  const selectedMeasurePartId = measureSelection?.partId ?? null;
  const selectedMeasureNumber = measureSelection?.measureNumber ?? null;
  const selectedMeasureVoice = measureSelection?.voice ?? null;
  const hasMeasureSelection =
    typeof selectedMeasurePartId === "string" &&
    typeof selectedMeasureNumber === "number";
  const hasMeasurePracticeSelection =
    hasMeasureSelection &&
    typeof selectedMeasureVoice === "string" &&
    selectedMeasureVoice.length > 0;

  const bindStatements = [
    `@bind.state.node(initialDefaultTarget := @first(@where(node.value.kind == ${quote("note")} && node.meta.initialSelectionRank == 0)))`,
    ...(hasPracticeSelection
      ? [
        `@bind.ctx(selectedRangePartId := ${quote(selectionPartId)})`,
        `@bind.ctx(selectedRangeStart := ${Math.min(selectionStartMeasure, selectionEndMeasure)})`,
        `@bind.ctx(selectedRangeEnd := ${Math.max(selectionStartMeasure, selectionEndMeasure)})`,
        `@bind.state(selectedRangePartId := selectedRangePartId)`,
        `@bind.state(selectedRangeStart := selectedRangeStart)`,
        `@bind.state(selectedRangeEnd := selectedRangeEnd)`,
        `@bind.state.node(activePracticeNotes := @where(node.value.kind == ${quote("note")} && node.meta.sourceRef.partId == selectedRangePartId && node.meta.sourceRef.measureNumber >= selectedRangeStart && node.meta.sourceRef.measureNumber <= selectedRangeEnd))`,
        `@bind.state.node(activePracticeEvents := @where((node.value.kind == ${quote("note")} || node.value.kind == ${quote("rest")}) && node.meta.sourceRef.partId == selectedRangePartId && node.meta.sourceRef.measureNumber >= selectedRangeStart && node.meta.sourceRef.measureNumber <= selectedRangeEnd))`,
      ]
      : []),
    ...(hasMeasureSelection
      ? [
        `@bind.ctx(selectedMeasurePartId := ${quote(selectedMeasurePartId)})`,
        `@bind.ctx(selectedMeasureNumber := ${selectedMeasureNumber})`,
        `@bind.state(selectedMeasurePartId := selectedMeasurePartId)`,
        `@bind.state(selectedMeasureNumber := selectedMeasureNumber)`,
        `@bind.state.node(selectedMeasureNotes := @where(node.value.kind == ${quote("note")} && node.meta.sourceRef.partId == selectedMeasurePartId && node.meta.sourceRef.measureNumber == selectedMeasureNumber))`,
        `@bind.state.node(selectedMeasureDefaultTarget := @first(@where(node.value.kind == ${quote("note")} && node.meta.sourceRef.partId == selectedMeasurePartId && node.meta.sourceRef.measureNumber == selectedMeasureNumber && node.meta.measureDefaultTargetRank == 0)))`,
        ...(hasMeasurePracticeSelection
          ? [
            `@bind.ctx(selectedMeasureVoice := ${quote(selectedMeasureVoice)})`,
            `@bind.state(selectedMeasureVoice := selectedMeasureVoice)`,
            `@bind.state.node(orderedMeasurePracticeNotes := @where(node.value.kind == ${quote("note")} && node.meta.sourceRef.partId == selectedMeasurePartId && node.meta.sourceRef.measureNumber == selectedMeasureNumber && node.meta.sourceRef.voice == selectedMeasureVoice))`,
          ]
          : []),
      ]
      : []),
  ];

  const tat = [
    ...nodeDecls,
    "",
    "@seed:",
    `  nodes: [${seedNodeNames.join(", ")}]`,
    "  edges: [",
    ...seedEdgeDecls.map((edge, index) => {
      const comma = index === seedEdgeDecls.length - 1 ? "" : ",";
      return `    ${edge}${comma}`;
    }),
    "  ]",
    "  state: {}",
    "  meta: {}",
    `  root: ${scoreNodeName}`,
    "",
    `${sanitizeName(programName)} := @seed`,
    ...mutations.map((mutation) => `  -> ${mutation}`),
    ...(includeProjection ? [`  <> @project(format: ${quote("graph")})`] : []),
    ...bindStatements,
    "",
  ].join("\n");

  return tat;
}

function buildMeasureDefaultTargetRanks(
  events: ExtractedEvent[],
): Map<number, number> {
  const noteEvents = events
    .filter((event) => event.kind === "note")
    .sort((a, b) => compareMeasureDefaultTargetOrder(a, b));

  return new Map(
    noteEvents.map((event, index) => [event.eventIndex, index]),
  );
}

function compareMeasureDefaultTargetOrder(
  a: ExtractedEvent,
  b: ExtractedEvent,
): number {
  const voiceA = Number.parseInt(a.voice ?? "1", 10);
  const voiceB = Number.parseInt(b.voice ?? "1", 10);
  const normalizedVoiceA = Number.isNaN(voiceA) ? Number.MAX_SAFE_INTEGER : voiceA;
  const normalizedVoiceB = Number.isNaN(voiceB) ? Number.MAX_SAFE_INTEGER : voiceB;

  if (normalizedVoiceA !== normalizedVoiceB) {
    return normalizedVoiceA - normalizedVoiceB;
  }

  if (a.voice !== b.voice) {
    return a.voice.localeCompare(b.voice, undefined, { numeric: true });
  }

  if (a.eventIndex !== b.eventIndex) {
    return a.eventIndex - b.eventIndex;
  }

  return a.idBase.localeCompare(b.idBase, undefined, { numeric: true });
}

function extractPartInfoMap(xml: Document): Map<string, ExtractedPartInfo> {
  const map = new Map<string, ExtractedPartInfo>();
  const scoreParts = Array.from(xml.querySelectorAll("part-list > score-part"));

  for (const scorePart of scoreParts) {
    const id = scorePart.getAttribute("id");
    if (!id) continue;

    map.set(id, {
      id,
      name: textContent(scorePart.querySelector("part-name")) ?? id,
      abbreviation: textContent(scorePart.querySelector("part-abbreviation")) ?? undefined,
    });
  }

  return map;
}

function extractMeasureContext(measureEl: Element): ExtractedMeasureContext {
  const attributesEl = measureEl.querySelector(":scope > attributes");
  const soundEl = measureEl.querySelector(":scope > sound[tempo]");

  return {
    divisionsPerQuarter: parseIntSafe(
      textContent(attributesEl?.querySelector("divisions") ?? null),
    ),
    key: attributesEl && textContent(attributesEl.querySelector("key > fifths")) !== null
      ? {
          fifths: parseIntSafe(textContent(attributesEl.querySelector("key > fifths"))) ?? 0,
          mode: textContent(attributesEl.querySelector("key > mode")) ?? undefined,
        }
      : undefined,
    meter: attributesEl && textContent(attributesEl.querySelector("time > beats")) !== null
      ? {
          beats: parseIntSafe(textContent(attributesEl.querySelector("time > beats"))) ?? 0,
          beatType:
            parseIntSafe(textContent(attributesEl.querySelector("time > beat-type"))) ?? 0,
        }
      : undefined,
    clef: attributesEl && textContent(attributesEl.querySelector("clef > sign")) !== null
      ? {
          sign: textContent(attributesEl.querySelector("clef > sign")) ?? "",
          line: parseIntSafe(textContent(attributesEl.querySelector("clef > line"))) ?? 0,
          octaveChange:
            parseIntSafe(textContent(attributesEl.querySelector("clef > clef-octave-change"))) ??
            undefined,
        }
      : undefined,
    tempo: soundEl ? parseFloatSafe(soundEl.getAttribute("tempo")) ?? undefined : undefined,
  };
}

function mergeMeasureContext(
  previous: ExtractedMeasureContext,
  next: ExtractedMeasureContext,
): ExtractedMeasureContext {
  return {
    divisionsPerQuarter:
      typeof next.divisionsPerQuarter === "number"
        ? next.divisionsPerQuarter
        : previous.divisionsPerQuarter,
    key: next.key ? next.key : previous.key,
    meter: next.meter ? next.meter : previous.meter,
    clef: next.clef ? next.clef : previous.clef,
    tempo: typeof next.tempo === "number" ? next.tempo : previous.tempo,
  };
}

function extractEvent(
  noteEl: Element,
  context: {
    partId: string;
    measureNumber: number;
    eventIndex: number;
  },
): ExtractedEvent {
  const isRest = !!noteEl.querySelector(":scope > rest");
  const voice = textContent(noteEl.querySelector(":scope > voice")) ?? "1";
  const duration = parseIntSafe(textContent(noteEl.querySelector(":scope > duration"))) ?? undefined;
  const type = textContent(noteEl.querySelector(":scope > type")) ?? undefined;
  const dots = noteEl.querySelectorAll(":scope > dot").length;
  const isChord = !!noteEl.querySelector(":scope > chord");

  const pitchEl = noteEl.querySelector(":scope > pitch");
  const lyricEl = noteEl.querySelector(":scope > lyric");

  const pitch =
    !isRest && pitchEl
      ? {
          step: textContent(pitchEl.querySelector("step")) ?? "C",
          alter: parseIntSafe(textContent(pitchEl.querySelector("alter"))) ?? undefined,
          octave: parseIntSafe(textContent(pitchEl.querySelector("octave"))) ?? 4,
        }
      : undefined;

  const lyric = lyricEl
    ? {
        number: lyricEl.getAttribute("number") ?? undefined,
        text: textContent(lyricEl.querySelector("text")) ?? undefined,
        syllabic: textContent(lyricEl.querySelector("syllabic")) ?? undefined,
        extendStart: !!lyricEl.querySelector('extend[type="start"]'),
        extendStop: !!lyricEl.querySelector('extend[type="stop"]'),
      }
    : undefined;

  return {
    idBase: `${context.partId}:${context.measureNumber}:${voice}:${context.eventIndex}`,
    kind: isRest ? "rest" : "note",
    partId: context.partId,
    measureNumber: context.measureNumber,
    voice,
    eventIndex: context.eventIndex,
    duration,
    type,
    dots,
    isChord,
    onsetDivision: 0,
    durationDivision: duration ?? 0,
    pitch,
    lyric,
    meta: {
      slurStart: !!noteEl.querySelector(':scope > notations > slur[type="start"]'),
      slurStop: !!noteEl.querySelector(':scope > notations > slur[type="stop"]'),
      tieStart:
        !!noteEl.querySelector(':scope > notations > tied[type="start"]') ||
        !!noteEl.querySelector(':scope > tie[type="start"]'),
      tieStop:
        !!noteEl.querySelector(':scope > notations > tied[type="stop"]') ||
        !!noteEl.querySelector(':scope > tie[type="stop"]'),
      fermata: !!noteEl.querySelector(":scope > notations > fermata"),
      breathMark: !!noteEl.querySelector(":scope > notations breath-mark"),
      stem: textContent(noteEl.querySelector(":scope > stem")) ?? undefined,
      accidentalDisplay: textContent(noteEl.querySelector(":scope > accidental")) ?? undefined,
    },
  };
}

function toTatObject(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return quote(value);

  if (typeof value === "number") {
    if (value < 0) return quote(String(value));
    return formatNumber(value);
  }

  if (typeof value === "boolean") return value ? "true" : "false";

  if (Array.isArray(value)) {
    return `[${value.map((item) => toTatObject(item)).join(", ")}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined,
    );
    return `{ ${entries.map(([k, v]) => `${k}: ${toTatObject(v)}`).join(", ")} }`;
  }

  throw new Error(`Unsupported value for TAT serialization: ${String(value)}`);
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function sanitizeName(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `n_${cleaned}`;
}

function formatPitchText(pitch: { step: string; alter?: number; octave: number }): string {
  return `${pitch.step}${alterToAccidental(pitch.alter)}${pitch.octave}`;
}

function alterToAccidental(alter?: number): string {
  if (alter === 1) return "#";
  if (alter === 2) return "##";
  if (alter === -1) return "b";
  if (alter === -2) return "bb";
  return "";
}

function textContent(el: Element | null): string | null {
  const value = el?.textContent?.trim();
  return value ? value : null;
}

function parseIntSafe(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseFloatSafe(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function computeMeasureDurationDivision({
  voiceOnsets,
  divisionsPerQuarter,
  meter,
}: {
  voiceOnsets: Map<string, number>;
  divisionsPerQuarter: number;
  meter?: { beats: number; beatType: number };
}): number {
  const maxVoiceDurationDivision =
    voiceOnsets.size > 0 ? Math.max(...voiceOnsets.values()) : 0;

  if (!meter || meter.beatType <= 0 || divisionsPerQuarter <= 0) {
    return maxVoiceDurationDivision;
  }

  const beatUnitQuarterRatio = 4 / meter.beatType;
  const meterDurationDivision = Math.round(
    meter.beats * divisionsPerQuarter * beatUnitQuarterRatio,
  );

  // Use the meter duration strictly: it pads under-full measures (pickup bars)
  // to the correct barline position and caps over-full measures caused by
  // notation errors (e.g. a quarter note written where an eighth was intended).
  return meterDurationDivision;
}
