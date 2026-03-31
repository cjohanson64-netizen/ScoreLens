import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import scoreLensLogo from "../assets/ScoreLens Logo.png";

import { runTatSandbox } from "../features/tatSandbox/runTatSandbox";
import { runImportedMusicXml } from "../features/tatSandbox/runImportedMusicXml";

import OsmdScorePanel from "../features/tatSandbox/components/OsmdScorePanel";
import ActiveTargetPanel from "../features/tatSandbox/components/ActiveTargetPanel";
import EvaluationSummaryPanel from "../features/tatSandbox/components/EvaluationSummaryPanel";
import NextActionPanel from "../features/tatSandbox/components/NextActionPanel";
import PlaybackControlPanel from "../features/scorePlayback/components/PlaybackControlPanel";

import {
  projectOsmdOverlayTargets,
  projectActiveTarget,
  projectEvaluationSummary,
  projectNextAction,
} from "../features/tatSandbox/projections";
import {
  readInitialDefaultTargetId,
  readOrderedMeasurePracticeNoteIds,
  readSelectedMeasureDefaultTargetId,
} from "../features/tatSandbox/selection/selectedMeasureTarget";

import { buildSemanticBridgeIndex } from "../features/tatSandbox/identity/buildSemanticBridgeIndex";
import { projectActivePitchTarget } from "../features/scoreEvaluation/projectors/projectActivePitchTarget";
import { evaluateActiveTarget } from "../features/scoreEvaluation/evaluateActiveTarget";
import { createPitchListener } from "../features/scoreEvaluation/audio/createPitchListener";
import {
  normalizeExpectedTimeline,
  evaluateMeasurePerformanceDetailed,
  extractPerformedNotes,
} from "../features/scoreEvaluation/measureEvaluation/evaluateMeasurePerformance";
import {
  createTransport,
  createNotePlayer,
  buildSegmentPlaybackEvents,
  buildFullSongPlaybackEvents,
  buildSegmentNoteSequence,
  DEFAULT_BPM,
  findPlaybackEventsAtTick,
  findPlaybackMeasuresAtTick,
  getMeasureStartingPitch,
  parsePitchText,
  playCountIn,
  parsedPitchToNote,
  PLAYBACK_PPQ,
  projectPlaybackTimeline,
  runMeasureEventTimeline,
  millisecondsToTicks,
  ticksToMilliseconds,
} from "../features/scorePlayback";
import {
  buildMetronomeClicks,
  createMetronome,
} from "../features/scorePlayback/audio/createMetronome";

const ACTIVE_PROGRAM = "importedScoreLensDemo";
const EVAL_TOLERANCE_CENTS = 25;
const MIN_VALID_PITCH_HZ = 80;
const REST_QUIETNESS_THRESHOLD_DB = -45;
const REST_MIN_WINDOW_MS = 500;
const REATTACK_READY_THRESHOLD_DB = -55;
const REATTACK_ATTACK_THRESHOLD_DB = -45;
const DEBUG_MEASURE_EVALUATION = true;
const EMPTY_PITCH_EVALUATION = {
  targetHz: 0,
  detectedHz: null,
  centError: null,
  inTune: false,
  status: "idle",
};

function App() {
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [showDebug, setShowDebug] = useState(false);
  const [practiceMode, setPracticeMode] = useState("single-note");
  const [measurePractice, setMeasurePractice] = useState(null);
  const [measureCompletionsByKey, setMeasureCompletionsByKey] = useState({});
  const [pitchEvaluation, setPitchEvaluation] = useState(EMPTY_PITCH_EVALUATION);
  const [noteEvaluationsByNodeId, setNoteEvaluationsByNodeId] = useState({});
  const [isListening, setIsListening] = useState(false);
  const [isSongPlaybackActive, setIsSongPlaybackActive] = useState(false);
  const [isMeasurePlaybackActive, setIsMeasurePlaybackActive] = useState(false);
  const [activeMeasurePlaybackNoteId, setActiveMeasurePlaybackNoteId] = useState(null);
  const [isMeasureEvaluationActive, setIsMeasureEvaluationActive] = useState(false);
  const [measureEvaluationResults, setMeasureEvaluationResults] = useState([]);
  const [measureEvaluationDebug, setMeasureEvaluationDebug] = useState(null);
  const [activeInspectedEvaluationNoteId, setActiveInspectedEvaluationNoteId] =
    useState(null);
  const [segmentStartMeasure, setSegmentStartMeasure] = useState(1);
  const [segmentEndMeasure, setSegmentEndMeasure] = useState(1);
  const [segmentVisualTick, setSegmentVisualTick] = useState(null);
  const [selectedMeasureContext, setSelectedMeasureContext] = useState(null);
  const pitchListenerRef = useRef(null);
  const activePitchTargetRef = useRef(null);
  const practiceModeRef = useRef("single-note");
  const measurePracticeRef = useRef(null);
  const isListeningRef = useRef(false);
  const semanticBridgeRef = useRef(null);
  const previousTargetIdRef = useRef(null);
  const processedTargetIdRef = useRef(null);
  const restWindowRef = useRef(createEmptyRestWindowState());
  const repeatedPitchGateRef = useRef(createRepeatedPitchGateState(false));
  const [repeatedPitchGate, setRepeatedPitchGate] = useState(
    createRepeatedPitchGateState(false),
  );
  const [transportState, setTransportState] = useState({
    currentTick: 0,
    isPlaying: false,
    bpm: DEFAULT_BPM,
  });
  const [importedXmlSource, setImportedXmlSource] = useState(null);
  const fileInputRef = useRef(null);
  const transportRef = useRef(null);
  const metronomeRef = useRef(null);
  const notePlayerRef = useRef(null);
  const selectedSegmentKeyRef = useRef(null);
  const measureResultsForSelectedSegmentRef = useRef([]);
  const previousSegmentPartIdRef = useRef(null);
  const measurePlaybackRunIdRef = useRef(0);

  const {
    runResult,
    output,
    error,
    baseGraph,
    semanticBridge,
  } = useMemo(() => {
    try {
      const result = importedXmlSource
        ? (() => {
            const imported = runImportedMusicXml(importedXmlSource);
            return {
              mode: "musicxml",
              source: imported.xmlSource,
              generatedTatSource: imported.tatSource,
              xmlSource: imported.xmlSource,
              scoreTitle: imported.scoreTitle,
              execution: imported.output,
            };
          })()
        : runTatSandbox(ACTIVE_PROGRAM);

      const rawExecution = result?.execution ?? null;
      const runtimeState =
        rawExecution?.state ?? rawExecution?.execution?.state ?? null;

      const debugData =
        rawExecution?.debug ?? rawExecution?.execution?.debug ?? null;

      const astData = rawExecution?.ast ?? rawExecution?.execution?.ast ?? null;

      const validationData =
        rawExecution?.validation ?? rawExecution?.execution?.validation ?? null;

      if (!runtimeState) {
        throw new Error("Sandbox run did not return a runtime state");
      }

      const graphName = runtimeState.lastGraphName;
      const baseGraph = graphName
        ? (runtimeState.graphs.get(graphName) ?? null)
        : null;

      const semanticBridge = baseGraph ? buildSemanticBridgeIndex(baseGraph) : null;

      return {
        runResult: result,
        output: {
          state: runtimeState,
          debug: debugData,
          ast: astData,
          validation: validationData,
        },
        error: null,
        baseGraph,
        semanticBridge,
      };
    } catch (err) {
      return {
        runResult: null,
        output: null,
        error: err instanceof Error ? err.message : String(err),
        baseGraph: null,
        semanticBridge: null,
      };
    }
  }, [importedXmlSource]);

  const playbackTimeline = useMemo(
    () => (baseGraph ? projectPlaybackTimeline(baseGraph) : null),
    [baseGraph],
  );

  const selectionXmlSource = useMemo(() => {
    if (importedXmlSource) return importedXmlSource;
    if (runResult?.mode === "musicxml" && typeof runResult.xmlSource === "string") {
      return runResult.xmlSource;
    }
    return null;
  }, [importedXmlSource, runResult]);

  const selectedMeasureForPlayback = useMemo(() => {
    if (!selectedEventId || !semanticBridge) return null;
    const selectedEntry = semanticBridge.byTatNodeId.get(selectedEventId);
    if (!selectedEntry?.sourceRef) return null;

    return {
      partId: selectedEntry.sourceRef.partId,
      measureNumber: selectedEntry.sourceRef.measureNumber,
    };
  }, [selectedEventId, semanticBridge]);

  const selectedSegmentPartId = useMemo(() => {
    if (selectedMeasureForPlayback?.partId) return selectedMeasureForPlayback.partId;
    if (!playbackTimeline?.measures?.length) return null;
    return playbackTimeline.measures[0].partId ?? null;
  }, [playbackTimeline?.measures, selectedMeasureForPlayback?.partId]);

  const availableSegmentMeasureNumbers = useMemo(() => {
    if (!playbackTimeline?.measures?.length || !selectedSegmentPartId) return [];

    return Array.from(
      new Set(
        playbackTimeline.measures
          .filter((measure) => measure.partId === selectedSegmentPartId)
          .map((measure) => measure.measureNumber),
      ),
    ).sort((a, b) => a - b);
  }, [playbackTimeline?.measures, selectedSegmentPartId]);

  const segmentMeasureBounds = useMemo(() => {
    if (!availableSegmentMeasureNumbers.length) return null;
    return {
      min: availableSegmentMeasureNumbers[0],
      max: availableSegmentMeasureNumbers[availableSegmentMeasureNumbers.length - 1],
    };
  }, [availableSegmentMeasureNumbers]);

  useEffect(() => {
    if (!segmentMeasureBounds) return;

    const previousSegmentPartId = previousSegmentPartIdRef.current;
    const didPartChange = previousSegmentPartId !== selectedSegmentPartId;
    previousSegmentPartIdRef.current = selectedSegmentPartId;

    if (previousSegmentPartId === null && didPartChange) {
      // Default to full-song (full-part) segment on first load only.
      setSegmentStartMeasure(segmentMeasureBounds.min);
      setSegmentEndMeasure(segmentMeasureBounds.max);
      return;
    }

    setSegmentStartMeasure((previous) =>
      clampNumber(
        previous,
        segmentMeasureBounds.min,
        segmentMeasureBounds.max,
        segmentMeasureBounds.min,
      ),
    );
    setSegmentEndMeasure((previous) =>
      clampNumber(
        previous,
        segmentMeasureBounds.min,
        segmentMeasureBounds.max,
        segmentMeasureBounds.max,
      ),
    );
  }, [
    selectedSegmentPartId,
    segmentMeasureBounds,
  ]);

  const selectedMeasureRange = useMemo(() => {
    if (!segmentMeasureBounds) return null;

    const clampedStart = clampNumber(
      segmentStartMeasure,
      segmentMeasureBounds.min,
      segmentMeasureBounds.max,
      segmentMeasureBounds.min,
    );
    const clampedEnd = clampNumber(
      segmentEndMeasure,
      segmentMeasureBounds.min,
      segmentMeasureBounds.max,
      segmentMeasureBounds.max,
    );

    return {
      startMeasure: Math.min(clampedStart, clampedEnd),
      endMeasure: Math.max(clampedStart, clampedEnd),
    };
  }, [
    segmentEndMeasure,
    segmentMeasureBounds,
    segmentStartMeasure,
  ]);

  const graph = useMemo(() => {
    if (!selectionXmlSource) return baseGraph;
    if (!selectedSegmentPartId || !selectedMeasureRange) return baseGraph;

    const imported = runImportedMusicXml(selectionXmlSource, {
      practiceSelection: {
        partId: selectedSegmentPartId,
        startMeasureNumber: selectedMeasureRange.startMeasure,
        endMeasureNumber: selectedMeasureRange.endMeasure,
      },
      measureSelection: selectedMeasureContext,
    });

    const runtimeState = imported.output?.state ?? imported.output?.execution?.state ?? null;
    if (!runtimeState?.lastGraphName) return baseGraph;
    return runtimeState.graphs.get(runtimeState.lastGraphName) ?? baseGraph;
  }, [
    baseGraph,
    selectionXmlSource,
    selectedMeasureContext,
    selectedMeasureRange,
    selectedSegmentPartId,
  ]);

  const selectedImportedExecution = useMemo(() => {
    if (!selectionXmlSource || !selectedSegmentPartId || !selectedMeasureRange) {
      return null;
    }

    const imported = runImportedMusicXml(selectionXmlSource, {
      practiceSelection: {
        partId: selectedSegmentPartId,
        startMeasureNumber: selectedMeasureRange.startMeasure,
        endMeasureNumber: selectedMeasureRange.endMeasure,
      },
      measureSelection: selectedMeasureContext,
    });

    return {
      mode: "musicxml",
      source: imported.xmlSource,
      generatedTatSource: imported.tatSource,
      xmlSource: imported.xmlSource,
      scoreTitle: imported.scoreTitle,
      execution: imported.output,
      output: {
        state: imported.output?.state ?? imported.output?.execution?.state ?? null,
        debug: imported.output?.debug ?? imported.output?.execution?.debug ?? null,
        ast: imported.output?.ast ?? imported.output?.execution?.ast ?? null,
        validation:
          imported.output?.validation ?? imported.output?.execution?.validation ?? null,
      },
    };
  }, [
    selectionXmlSource,
    selectedMeasureContext,
    selectedMeasureRange,
    selectedSegmentPartId,
  ]);

  const displayRunResult = selectedImportedExecution ?? runResult;
  const displayOutput = selectedImportedExecution?.output ?? output;

  const selectedSegmentForPlayback = useMemo(() => {
    const partId =
      typeof graph?.state?.selectedRangePartId === "string"
        ? graph.state.selectedRangePartId
        : selectedSegmentPartId;
    const startMeasureNumber =
      typeof graph?.state?.selectedRangeStart === "number"
        ? graph.state.selectedRangeStart
        : selectedMeasureRange?.startMeasure ?? null;
    const endMeasureNumber =
      typeof graph?.state?.selectedRangeEnd === "number"
        ? graph.state.selectedRangeEnd
        : selectedMeasureRange?.endMeasure ?? null;

    if (
      !partId ||
      typeof startMeasureNumber !== "number" ||
      typeof endMeasureNumber !== "number"
    ) {
      return null;
    }

    return {
      partId,
      startMeasureNumber,
      endMeasureNumber,
    };
  }, [graph, selectedMeasureRange, selectedSegmentPartId]);

  const activePracticeNoteIds = useMemo(() => {
    const activePracticeNotes = graph?.state?.activePracticeNotes;
    if (!Array.isArray(activePracticeNotes)) return [];
    return activePracticeNotes
      .map((node) => (node && typeof node === "object" ? node.id : null))
      .filter((id) => typeof id === "string");
  }, [graph]);

  const activePracticeEventIds = useMemo(() => {
    const activePracticeEvents = graph?.state?.activePracticeEvents;
    if (!Array.isArray(activePracticeEvents)) return [];
    return activePracticeEvents
      .map((node) => (node && typeof node === "object" ? node.id : null))
      .filter((id) => typeof id === "string");
  }, [graph]);

  const activePracticeMeasureNumbers = useMemo(() => {
    const activePracticeEvents = graph?.state?.activePracticeEvents;
    if (!Array.isArray(activePracticeEvents)) return [];

    return Array.from(
      new Set(
        activePracticeEvents
          .map((node) => {
            if (!node || typeof node !== "object") return null;
            const sourceRef = node.meta?.sourceRef;
            return typeof sourceRef?.measureNumber === "number"
              ? sourceRef.measureNumber
              : null;
          })
          .filter((measureNumber) => typeof measureNumber === "number"),
      ),
    ).sort((a, b) => a - b);
  }, [graph]);

  const selectedMeasureDefaultTargetId = useMemo(
    () => readSelectedMeasureDefaultTargetId(graph, selectedMeasureContext),
    [graph, selectedMeasureContext],
  );
  const initialDefaultTargetId = useMemo(
    () => readInitialDefaultTargetId(graph),
    [graph],
  );

  const selectedSegmentKey = useMemo(
    () =>
      selectedSegmentForPlayback
        ? `${selectedSegmentForPlayback.partId}::m${selectedSegmentForPlayback.startMeasureNumber}-${selectedSegmentForPlayback.endMeasureNumber}`
        : null,
    [selectedSegmentForPlayback],
  );

  const overlayTargets = useMemo(
    () => (graph ? projectOsmdOverlayTargets(graph, selectedEventId) : null),
    [graph, selectedEventId],
  );

  const activeTarget = useMemo(
    () => (graph ? projectActiveTarget(graph, selectedEventId) : null),
    [graph, selectedEventId],
  );

  const evaluationSummary = useMemo(
    () => (graph ? projectEvaluationSummary(graph, selectedEventId) : null),
    [graph, selectedEventId],
  );

  const nextAction = useMemo(
    () => (graph ? projectNextAction(graph, selectedEventId) : null),
    [graph, selectedEventId],
  );

  const activePitchTarget = useMemo(
    () => projectActivePitchTarget(activeTarget),
    [activeTarget],
  );

  const currentPlaybackEvents = useMemo(
    () =>
      playbackTimeline
        ? findPlaybackEventsAtTick(playbackTimeline, transportState.currentTick)
        : [],
    [playbackTimeline, transportState.currentTick],
  );

  const currentPlaybackMeasures = useMemo(
    () =>
      playbackTimeline
        ? findPlaybackMeasuresAtTick(playbackTimeline, transportState.currentTick)
        : [],
    [playbackTimeline, transportState.currentTick],
  );
  const currentPlaybackMeasure = useMemo(() => {
    if (!currentPlaybackMeasures.length) return null;

    return [...currentPlaybackMeasures].sort((a, b) => {
      if (a.measureStartTicks !== b.measureStartTicks) {
        return b.measureStartTicks - a.measureStartTicks;
      }
      return b.measureNumber - a.measureNumber;
    })[0];
  }, [currentPlaybackMeasures]);
  const isSegmentTransportActive = isMeasureEvaluationActive || isMeasurePlaybackActive;
  const visualPlaybackTick = useMemo(
    () =>
      isSegmentTransportActive && Number.isFinite(segmentVisualTick)
        ? Math.max(0, segmentVisualTick)
        : transportState.currentTick,
    [isSegmentTransportActive, segmentVisualTick, transportState.currentTick],
  );
  const visualPlaybackMeasures = useMemo(
    () =>
      playbackTimeline
        ? findPlaybackMeasuresAtTick(playbackTimeline, visualPlaybackTick)
        : [],
    [playbackTimeline, visualPlaybackTick],
  );
  const visualPlaybackEvents = useMemo(
    () =>
      playbackTimeline
        ? findPlaybackEventsAtTick(playbackTimeline, visualPlaybackTick)
        : [],
    [playbackTimeline, visualPlaybackTick],
  );
  const visualPlaybackMeasure = useMemo(() => {
    if (!visualPlaybackMeasures.length) return null;

    return [...visualPlaybackMeasures].sort((a, b) => {
      if (a.measureStartTicks !== b.measureStartTicks) {
        return b.measureStartTicks - a.measureStartTicks;
      }
      return b.measureNumber - a.measureNumber;
    })[0];
  }, [visualPlaybackMeasures]);

  const evaluationMarkersByNodeId = useMemo(() => {
    if (!selectedSegmentKey) return {};

    return measureEvaluationResults.reduce((acc, result) => {
      if (result.selectionKey !== selectedSegmentKey) return acc;
      if (!result.marker) return acc;
      acc[result.noteId] = result.marker;
      return acc;
    }, {});
  }, [measureEvaluationResults, selectedSegmentKey]);

  const measureCorrectByNodeId = useMemo(() => {
    if (!selectedSegmentKey) return {};

    return measureEvaluationResults.reduce((acc, result) => {
      if (result.selectionKey !== selectedSegmentKey) return acc;
      if (result.pitchCorrect && result.rhythmCorrect) {
        acc[result.noteId] = true;
      }
      return acc;
    }, {});
  }, [measureEvaluationResults, selectedSegmentKey]);

  activePitchTargetRef.current = activePitchTarget;
  practiceModeRef.current = practiceMode;
  measurePracticeRef.current = measurePractice;
  isListeningRef.current = isListening;
  semanticBridgeRef.current = semanticBridge;
  selectedSegmentKeyRef.current = selectedSegmentKey;

  useEffect(() => {
    const transport = createTransport({
      bpm: DEFAULT_BPM,
      ppq: PLAYBACK_PPQ,
    });
    transportRef.current = transport;

    const unsubscribe = transport.subscribe((snapshot) => {
      setTransportState({
        currentTick: snapshot.currentTick,
        isPlaying: snapshot.isPlaying,
        bpm: snapshot.bpm,
      });
      metronomeRef.current?.onTransportTick(snapshot);
    });

    return () => {
      unsubscribe();
      transport.stop();
      transportRef.current = null;
    };
  }, []);

  useEffect(() => {
    const notePlayer = createNotePlayer();
    notePlayerRef.current = notePlayer;

    return () => {
      notePlayer.dispose();
      if (notePlayerRef.current === notePlayer) {
        notePlayerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const previousMetronome = metronomeRef.current;
    if (previousMetronome) {
      previousMetronome.dispose();
      metronomeRef.current = null;
    }

    if (!playbackTimeline) return;

    const clicks = buildMetronomeClicks(playbackTimeline);
    const metronome = createMetronome(clicks);
    metronomeRef.current = metronome;

    return () => {
      metronome.dispose();
      if (metronomeRef.current === metronome) {
        metronomeRef.current = null;
      }
    };
  }, [playbackTimeline]);

  useEffect(() => {
    if (!playbackTimeline || !transportRef.current) return;

    if (transportRef.current.currentTick > playbackTimeline.totalDurationTicks) {
      transportRef.current.seek(0);
    }
  }, [playbackTimeline]);

  const handleStop = useCallback(() => {
    measurePlaybackRunIdRef.current += 1;
    setSegmentVisualTick(null);
    setActiveMeasurePlaybackNoteId(null);
    setIsMeasurePlaybackActive(false);
    setIsSongPlaybackActive(false);
    transportRef.current?.stop();
    try {
      metronomeRef.current?.stopAll();
    } catch (error) {
      console.error("Failed to stop metronome immediately", error);
    }
    try {
      notePlayerRef.current?.stopAll();
    } catch (error) {
      console.error("Failed to stop note playback immediately", error);
    }
  }, []);

  const handlePlaySong = useCallback(async () => {
    if (isSongPlaybackActive || isMeasurePlaybackActive) return;

    const timeline = playbackTimeline;
    const notePlayer = notePlayerRef.current;
    if (!timeline || !notePlayer) return;

    const allEvents = buildFullSongPlaybackEvents({
      timeline,
      bpm: transportState.bpm,
    });
    const playableCount = allEvents.filter(
      (event) => event.kind === "note" && event.pitch,
    ).length;
    if (!playableCount) return;

    const runId = measurePlaybackRunIdRef.current + 1;
    measurePlaybackRunIdRef.current = runId;
    setIsSongPlaybackActive(true);

    await metronomeRef.current?.prepare();
    await notePlayer.prepare();
    transportRef.current?.seek(0);
    transportRef.current?.play();

    const startTimeMs = performance.now();
    try {
      await runMeasureEventTimeline({
        events: allEvents,
        startTimeMs,
        isCancelled: () => measurePlaybackRunIdRef.current !== runId,
        onEventStart: (event) => {
          if (event.kind !== "note" || !event.pitch) return;
          void notePlayer.playNote(event.pitch, { durationMs: event.durationMs });
        },
        onComplete: () => {
          transportRef.current?.stop();
        },
      });
    } finally {
      if (measurePlaybackRunIdRef.current === runId) {
        setIsSongPlaybackActive(false);
        transportRef.current?.stop();
      }
    }
  }, [isSongPlaybackActive, isMeasurePlaybackActive, playbackTimeline, transportState.bpm]);

  const handleBpmChange = useCallback((nextBpm) => {
    if (!Number.isFinite(nextBpm)) return;
    transportRef.current?.setBpm(nextBpm);
  }, []);

  const handleImportFile = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === "string") {
        setImportedXmlSource(text);
        setSelectedEventId(null);
        setSelectedMeasureContext(null);
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be re-imported if needed
    event.target.value = "";
  }, []);

  const handleSelectScoreEvent = useCallback(
    (tatNodeId, options = null) => {
      setSelectedEventId(tatNodeId);
      const selectedEntry = semanticBridgeRef.current?.byTatNodeId?.get(tatNodeId);
      const partId = selectedEntry?.sourceRef?.partId;
      const measureNumber = selectedEntry?.sourceRef?.measureNumber;
      if (partId && typeof measureNumber === "number") {
        setSelectedMeasureContext((previous) =>
          previous?.partId === partId &&
          previous?.measureNumber === measureNumber &&
          previous?.voice === (selectedEntry?.sourceRef?.voice ?? null)
            ? previous
            : {
                partId,
                measureNumber,
                voice: selectedEntry?.sourceRef?.voice ?? null,
              },
        );
      }
      if (
        measureResultsForSelectedSegmentRef.current.some(
          (result) => result.noteId === tatNodeId,
        )
      ) {
        setActiveInspectedEvaluationNoteId(tatNodeId);
      }

      if (!options || typeof options !== "object") return;

      // Prefer structured pitch data from the overlay target, with text fallback.
      const parsedPitch =
        parsedPitchToNote(options.pitch ?? null) ??
        (typeof options.pitchText === "string"
          ? parsePitchText(options.pitchText)
          : null);
      if (!parsedPitch) return;

      void notePlayerRef.current?.playNote(parsedPitch);
    },
    [],
  );

  const handleSelectMeasure = useCallback((partId, measureNumber) => {
    if (!partId || typeof measureNumber !== "number") return;

    if (
      selectedMeasureContext?.partId === partId &&
      selectedMeasureContext?.measureNumber === measureNumber
    ) {
      const targetId = readSelectedMeasureDefaultTargetId(graph, {
        partId,
        measureNumber,
      });
      if (targetId) {
        setSelectedEventId(targetId);
      }
      return;
    }

    setSelectedMeasureContext({
      partId,
      measureNumber,
    });
  }, [graph, selectedMeasureContext]);

  const handleSegmentStartMeasureChange = useCallback(
    (nextValue) => {
      if (!segmentMeasureBounds) return;
      const nextStart = clampNumber(
        nextValue,
        segmentMeasureBounds.min,
        segmentMeasureBounds.max,
        segmentMeasureBounds.min,
      );

      setSegmentStartMeasure(nextStart);
      setSegmentEndMeasure((previousEnd) => Math.max(nextStart, previousEnd));
    },
    [segmentMeasureBounds],
  );

  const handleSegmentEndMeasureChange = useCallback(
    (nextValue) => {
      if (!segmentMeasureBounds) return;
      const nextEnd = clampNumber(
        nextValue,
        segmentMeasureBounds.min,
        segmentMeasureBounds.max,
        segmentMeasureBounds.max,
      );

      setSegmentEndMeasure(nextEnd);
      setSegmentStartMeasure((previousStart) => Math.min(nextEnd, previousStart));
    },
    [segmentMeasureBounds],
  );

  const handlePlaySelectedSegment = useCallback(async () => {
    if (isMeasurePlaybackActive) return;

    const selectedSegment = selectedSegmentForPlayback;
    const timeline = playbackTimeline;
    const notePlayer = notePlayerRef.current;

    if (!selectedSegment || !timeline || !notePlayer) return;

    const playbackEvents = buildSegmentPlaybackEvents({
      timeline,
      selection: selectedSegment,
      bpm: transportState.bpm,
      activeEventIds: activePracticeEventIds,
    });

    const playableEventCount = playbackEvents.filter(
      (event) => event.kind === "note" && event.pitch && event.noteId,
    ).length;
    if (!playableEventCount) {
      console.info(
        `No playable pitches in ${selectedSegment.partId} measures ${selectedSegment.startMeasureNumber}-${selectedSegment.endMeasureNumber}.`,
      );
      return;
    }

    const runId = measurePlaybackRunIdRef.current + 1;
    measurePlaybackRunIdRef.current = runId;
    setIsMeasurePlaybackActive(true);
    setActiveMeasurePlaybackNoteId(null);
    let segmentRafId = null;

    try {
      const selectedMeasures = timeline.measures
        .filter(
          (measure) =>
            measure.partId === selectedSegment.partId &&
            activePracticeMeasureNumbers.includes(measure.measureNumber),
        )
        .sort((a, b) => a.measureStartTicks - b.measureStartTicks);
      const segmentStartTick =
        selectedMeasures[0]?.measureStartTicks ??
        playbackEvents[0]?.startTicks ??
        0;
      const segmentEndTick =
        selectedMeasures[selectedMeasures.length - 1]?.measureEndTicks ??
        playbackEvents.reduce(
          (maxTick, event) =>
            Math.max(maxTick, (event.startTicks ?? 0) + (event.durationTicks ?? 0)),
          segmentStartTick,
        );
      const segmentStartTimeMs = performance.now();
      const updateSegmentVisualTick = () => {
        if (measurePlaybackRunIdRef.current !== runId) return;
        const elapsedMs = performance.now() - segmentStartTimeMs;
        const elapsedTicks = millisecondsToTicks(elapsedMs, transportState.bpm, timeline.ppq);
        const nextTick = Math.min(
          segmentEndTick,
          Math.max(segmentStartTick, segmentStartTick + elapsedTicks),
        );
        setSegmentVisualTick(nextTick);
        segmentRafId = requestAnimationFrame(updateSegmentVisualTick);
      };
      setSegmentVisualTick(segmentStartTick);
      segmentRafId = requestAnimationFrame(updateSegmentVisualTick);

      // Shared visual timeline runner for measure-play and evaluate flows.
      await runMeasureEventTimeline({
        events: playbackEvents,
        startTimeMs: segmentStartTimeMs,
        isCancelled: () => measurePlaybackRunIdRef.current !== runId,
        onEventStart: async (event) => {
          if (event.kind !== "note" || !event.pitch || !event.noteId) {
            setActiveMeasurePlaybackNoteId(null);
            return;
          }

          setActiveMeasurePlaybackNoteId(event.noteId);
          await notePlayer.playNote(event.pitch, { durationMs: event.durationMs });
        },
        onComplete: () => {
          setActiveMeasurePlaybackNoteId(null);
        },
      });
    } finally {
      if (segmentRafId !== null) {
        cancelAnimationFrame(segmentRafId);
      }
      setSegmentVisualTick(null);
      if (measurePlaybackRunIdRef.current === runId) {
        setIsMeasurePlaybackActive(false);
        setActiveMeasurePlaybackNoteId(null);
      }
    }
  }, [
    activePracticeEventIds,
    activePracticeMeasureNumbers,
    isMeasurePlaybackActive,
    playbackTimeline,
    selectedSegmentForPlayback,
    transportState.bpm,
  ]);

  const handleEvaluateSelectedSegment = useCallback(async () => {
    if (isMeasureEvaluationActive) return;

    const selectedSegment = selectedSegmentForPlayback;
    const timeline = playbackTimeline;
    const notePlayer = notePlayerRef.current;
    if (!selectedSegment || !timeline || !notePlayer) return;

    const measureSequence = buildSegmentNoteSequence({
      timeline,
      selection: selectedSegment,
      bpm: transportState.bpm,
      activeNoteIds: activePracticeNoteIds,
    });

    setActiveInspectedEvaluationNoteId(null);
    setMeasureEvaluationResults([]);
    setMeasureEvaluationDebug(null);

    if (!measureSequence.length) {
      console.info(
        `No playable expected notes in ${selectedSegment.partId} measures ${selectedSegment.startMeasureNumber}-${selectedSegment.endMeasureNumber}.`,
      );
      return;
    }

    const measureMeta = timeline.measures.find(
      (measure) =>
        measure.partId === selectedSegment.partId &&
        measure.measureNumber === selectedSegment.startMeasureNumber,
    );
    const playbackEvents = buildSegmentPlaybackEvents({
      timeline,
      selection: selectedSegment,
      bpm: transportState.bpm,
      activeEventIds: activePracticeEventIds,
    });

    const beatDurationMs =
      typeof measureMeta?.beatTicks === "number" && measureMeta.beatTicks > 0
        ? ticksToMilliseconds(measureMeta.beatTicks, transportState.bpm, timeline.ppq)
        : Number.isFinite(transportState.bpm) && transportState.bpm > 0
          ? 60_000 / transportState.bpm
          : 500;

    const expectedNotes = normalizeExpectedTimeline({
      notes: measureSequence,
      bpm: transportState.bpm,
      ppq: timeline.ppq,
    });
    if (!expectedNotes.length) {
      console.info(
        `No expected pitch data available in ${selectedSegment.partId} measures ${selectedSegment.startMeasureNumber}-${selectedSegment.endMeasureNumber}.`,
      );
      return;
    }

    const selectionKey = `${selectedSegment.partId}::m${selectedSegment.startMeasureNumber}-${selectedSegment.endMeasureNumber}`;
    const measureStartPitch = getMeasureStartingPitch(measureSequence);
    const countInBeats = 4;
    let listener = null;
    let segmentRafId = null;
    setIsMeasureEvaluationActive(true);
    try {
      await playCountIn(notePlayer, {
        beatDurationMs,
        beats: countInBeats,
        baseFrequencyHz: measureStartPitch?.frequencyHz,
      });

      if (selectedSegmentKeyRef.current !== selectionKey) {
        return;
      }

      let evaluationStartTimeMs = 0;
      const performedFrames = [];
      listener = createPitchListener({
        quietnessThresholdDb: Math.max(
          REST_QUIETNESS_THRESHOLD_DB,
          REATTACK_READY_THRESHOLD_DB,
        ),
        minValidPitchHz: MIN_VALID_PITCH_HZ,
        onPitch: () => {},
        onNoPitch: () => {},
        onAnalysis: ({ detectedHz, clarity, rmsDb, hasStablePitch, isQuiet }) => {
          if (evaluationStartTimeMs <= 0) return;
          performedFrames.push({
            timeMs: performance.now() - evaluationStartTimeMs,
            detectedHz,
            clarity,
            rmsDb,
            hasStablePitch,
            isQuiet,
          });
        },
      });

      const expectedTotalMs =
        expectedNotes[expectedNotes.length - 1].expectedOnsetMs +
        (measureSequence[measureSequence.length - 1]?.durationMs ?? 300);
      const captureDurationMs = Math.max(900, Math.round(expectedTotalMs + 650));

      await listener.start();
      evaluationStartTimeMs = performance.now();
      const runId = measurePlaybackRunIdRef.current + 1;
      measurePlaybackRunIdRef.current = runId;
      const selectedMeasures = timeline.measures
        .filter(
          (measure) =>
            measure.partId === selectedSegment.partId &&
            activePracticeMeasureNumbers.includes(measure.measureNumber),
        )
        .sort((a, b) => a.measureStartTicks - b.measureStartTicks);
      const segmentStartTick =
        selectedMeasures[0]?.measureStartTicks ??
        playbackEvents[0]?.startTicks ??
        0;
      const segmentEndTick =
        selectedMeasures[selectedMeasures.length - 1]?.measureEndTicks ??
        playbackEvents.reduce(
          (maxTick, event) =>
            Math.max(maxTick, (event.startTicks ?? 0) + (event.durationTicks ?? 0)),
          segmentStartTick,
        );
      const updateSegmentVisualTick = () => {
        if (measurePlaybackRunIdRef.current !== runId) return;
        const elapsedMs = performance.now() - evaluationStartTimeMs;
        const elapsedTicks = millisecondsToTicks(elapsedMs, transportState.bpm, timeline.ppq);
        const nextTick = Math.min(
          segmentEndTick,
          Math.max(segmentStartTick, segmentStartTick + elapsedTicks),
        );
        setSegmentVisualTick(nextTick);
        segmentRafId = requestAnimationFrame(updateSegmentVisualTick);
      };
      setSegmentVisualTick(segmentStartTick);
      segmentRafId = requestAnimationFrame(updateSegmentVisualTick);

      // Evaluate flow starts this shared runner immediately after prep audio.
      // That means highlight time zero aligns with expected singing time zero.
      const highlightPromise = runMeasureEventTimeline({
        events: playbackEvents,
        startTimeMs: evaluationStartTimeMs,
        isCancelled: () => measurePlaybackRunIdRef.current !== runId,
        onEventStart: (event) => {
          if (event.kind !== "note" || !event.noteId) {
            setActiveMeasurePlaybackNoteId(null);
            return;
          }
          setActiveMeasurePlaybackNoteId(event.noteId);
        },
        onComplete: () => {
          setActiveMeasurePlaybackNoteId(null);
        },
      });

      await delay(captureDurationMs);
      await listener.stop();
      await highlightPromise;

      if (selectedSegmentKeyRef.current !== selectionKey) {
        return;
      }

      const performedNotes = extractPerformedNotes(performedFrames);
      const { evaluations, debug } = evaluateMeasurePerformanceDetailed({
        selectionKey,
        expectedNotes,
        performedNotes,
        beatDurationMs,
      });

      setMeasureEvaluationResults(evaluations);
      setMeasureEvaluationDebug(debug);
      const firstEvaluatedNoteId = evaluations[0]?.noteId ?? null;
      setActiveInspectedEvaluationNoteId(firstEvaluatedNoteId);
      if (firstEvaluatedNoteId) {
        setSelectedEventId(firstEvaluatedNoteId);
      }
    } catch (error) {
      console.error("Measure evaluation failed", error);
      setMeasureEvaluationResults([]);
      setMeasureEvaluationDebug(null);
      setActiveMeasurePlaybackNoteId(null);
      try {
        await listener?.stop();
      } catch {
        // Ignore shutdown failures.
      }
    } finally {
      if (segmentRafId !== null) {
        cancelAnimationFrame(segmentRafId);
      }
      setSegmentVisualTick(null);
      setActiveMeasurePlaybackNoteId(null);
      setIsMeasureEvaluationActive(false);
    }
  }, [
    activePracticeEventIds,
    activePracticeMeasureNumbers,
    activePracticeNoteIds,
    isMeasureEvaluationActive,
    playbackTimeline,
    selectedSegmentForPlayback,
    transportState.bpm,
  ]);

  const handleScoreRerender = useCallback(() => {
    // Preserve completed evaluation results across score rerenders.
  }, []);

  const resetEvaluationStateForTarget = useCallback(
    (nextTarget, keepListening) => {
      restWindowRef.current = createEmptyRestWindowState();

      const requiresFreshAttack = nextTarget?.tatNodeId
        ? isRepeatedPitchTarget({
            practiceMode: practiceModeRef.current,
            measurePractice: measurePracticeRef.current,
            semanticBridge: semanticBridgeRef.current,
            tatNodeId: nextTarget.tatNodeId,
          })
        : false;

      const gate = createRepeatedPitchGateState(requiresFreshAttack);
      repeatedPitchGateRef.current = gate;
      setRepeatedPitchGate(gate);

      setPitchEvaluation(
        evaluateActiveTarget({
          activeTarget: nextTarget ?? null,
          detectedHz: keepListening ? undefined : null,
          isListening: keepListening,
          toleranceCents: EVAL_TOLERANCE_CENTS,
          restSnapshot: restWindowRef.current,
          restMinWindowMs: REST_MIN_WINDOW_MS,
        }),
      );
    },
    [],
  );

  const activeTargetWithEvaluation = useMemo(() => {
    if (!activeTarget?.target) return activeTarget;

    const evaluation = noteEvaluationsByNodeId[activeTarget.target.id];
    if (!evaluation) return activeTarget;

    return {
      ...activeTarget,
      target: {
        ...activeTarget.target,
        state: {
          ...activeTarget.target.state,
          correct: evaluation.correct,
          needsReview: evaluation.needsReview,
        },
        observed: {
          ...activeTarget.target.observed,
          pitch:
            typeof evaluation.detectedPitchHz === "number"
              ? `${evaluation.detectedPitchHz.toFixed(2)} Hz`
              : activeTarget.target.observed.pitch,
        },
        evaluation: {
          evaluated: evaluation.evaluated,
          centError: evaluation.centError,
          detectedPitchHz: evaluation.detectedPitchHz,
        },
      },
    };
  }, [activeTarget, noteEvaluationsByNodeId]);

  const measureResultsForSelectedSegment = useMemo(() => {
    if (!selectedSegmentKey) return [];
    return measureEvaluationResults.filter(
      (result) => result.selectionKey === selectedSegmentKey,
    );
  }, [measureEvaluationResults, selectedSegmentKey]);
  measureResultsForSelectedSegmentRef.current = measureResultsForSelectedSegment;

  const evaluatedEventsForInspection = useMemo(
    () =>
      measureResultsForSelectedSegment
        .filter((result) => typeof result.noteId === "string" && result.noteId.length > 0)
        .map((result) => ({
          noteId: result.noteId,
          result,
        })),
    [measureResultsForSelectedSegment],
  );

  useEffect(() => {
    if (!evaluatedEventsForInspection.length) {
      setActiveInspectedEvaluationNoteId(null);
      return;
    }

    const hasCurrentActive = evaluatedEventsForInspection.some(
      (event) => event.noteId === activeInspectedEvaluationNoteId,
    );
    if (hasCurrentActive) return;

    setActiveInspectedEvaluationNoteId(evaluatedEventsForInspection[0].noteId);
  }, [activeInspectedEvaluationNoteId, evaluatedEventsForInspection]);

  const activeInspectedEventIndex = useMemo(() => {
    if (!evaluatedEventsForInspection.length) return -1;
    if (!activeInspectedEvaluationNoteId) return 0;

    const index = evaluatedEventsForInspection.findIndex(
      (event) => event.noteId === activeInspectedEvaluationNoteId,
    );
    return index >= 0 ? index : 0;
  }, [activeInspectedEvaluationNoteId, evaluatedEventsForInspection]);

  const activeInspectedMeasureResult =
    activeInspectedEventIndex >= 0
      ? evaluatedEventsForInspection[activeInspectedEventIndex]?.result ?? null
      : null;

  const handleInspectPreviousEvaluationEvent = useCallback(() => {
    if (activeInspectedEventIndex <= 0) return;
    const previousEvent = evaluatedEventsForInspection[activeInspectedEventIndex - 1];
    if (!previousEvent?.noteId) return;

    setActiveInspectedEvaluationNoteId(previousEvent.noteId);
    setSelectedEventId(previousEvent.noteId);
  }, [activeInspectedEventIndex, evaluatedEventsForInspection]);

  const handleInspectNextEvaluationEvent = useCallback(() => {
    if (activeInspectedEventIndex < 0) return;
    if (activeInspectedEventIndex >= evaluatedEventsForInspection.length - 1) return;

    const nextEvent = evaluatedEventsForInspection[activeInspectedEventIndex + 1];
    if (!nextEvent?.noteId) return;

    setActiveInspectedEvaluationNoteId(nextEvent.noteId);
    setSelectedEventId(nextEvent.noteId);
  }, [activeInspectedEventIndex, evaluatedEventsForInspection]);

  const evaluationSummaryForDisplay = useMemo(() => {
    const inspectedNoteId =
      activeInspectedMeasureResult?.noteId ??
      activeInspectedEvaluationNoteId ??
      selectedEventId ??
      null;
    const activeMeasureResult = activeInspectedMeasureResult;
    const activePitchEval =
      inspectedNoteId && noteEvaluationsByNodeId[inspectedNoteId]
        ? noteEvaluationsByNodeId[inspectedNoteId]
        : null;
    const inspectedBridgeEntry =
      inspectedNoteId && semanticBridge?.byTatNodeId
        ? semanticBridge.byTatNodeId.get(inspectedNoteId) ?? null
        : null;
    const expectedDebugNote =
      inspectedNoteId && measureEvaluationDebug?.expectedNotes?.length
        ? measureEvaluationDebug.expectedNotes.find(
            (note) => note.noteId === inspectedNoteId,
          ) ?? null
        : null;

    const pitchSummary = summarizePitchScore({
      measureResults: measureResultsForSelectedSegment,
      noteEvaluationsByNodeId,
    });
    const rhythmSummary = summarizeRhythmScore(measureResultsForSelectedSegment);
    const expectedRhythmLabel =
      getExpectedRhythmLabelFromGraph(graph, inspectedNoteId) ??
      getExpectedRhythmLabelFromDurationMs(
        expectedDebugNote?.expectedDurationMs,
        transportState.bpm,
      );
    const observedPitchLabel = classifyObservedPitchLabel({
      expectedPitchHz: activeMeasureResult?.expectedPitchHz ?? null,
      observedPitchHz: activeMeasureResult?.matchedPerformedPitch ?? null,
      pitchCorrect: activeMeasureResult?.pitchCorrect,
    });
    const observedRhythmLabel = classifyObservedRhythmLabel({
      expectedOnsetMs: activeMeasureResult?.expectedOnsetMs ?? null,
      observedOnsetMs: activeMeasureResult?.matchedPerformedOnsetMs ?? null,
      rhythmCorrect: activeMeasureResult?.rhythmCorrect,
    });

    return {
      ...evaluationSummary,
      targetId: inspectedNoteId ?? evaluationSummary?.targetId ?? null,
      status: {
        ...(evaluationSummary?.status ?? {}),
        correct:
          activeMeasureResult
            ? activeMeasureResult.pitchCorrect && activeMeasureResult.rhythmCorrect
            : activePitchEval?.correct ?? evaluationSummary?.status?.correct,
        needsReview:
          activeMeasureResult
            ? !(activeMeasureResult.pitchCorrect && activeMeasureResult.rhythmCorrect)
            : activePitchEval?.needsReview ?? evaluationSummary?.status?.needsReview,
        progression:
          activeTargetWithEvaluation?.target?.state?.progression ??
          evaluationSummary?.status?.progression ??
          null,
      },
      comparison: {
        ...(evaluationSummary?.comparison ?? {}),
        expectedPitch:
          inspectedBridgeEntry?.pitchText ??
          activeTargetWithEvaluation?.target?.expected?.pitch ??
          evaluationSummary?.comparison?.expectedPitch ??
          null,
        observedPitch:
          observedPitchLabel ??
          classifyObservedPitchLabel({
            expectedPitchHz: activeMeasureResult?.expectedPitchHz ?? null,
            observedPitchHz: activePitchEval?.detectedPitchHz ?? null,
            pitchCorrect: activePitchEval?.correct,
          }) ??
          evaluationSummary?.comparison?.observedPitch ??
          null,
        expectedRhythm:
          expectedRhythmLabel ??
          formatRhythmTypeLabel(activeTargetWithEvaluation?.target?.expected?.rhythm) ??
          evaluationSummary?.comparison?.expectedRhythm ??
          null,
        observedRhythm:
          observedRhythmLabel ??
          evaluationSummary?.comparison?.observedRhythm ??
          null,
      },
      scores: {
        pitchScorePercent: pitchSummary,
        rhythmScorePercent: rhythmSummary,
      },
      inspection: {
        index: activeInspectedEventIndex >= 0 ? activeInspectedEventIndex : null,
        total: evaluatedEventsForInspection.length,
      },
    };
  }, [
    activeInspectedEvaluationNoteId,
    activeInspectedEventIndex,
    activeInspectedMeasureResult,
    activeTargetWithEvaluation,
    evaluationSummary,
    evaluatedEventsForInspection.length,
    graph,
    measureEvaluationDebug,
    measureResultsForSelectedSegment,
    noteEvaluationsByNodeId,
    semanticBridge,
    selectedEventId,
    transportState.bpm,
  ]);

  const stopListening = useCallback(async () => {
    if (pitchListenerRef.current) {
      await pitchListenerRef.current.stop();
      pitchListenerRef.current = null;
    }

    setIsListening(false);
    processedTargetIdRef.current = null;
    resetEvaluationStateForTarget(activePitchTargetRef.current, false);
  }, [resetEvaluationStateForTarget]);

  const handleCorrectEvaluation = useCallback((tatNodeId) => {
    if (practiceModeRef.current !== "measure") return;
    const session = measurePracticeRef.current;
    if (!session || session.completed) return;

    const currentId = session.noteSequence[session.currentIndex];
    if (currentId !== tatNodeId) return;

    if (session.currentIndex < session.noteSequence.length - 1) {
      const nextIndex = session.currentIndex + 1;
      const nextTatNodeId = session.noteSequence[nextIndex];
      const nextSession = {
        ...session,
        currentIndex: nextIndex,
      };
      measurePracticeRef.current = nextSession;

      setMeasurePractice((prev) => {
        if (!prev) return prev;
        if (
          prev.partId !== session.partId ||
          prev.measureNumber !== session.measureNumber ||
          prev.practiceVoice !== session.practiceVoice
        ) {
          return prev;
        }
        return {
          ...nextSession,
        };
      });

      setSelectedEventId(nextTatNodeId);
      return;
    }

    const measureKey = makeMeasureKey(
      session.partId,
      session.measureNumber,
      session.practiceVoice,
    );
    setMeasureCompletionsByKey((prev) => ({
      ...prev,
      [measureKey]: true,
    }));

    const nextMeasureNumber = getNextMeasureNumberWithNotes(
      semanticBridge,
      session.partId,
      session.measureNumber,
      session.practiceVoice,
    );

    if (typeof nextMeasureNumber === "number") {
      setSelectedMeasureContext({
        partId: session.partId,
        measureNumber: nextMeasureNumber,
        voice: session.practiceVoice,
      });
      return;
    }

    const completedSession = {
      ...session,
      completed: true,
    };
    measurePracticeRef.current = completedSession;
    setMeasurePractice((prev) => {
      if (!prev) return prev;
      if (
        prev.partId !== session.partId ||
        prev.measureNumber !== session.measureNumber ||
        prev.practiceVoice !== session.practiceVoice
      ) {
        return prev;
      }
      return completedSession;
    });
  }, [semanticBridge]);

  const startListening = useCallback(async () => {
    const currentTarget = activePitchTargetRef.current;
    if (!currentTarget) return;

    await stopListening();

    setIsListening(true);
    processedTargetIdRef.current = currentTarget.tatNodeId;
    resetEvaluationStateForTarget(currentTarget, true);

    const listener = createPitchListener({
      quietnessThresholdDb: Math.max(
        REST_QUIETNESS_THRESHOLD_DB,
        REATTACK_READY_THRESHOLD_DB,
      ),
      minValidPitchHz: MIN_VALID_PITCH_HZ,
      onPitch: () => {},
      onNoPitch: () => {},
      onAnalysis: ({ detectedHz, isQuiet, hasStablePitch, rmsDb }) => {
        const liveTarget = activePitchTargetRef.current;
        if (!liveTarget) return;
        if (processedTargetIdRef.current !== liveTarget.tatNodeId) {
          processedTargetIdRef.current = liveTarget.tatNodeId;
          resetEvaluationStateForTarget(liveTarget, true);
        }

        restWindowRef.current = advanceRestWindow(
          restWindowRef.current,
          isQuiet,
          hasStablePitch,
          detectedHz,
        );

        const result = evaluateActiveTarget({
          activeTarget: liveTarget,
          isListening: true,
          detectedHz,
          toleranceCents: EVAL_TOLERANCE_CENTS,
          restSnapshot: restWindowRef.current,
          restMinWindowMs: REST_MIN_WINDOW_MS,
        });

        const nextGate = advanceRepeatedPitchGate(
          repeatedPitchGateRef.current,
          liveTarget.targetType,
          rmsDb,
          REATTACK_READY_THRESHOLD_DB,
          REATTACK_ATTACK_THRESHOLD_DB,
        );
        repeatedPitchGateRef.current = nextGate;
        setRepeatedPitchGate((prev) =>
          prev.phase === nextGate.phase &&
          prev.hasFreshAttack === nextGate.hasFreshAttack &&
          prev.requiresFreshAttack === nextGate.requiresFreshAttack
            ? prev
            : nextGate,
        );

        const blockedByReattack =
          liveTarget.targetType === "note" &&
          nextGate.requiresFreshAttack &&
          !nextGate.hasFreshAttack &&
          result.status === "correct";
        const displayResult = blockedByReattack
          ? {
              ...result,
              inTune: false,
              status: "listening",
            }
          : result;

        setPitchEvaluation(displayResult);
        setNoteEvaluationsByNodeId((prev) => ({
          ...prev,
          [liveTarget.tatNodeId]: {
            evaluated: true,
            correct: displayResult.status === "correct",
            needsReview: displayResult.status === "review",
            centError: displayResult.centError,
            detectedPitchHz: displayResult.detectedHz,
          },
        }));

        if (
          isTargetCompleted({
            targetType: liveTarget.targetType,
            evaluationStatus: displayResult.status,
            repeatedPitchGate: nextGate,
          })
        ) {
          handleCorrectEvaluation(liveTarget.tatNodeId);
        }
      },
    });

    pitchListenerRef.current = listener;

    try {
      await listener.start();
    } catch (error) {
      await stopListening();
      console.error("Pitch listener failed to start", error);
    }
  }, [handleCorrectEvaluation, resetEvaluationStateForTarget, stopListening]);

  useEffect(() => {
    if (!selectedMeasureDefaultTargetId) return;

    handleSelectScoreEvent(selectedMeasureDefaultTargetId);
  }, [handleSelectScoreEvent, selectedMeasureDefaultTargetId]);

  useEffect(() => {
    if (selectedEventId) return;
    if (!initialDefaultTargetId) return;

    handleSelectScoreEvent(initialDefaultTargetId);
  }, [handleSelectScoreEvent, initialDefaultTargetId, selectedEventId]);

  useEffect(() => {
    measurePlaybackRunIdRef.current += 1;
    setActiveMeasurePlaybackNoteId(null);
    setIsMeasurePlaybackActive(false);
    setSegmentVisualTick(null);
  }, [selectedSegmentKey]);

  useEffect(() => {
    if (!semanticBridge || !selectedEventId || practiceMode !== "measure") {
      setMeasurePractice(null);
      return;
    }

    const selectedEntry = semanticBridge.byTatNodeId.get(selectedEventId);
    if (!selectedEntry) {
      setMeasurePractice(null);
      return;
    }

    const { partId, measureNumber } = selectedEntry.sourceRef;
    const practiceVoice = selectedEntry.sourceRef.voice;
    const noteSequence = readOrderedMeasurePracticeNoteIds(graph, {
      partId,
      measureNumber,
      voice: practiceVoice,
    });

    if (!noteSequence.length) {
      setMeasurePractice(null);
      return;
    }

    const currentIndex = Math.max(0, noteSequence.indexOf(selectedEventId));
    const measureKey = makeMeasureKey(partId, measureNumber, practiceVoice);
    const completed = measureCompletionsByKey[measureKey] === true;

    setMeasurePractice((prev) => {
      if (
        prev &&
        prev.partId === partId &&
        prev.measureNumber === measureNumber &&
        prev.practiceVoice === practiceVoice &&
        prev.currentIndex === currentIndex &&
        prev.completed === completed &&
        prev.noteSequence.length === noteSequence.length &&
        prev.noteSequence.every((id, i) => id === noteSequence[i])
      ) {
        return prev;
      }

      return {
        partId,
        measureNumber,
        practiceVoice,
        noteSequence,
        currentIndex,
        completed,
      };
    });
  }, [graph, practiceMode, semanticBridge, selectedEventId, measureCompletionsByKey]);

  useEffect(() => {
    const targetId = activePitchTarget?.tatNodeId ?? null;
    if (!targetId) {
      const idleGate = createRepeatedPitchGateState(false);
      repeatedPitchGateRef.current = idleGate;
      setRepeatedPitchGate(idleGate);
      return;
    }

    const requiresFreshAttack = isRepeatedPitchTarget({
      practiceMode,
      measurePractice,
      semanticBridge,
      tatNodeId: targetId,
    });

    const nextGate = createRepeatedPitchGateState(requiresFreshAttack);
    repeatedPitchGateRef.current = nextGate;
    setRepeatedPitchGate(nextGate);
  }, [activePitchTarget?.tatNodeId, measurePractice, practiceMode, semanticBridge]);

  useEffect(() => {
    const targetId = activePitchTarget?.tatNodeId ?? null;
    const previousTargetId = previousTargetIdRef.current;

    if (!activePitchTarget) {
      if (pitchListenerRef.current) {
        stopListening();
      }
      processedTargetIdRef.current = null;
      setPitchEvaluation(EMPTY_PITCH_EVALUATION);
      previousTargetIdRef.current = null;
      return;
    }

    if (
      practiceMode === "single-note" &&
      previousTargetId &&
      previousTargetId !== targetId &&
      pitchListenerRef.current
    ) {
      stopListening();
      return;
    }

    const keepListening = practiceMode === "measure" && isListeningRef.current;
    if (previousTargetId !== targetId) {
      processedTargetIdRef.current = targetId;
      resetEvaluationStateForTarget(activePitchTarget, keepListening);
      previousTargetIdRef.current = targetId;
      return;
    }

    setPitchEvaluation(
      evaluateActiveTarget({
        activeTarget: activePitchTarget,
        detectedHz: keepListening ? undefined : null,
        isListening: keepListening,
        toleranceCents: EVAL_TOLERANCE_CENTS,
        restSnapshot: restWindowRef.current,
        restMinWindowMs: REST_MIN_WINDOW_MS,
      }),
    );

    previousTargetIdRef.current = targetId;
  }, [activePitchTarget, practiceMode, resetEvaluationStateForTarget, stopListening]);

  useEffect(() => () => {
    if (pitchListenerRef.current) {
      pitchListenerRef.current.stop();
      pitchListenerRef.current = null;
    }
  }, []);

  return (
    <main className="app-shell">
      <header className="app-header">
        <img className="app-logo" src={scoreLensLogo} alt="ScoreLens" />

        <div className="app-controls">
          <button
            type="button"
            className="import-score-button"
            onClick={() => fileInputRef.current?.click()}
          >
            Import Score
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".musicxml,.xml,.mxl"
            style={{ display: "none" }}
            onChange={handleImportFile}
          />
          <button
            type="button"
            className="debug-toggle"
            onClick={() => setShowDebug((prev) => !prev)}
          >
            {showDebug ? "Hide Debug" : "Show Debug"}
          </button>
        </div>
      </header>

      {error ? (
        <section className="panel">
          <h2>Runtime Error</h2>
          <pre>{JSON.stringify({ message: error }, null, 2)}</pre>
        </section>
      ) : (
        <section className="workspace-grid">
          <div className="workspace-left">
            {displayRunResult?.mode === "musicxml" && displayRunResult?.xmlSource ? (
              <OsmdScorePanel
                xmlSource={displayRunResult.xmlSource}
                title={displayRunResult?.scoreTitle ?? "Imported Score"}
                semanticBridge={semanticBridge}
                selectedEventId={selectedEventId}
                playbackEventIds={visualPlaybackEvents.map((event) => event.nodeId)}
                playbackMeasureNumber={visualPlaybackMeasure?.measureNumber ?? null}
                playbackMeasureTiming={
                  visualPlaybackMeasure
                    ? {
                        measureStartTicks: visualPlaybackMeasure.measureStartTicks,
                        measureDurationTicks: visualPlaybackMeasure.measureDurationTicks,
                      }
                    : null
                }
                playbackCurrentTick={visualPlaybackTick}
                playbackIsPlaying={transportState.isPlaying || isSegmentTransportActive}
                overlayTargets={overlayTargets}
                noteEvaluationsByNodeId={noteEvaluationsByNodeId}
                onSelectEvent={handleSelectScoreEvent}
                onSelectMeasure={handleSelectMeasure}
                canPlaySong={Boolean(playbackTimeline)}
                isSongPlaybackActive={isSongPlaybackActive}
                onPlaySong={handlePlaySong}
                onStopSong={handleStop}
                canPlaySelectedSegment={Boolean(selectedSegmentForPlayback)}
                isMeasurePlaybackActive={isMeasurePlaybackActive}
                activeMeasurePlaybackNoteId={activeMeasurePlaybackNoteId}
                onPlaySelectedSegment={handlePlaySelectedSegment}
                canEvaluateSelectedSegment={
                  Boolean(selectedSegmentForPlayback) && !isListening
                }
                isMeasureEvaluationActive={isMeasureEvaluationActive}
                evaluationMarkersByNodeId={evaluationMarkersByNodeId}
                measureCorrectByNodeId={measureCorrectByNodeId}
                activeInspectedEvaluationNoteId={activeInspectedEvaluationNoteId}
                onEvaluateSelectedSegment={handleEvaluateSelectedSegment}
                segmentStartMeasure={
                  selectedSegmentForPlayback?.startMeasureNumber ?? null
                }
                segmentEndMeasure={
                  selectedSegmentForPlayback?.endMeasureNumber ?? null
                }
                activePracticeNoteIds={activePracticeNoteIds}
                activePracticeMeasureNumbers={activePracticeMeasureNumbers}
                segmentMeasureMin={segmentMeasureBounds?.min ?? null}
                segmentMeasureMax={segmentMeasureBounds?.max ?? null}
                onSegmentStartMeasureChange={handleSegmentStartMeasureChange}
                onSegmentEndMeasureChange={handleSegmentEndMeasureChange}
                onScoreRerender={handleScoreRerender}
                measureEvaluationDebug={measureEvaluationDebug}
              />
            ) : null}
          </div>

          <div className="workspace-right">
            <PlaybackControlPanel
              isPlaying={transportState.isPlaying}
              bpm={transportState.bpm}
              currentTick={transportState.currentTick}
              totalDurationTicks={playbackTimeline?.totalDurationTicks ?? 0}
              currentEvent={currentPlaybackEvents[0] ?? null}
              currentMeasure={currentPlaybackMeasure}
              activeEventCount={currentPlaybackEvents.length}
              onBpmChange={handleBpmChange}
            />
            <ActiveTargetPanel
              activeTarget={activeTargetWithEvaluation}
              activePitchTarget={activePitchTarget}
              pitchEvaluation={pitchEvaluation}
              repeatedPitchGate={repeatedPitchGate}
              practiceMode={practiceMode}
              onPracticeModeChange={setPracticeMode}
              measurePractice={measurePractice}
              isListening={isListening}
              onStartListening={startListening}
              onStopListening={stopListening}
            />
            <EvaluationSummaryPanel
              evaluationSummary={evaluationSummaryForDisplay}
              onInspectPrevious={handleInspectPreviousEvaluationEvent}
              onInspectNext={handleInspectNextEvaluationEvent}
              canInspectPrevious={activeInspectedEventIndex > 0}
              canInspectNext={
                activeInspectedEventIndex >= 0 &&
                activeInspectedEventIndex < evaluatedEventsForInspection.length - 1
              }
              inspectedPositionLabel={
                activeInspectedEventIndex >= 0 && evaluatedEventsForInspection.length > 0
                  ? `${activeInspectedEventIndex + 1} / ${evaluatedEventsForInspection.length}`
                  : "—"
              }
            />
            <NextActionPanel nextAction={nextAction} />
          </div>
        </section>
      )}

      {showDebug ? (
        <section className="debug-section">

          {displayRunResult?.generatedTatSource ? (
            <JsonPanel
            title="Generated TAT Source"
            data={displayRunResult.generatedTatSource}
            isText
            />
          ) : null}

          <JsonPanel
            title="Semantic Bridge"
            data={
              semanticBridge
              ? {
                bySourceKey: Object.fromEntries(semanticBridge.bySourceKey),
                byTatNodeId: Object.fromEntries(semanticBridge.byTatNodeId),
              }
              : null
            }
          />

          <JsonPanel title="Overlay Targets" data={overlayTargets ?? null} />

          <JsonPanel title="Graphs" data={displayOutput?.debug?.graphs ?? null} />
          <JsonPanel
            title="Projections"
            data={displayOutput?.debug?.projections ?? null}
          />
          <JsonPanel title="Bindings" data={displayOutput?.debug?.bindings ?? null} />
          <JsonPanel title="AST" data={displayOutput?.ast ?? null} />
          <JsonPanel title="Validation" data={displayOutput?.validation ?? null} />
          <JsonPanel
              title={
              displayRunResult?.mode === "musicxml" ? "MusicXML Source" : "Source"
            }
            data={displayRunResult?.source ?? null}
            isText
          />
        </section>
      ) : null}
    </main>
  );
}

function JsonPanel({ title, data, isText = false }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <pre>{isText ? String(data) : JSON.stringify(data, null, 2)}</pre>
    </section>
  );
}

export default App;

function makeMeasureKey(partId, measureNumber, practiceVoice) {
  return `${partId}::m${measureNumber}::v${practiceVoice}`;
}

function getNextMeasureNumberWithNotes(
  semanticBridge,
  partId,
  currentMeasureNumber,
  practiceVoice,
) {
  if (!semanticBridge?.bySourceKey) return null;

  const measureNumbers = new Set();
  for (const entry of semanticBridge.bySourceKey.values()) {
    if (
      entry.sourceRef.partId === partId &&
      entry.sourceRef.voice === practiceVoice &&
      entry.sourceRef.measureNumber > currentMeasureNumber
    ) {
      measureNumbers.add(entry.sourceRef.measureNumber);
    }
  }

  if (measureNumbers.size === 0) return null;
  return Math.min(...measureNumbers);
}

function createEmptyRestWindowState() {
  return {
    startedAtMs: performance.now(),
    lastFrameAtMs: null,
    quietRunMs: 0,
    sampleCount: 0,
    quietFrameCount: 0,
    stablePitchDetected: false,
    latestDetectedHz: null,
    windowMs: 0,
    quietFrameRatio: 0,
  };
}

function advanceRestWindow(previousState, isQuiet, hasStablePitch, detectedHz) {
  const now = performance.now();
  const startedAtMs = previousState.startedAtMs ?? now;
  const lastFrameAtMs = previousState.lastFrameAtMs ?? now;
  const frameDeltaMs = Math.max(0, now - lastFrameAtMs);
  const sampleCount = previousState.sampleCount + 1;
  const quietFrameCount = previousState.quietFrameCount + (isQuiet ? 1 : 0);
  const quietRunMs = isQuiet ? (previousState.quietRunMs ?? 0) + frameDeltaMs : 0;

  return {
    startedAtMs,
    lastFrameAtMs: now,
    quietRunMs,
    sampleCount,
    quietFrameCount,
    stablePitchDetected: previousState.stablePitchDetected || hasStablePitch,
    latestDetectedHz:
      typeof detectedHz === "number" && Number.isFinite(detectedHz)
        ? detectedHz
        : previousState.latestDetectedHz,
    windowMs: Math.max(0, now - startedAtMs),
    quietFrameRatio: quietFrameCount / Math.max(1, sampleCount),
  };
}

function createRepeatedPitchGateState(requiresFreshAttack) {
  if (!requiresFreshAttack) {
    return {
      requiresFreshAttack: false,
      hasFreshAttack: true,
      phase: "not-required",
    };
  }

  return {
    requiresFreshAttack: true,
    hasFreshAttack: false,
    phase: "waiting-ready",
  };
}

function advanceRepeatedPitchGate(
  gateState,
  targetType,
  rmsDb,
  readyThresholdDb,
  attackThresholdDb,
) {
  if (!gateState.requiresFreshAttack || targetType !== "note") {
    return gateState;
  }

  if (gateState.hasFreshAttack) {
    return gateState;
  }

  if (gateState.phase === "waiting-ready") {
    if (rmsDb <= readyThresholdDb) {
      return {
        ...gateState,
        phase: "waiting-attack",
      };
    }
    return gateState;
  }

  if (gateState.phase === "waiting-attack") {
    if (rmsDb >= attackThresholdDb) {
      return {
        ...gateState,
        hasFreshAttack: true,
        phase: "ready",
      };
    }
  }

  return gateState;
}

function isRepeatedPitchTarget({
  practiceMode,
  measurePractice,
  semanticBridge,
  tatNodeId,
}) {
  if (practiceMode !== "measure") return false;
  if (!measurePractice || !semanticBridge?.byTatNodeId) return false;

  const sequence = measurePractice.noteSequence;
  const currentIndex = sequence.indexOf(tatNodeId);
  if (currentIndex <= 0) return false;

  const currentEntry = semanticBridge.byTatNodeId.get(tatNodeId);
  const previousEntry = semanticBridge.byTatNodeId.get(sequence[currentIndex - 1]);

  if (!currentEntry || !previousEntry) return false;
  if (currentEntry.kind !== "note" || previousEntry.kind !== "note") return false;

  const currentPitch = normalizePitchText(currentEntry.pitchText);
  const previousPitch = normalizePitchText(previousEntry.pitchText);
  if (!currentPitch || !previousPitch) return false;

  return currentPitch === previousPitch;
}

function normalizePitchText(pitchText) {
  return typeof pitchText === "string" ? pitchText.trim().toUpperCase() : null;
}

function isTargetCompleted({ targetType, evaluationStatus, repeatedPitchGate }) {
  if (evaluationStatus !== "correct") return false;
  if (targetType !== "note") return true;

  if (!repeatedPitchGate?.requiresFreshAttack) return true;
  return repeatedPitchGate.hasFreshAttack === true;
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, milliseconds));
  });
}

function clampNumber(value, min, max, fallback) {
  const candidate = Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(candidate, min), max);
}

function summarizePitchScore({ measureResults, noteEvaluationsByNodeId }) {
  if (Array.isArray(measureResults) && measureResults.length > 0) {
    const evaluatedCount = measureResults.filter(
      (result) => typeof result.pitchCorrect === "boolean",
    ).length;
    if (evaluatedCount === 0) return null;

    const correctCount = measureResults.filter((result) => result.pitchCorrect).length;
    return (correctCount / evaluatedCount) * 100;
  }

  const noteEvaluations = Object.values(noteEvaluationsByNodeId ?? {});
  const evaluatedCount = noteEvaluations.filter(
    (evaluation) => typeof evaluation.correct === "boolean",
  ).length;
  if (evaluatedCount === 0) return null;

  const correctCount = noteEvaluations.filter((evaluation) => evaluation.correct).length;
  return (correctCount / evaluatedCount) * 100;
}

function summarizeRhythmScore(measureResults) {
  if (!Array.isArray(measureResults) || measureResults.length === 0) return null;

  const evaluatedCount = measureResults.filter(
    (result) => typeof result.rhythmCorrect === "boolean",
  ).length;
  if (evaluatedCount === 0) return null;

  const correctCount = measureResults.filter((result) => result.rhythmCorrect).length;
  return (correctCount / evaluatedCount) * 100;
}

function classifyObservedPitchLabel({
  expectedPitchHz,
  observedPitchHz,
  pitchCorrect,
}) {
  if (!Number.isFinite(expectedPitchHz) || !Number.isFinite(observedPitchHz)) {
    return null;
  }
  if (pitchCorrect === true) return "Correct";
  return observedPitchHz < expectedPitchHz ? "Too Low" : "Too High";
}

function classifyObservedRhythmLabel({
  expectedOnsetMs,
  observedOnsetMs,
  rhythmCorrect,
}) {
  if (!Number.isFinite(expectedOnsetMs) || !Number.isFinite(observedOnsetMs)) {
    return null;
  }
  if (rhythmCorrect === true) return "Correct";
  return observedOnsetMs < expectedOnsetMs ? "Too Early" : "Too Late";
}

function getExpectedRhythmLabelFromGraph(graph, noteId) {
  if (!graph || !noteId) return null;

  const rhythmEdge = graph.edges.find(
    (edge) =>
      edge.kind === "branch" &&
      edge.subject === noteId &&
      edge.relation === "hasRhythm",
  );
  if (!rhythmEdge) return null;

  const rhythmNode = graph.nodes.get(rhythmEdge.object);
  if (!rhythmNode || !isRecordValue(rhythmNode.value)) return null;

  const type = typeof rhythmNode.value.type === "string" ? rhythmNode.value.type : null;
  const dots = Number.isFinite(rhythmNode.value.dots)
    ? rhythmNode.value.dots
    : 0;

  return formatRhythmTypeLabel(type, dots);
}

function getExpectedRhythmLabelFromDurationMs(durationMs, bpm) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;

  const quarterMs =
    Number.isFinite(bpm) && bpm > 0 ? 60_000 / bpm : 500;
  const ratio = durationMs / quarterMs;
  const candidates = [
    { ratio: 4, label: "Whole Note" },
    { ratio: 3, label: "Dotted Half Note" },
    { ratio: 2, label: "Half Note" },
    { ratio: 1.5, label: "Dotted Quarter Note" },
    { ratio: 1, label: "Quarter Note" },
    { ratio: 0.75, label: "Dotted Eighth Note" },
    { ratio: 0.5, label: "Eighth Note" },
    { ratio: 0.375, label: "Dotted Sixteenth Note" },
    { ratio: 0.25, label: "Sixteenth Note" },
  ];

  let nearest = candidates[0];
  let smallestDelta = Math.abs(ratio - candidates[0].ratio);
  for (let index = 1; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const delta = Math.abs(ratio - candidate.ratio);
    if (delta < smallestDelta) {
      smallestDelta = delta;
      nearest = candidate;
    }
  }

  return nearest.label;
}

function formatRhythmTypeLabel(type, dots = 0) {
  if (typeof type !== "string" || type.trim().length === 0) return null;

  const normalized = type.trim().toLowerCase();
  const baseLabels = {
    whole: "Whole Note",
    half: "Half Note",
    quarter: "Quarter Note",
    eighth: "Eighth Note",
    "8th": "Eighth Note",
    sixteenth: "Sixteenth Note",
    "16th": "Sixteenth Note",
    thirtysecond: "Thirty-second Note",
    "32nd": "Thirty-second Note",
  };
  const baseLabel = baseLabels[normalized] ?? toTitleWords(normalized);
  if (!Number.isFinite(dots) || dots <= 0) return baseLabel;

  return `Dotted ${baseLabel}`;
}

function toTitleWords(text) {
  return text
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function isRecordValue(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
