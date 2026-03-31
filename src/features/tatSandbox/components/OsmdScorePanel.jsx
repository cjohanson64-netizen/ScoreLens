import { useEffect, useId, useMemo, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

const CONTINUOUS_SCORE_WIDTH = 12000;
const SVG_TRIM_PADDING_PX = 50;
const SVG_TRIM_LEFT_EXTRA_PX = 90;
const SVG_TRIM_VERTICAL_EXTRA_PX = 20;

export default function OsmdScorePanel({
  xmlSource,
  title = "Rendered Score",
  semanticBridge = null,
  selectedEventId = null,
  playbackEventIds = [],
  playbackMeasureNumber = null,
  playbackMeasureTiming = null,
  playbackCurrentTick = 0,
  playbackIsPlaying = false,
  overlayTargets = null,
  noteEvaluationsByNodeId = {},
  canPlaySong = false,
  isSongPlaybackActive = false,
  onPlaySong,
  onStopSong,
  canPlaySelectedSegment = false,
  isMeasurePlaybackActive = false,
  activeMeasurePlaybackNoteId = null,
  onPlaySelectedSegment,
  canEvaluateSelectedSegment = false,
  isMeasureEvaluationActive = false,
  evaluationMarkersByNodeId = {},
  measureCorrectByNodeId = {},
  activeInspectedEvaluationNoteId = null,
  onEvaluateSelectedSegment,
  segmentStartMeasure = null,
  segmentEndMeasure = null,
  activePracticeNoteIds = [],
  activePracticeMeasureNumbers = [],
  segmentMeasureMin = null,
  segmentMeasureMax = null,
  onSegmentStartMeasureChange,
  onSegmentEndMeasureChange,
  onScoreRerender,
  onSelectEvent,
  onSelectMeasure,
}) {
  const scrollShellRef = useRef(null);
  const containerRef = useRef(null);
  const overlayLayerRef = useRef(null);
  const selectedOverlayRef = useRef(null);
  const selectedMeasureRef = useRef(null);
  const osmdRef = useRef(null);
  const svgClipPathId = `segment-clip-${useId().replace(/:/g, "")}`;
  const [renderError, setRenderError] = useState(null);
  const [overlayLayout, setOverlayLayout] = useState(null);
  const [startMeasureInput, setStartMeasureInput] = useState("");
  const [endMeasureInput, setEndMeasureInput] = useState("");
  const [isEditingStartMeasure, setIsEditingStartMeasure] = useState(false);
  const [isEditingEndMeasure, setIsEditingEndMeasure] = useState(false);

  const selectedBridgeEntry =
    selectedEventId && semanticBridge
      ? semanticBridge.byTatNodeId.get(selectedEventId) ?? null
      : null;

  const semanticEntriesByMeasure = useMemo(
    () => buildSemanticEntriesByMeasure(semanticBridge),
    [semanticBridge],
  );
  const playbackEventIdSet = useMemo(
    () => new Set(playbackEventIds),
    [playbackEventIds],
  );
  const isSegmentFlowActive = isMeasurePlaybackActive || isMeasureEvaluationActive;
  const activePracticeNoteIdSet = useMemo(
    () => new Set(activePracticeNoteIds),
    [activePracticeNoteIds],
  );
  const activePracticeMeasureNumberSet = useMemo(
    () => new Set(activePracticeMeasureNumbers),
    [activePracticeMeasureNumbers],
  );
  const isTransportActive =
    playbackIsPlaying || isMeasurePlaybackActive || isMeasureEvaluationActive;
  const transportMode = isMeasureEvaluationActive
    ? "evaluation"
    : isTransportActive
      ? "playback"
      : "idle";
  const activeTransportMeasureNumber = useMemo(() => {
    if (!overlayLayout?.allNoteOverlays?.length && !overlayLayout?.allMeasureBoxes?.length) {
      return typeof playbackMeasureNumber === "number" ? playbackMeasureNumber : null;
    }

    if (!isSegmentFlowActive && activeMeasurePlaybackNoteId && overlayLayout?.allNoteOverlays?.length) {
      const activeNote = overlayLayout.allNoteOverlays.find(
        (note) => note.tatNodeId === activeMeasurePlaybackNoteId,
      );
      if (activeNote?.measureNumber) return activeNote.measureNumber;
    }

    if (!playbackIsPlaying) return null;
    return typeof playbackMeasureNumber === "number" ? playbackMeasureNumber : null;
  }, [
    activeMeasurePlaybackNoteId,
    isSegmentFlowActive,
    overlayLayout,
    playbackIsPlaying,
    playbackMeasureNumber,
  ]);
  const playbackPlayheadLayout = useMemo(
    () =>
      buildTransportPlayheadLayout({
        overlayLayout,
        transportMode,
        playbackIsPlaying,
        preferTickPlayhead: isSegmentFlowActive,
        activeNoteId: activeMeasurePlaybackNoteId,
        playbackMeasureNumber,
        playbackMeasureTiming,
        currentTick: playbackCurrentTick,
      }),
    [
      activeMeasurePlaybackNoteId,
      overlayLayout,
      transportMode,
      playbackIsPlaying,
      isSegmentFlowActive,
      playbackMeasureNumber,
      playbackMeasureTiming,
      playbackCurrentTick,
    ],
  );
  const visibleMeasureBoxes = useMemo(() => {
    if (!overlayLayout?.allMeasureBoxes?.length) return [];
    if (activePracticeMeasureNumberSet.size > 0) {
      return overlayLayout.allMeasureBoxes.filter((box) =>
        activePracticeMeasureNumberSet.has(box.measureNumber),
      );
    }

    if (
      typeof segmentStartMeasure !== "number" ||
      typeof segmentEndMeasure !== "number"
    ) {
      return overlayLayout.allMeasureBoxes;
    }

    return overlayLayout.allMeasureBoxes.filter(
      (box) =>
        box.measureNumber >= segmentStartMeasure &&
        box.measureNumber <= segmentEndMeasure,
    );
  }, [
    activePracticeMeasureNumberSet,
    overlayLayout,
    segmentEndMeasure,
    segmentStartMeasure,
  ]);
  const visibleNoteOverlays = useMemo(() => {
    if (!overlayLayout?.allNoteOverlays?.length) return [];
    if (activePracticeNoteIdSet.size > 0) {
      return overlayLayout.allNoteOverlays.filter((target) =>
        activePracticeNoteIdSet.has(target.tatNodeId),
      );
    }

    if (
      typeof segmentStartMeasure !== "number" ||
      typeof segmentEndMeasure !== "number"
    ) {
      return overlayLayout.allNoteOverlays;
    }

    return overlayLayout.allNoteOverlays.filter(
      (target) =>
        target.measureNumber >= segmentStartMeasure &&
        target.measureNumber <= segmentEndMeasure,
    );
  }, [
    activePracticeNoteIdSet,
    overlayLayout,
    segmentEndMeasure,
    segmentStartMeasure,
  ]);
  const activeSegmentLabel =
    typeof segmentStartMeasure === "number" && typeof segmentEndMeasure === "number"
      ? `Segment: measures ${segmentStartMeasure}\u2013${segmentEndMeasure}`
      : "Segment: \u2014";

  const commitStartMeasureInput = () => {
    const parsed = Number.parseInt(startMeasureInput, 10);
    if (Number.isFinite(parsed)) {
      onSegmentStartMeasureChange?.(parsed);
    } else {
      setStartMeasureInput(
        typeof segmentStartMeasure === "number" ? String(segmentStartMeasure) : "",
      );
    }
    setIsEditingStartMeasure(false);
  };

  const commitEndMeasureInput = () => {
    const parsed = Number.parseInt(endMeasureInput, 10);
    if (Number.isFinite(parsed)) {
      onSegmentEndMeasureChange?.(parsed);
    } else {
      setEndMeasureInput(
        typeof segmentEndMeasure === "number" ? String(segmentEndMeasure) : "",
      );
    }
    setIsEditingEndMeasure(false);
  };

  useEffect(() => {
    if (!overlayLayout?.allMeasureBoxes?.length || !containerRef.current) return;

    const svg = containerRef.current.querySelector("svg");
    if (!(svg instanceof SVGSVGElement)) return;

    if (
      typeof segmentStartMeasure !== "number" ||
      typeof segmentEndMeasure !== "number"
    ) {
      svg.style.removeProperty("clip-path");
      return;
    }

    const clipId = svgClipPathId;
    let defs = svg.querySelector("defs");
    if (!(defs instanceof SVGDefsElement)) {
      defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      svg.insertBefore(defs, svg.firstChild);
    }

    let clipPath = defs.querySelector(`#${CSS.escape(clipId)}`);
    if (!(clipPath instanceof SVGClipPathElement)) {
      clipPath = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
      clipPath.setAttribute("id", clipId);
      defs.appendChild(clipPath);
    }

    while (clipPath.firstChild) {
      clipPath.removeChild(clipPath.firstChild);
    }

    const clipRects = buildRangeClipRects({
      measureBoxes: overlayLayout.allMeasureBoxes,
      startMeasure: segmentStartMeasure,
      endMeasure: segmentEndMeasure,
      includeSystemHeaders: segmentStartMeasure <= 1,
    });

    clipRects.forEach((clipRect) => {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", String(clipRect.x));
      rect.setAttribute("y", String(clipRect.y));
      rect.setAttribute("width", String(clipRect.width));
      rect.setAttribute("height", String(clipRect.height));
      clipPath.appendChild(rect);
    });

    svg.style.clipPath = `url(#${clipId})`;

    return () => {
      svg.style.removeProperty("clip-path");
    };
  }, [overlayLayout, segmentEndMeasure, segmentStartMeasure, svgClipPathId]);

  useEffect(() => {
    let isCancelled = false;

    async function renderScore() {
      if (!containerRef.current) return;

      if (!xmlSource || typeof xmlSource !== "string") {
        setRenderError("No MusicXML source provided.");
        setOverlayLayout(null);
        containerRef.current.innerHTML = "";
        return;
      }

      try {
        setRenderError(null);
        setOverlayLayout(null);
        containerRef.current.innerHTML = "";
        containerRef.current.style.width = `${CONTINUOUS_SCORE_WIDTH}px`;
        containerRef.current.style.minWidth = `${CONTINUOUS_SCORE_WIDTH}px`;

        if (!osmdRef.current) {
          osmdRef.current = new OpenSheetMusicDisplay(containerRef.current, {
            autoResize: false,
            backend: "svg",
            drawTitle: false,
            drawSubtitle: false,
            drawComposer: false,
            drawPartNames: true,
            followCursor: false,
          });
        } else {
          osmdRef.current.setOptions({
            autoResize: false,
            backend: "svg",
            drawTitle: false,
            drawSubtitle: false,
            drawComposer: false,
            drawPartNames: true,
            followCursor: false,
          });
        }

        await osmdRef.current.load(xmlSource);

        if (isCancelled) return;

        try {
          osmdRef.current.EngravingRules.NewPageAtXMLNewPageAttribute = false;
          osmdRef.current.EngravingRules.NewSystemAtXMLNewSystemAttribute = false;
          osmdRef.current.EngravingRules.RenderPartNames = true;
          osmdRef.current.EngravingRules.PageLeftMargin = 0;
          osmdRef.current.EngravingRules.PageRightMargin = 0;
          osmdRef.current.EngravingRules.SystemLeftMargin = 0;
          osmdRef.current.EngravingRules.SystemRightMargin = 0;
        } catch {
          // Safe fallback if OSMD internals vary
        }

        osmdRef.current.render();
        trimRenderedSvgWhitespace(containerRef.current, {
          left: SVG_TRIM_PADDING_PX + SVG_TRIM_LEFT_EXTRA_PX,
          right: SVG_TRIM_PADDING_PX,
          top: SVG_TRIM_PADDING_PX + SVG_TRIM_VERTICAL_EXTRA_PX,
          bottom: SVG_TRIM_PADDING_PX + SVG_TRIM_VERTICAL_EXTRA_PX,
        });

        requestAnimationFrame(() => {
          if (isCancelled || !containerRef.current) return;

          const layout = buildScoreOverlayLayout(
            containerRef.current,
            semanticEntriesByMeasure,
          );

          onScoreRerender?.();
          setOverlayLayout(layout);
        });
      } catch (error) {
        if (isCancelled) return;

        const message =
          error instanceof Error ? error.message : String(error);

        setRenderError(`OSMD render failed: ${message}`);
        setOverlayLayout(null);

        if (containerRef.current) {
          containerRef.current.innerHTML = "";
        }
      }
    }

    renderScore();

    return () => {
      isCancelled = true;
    };
  }, [xmlSource, semanticEntriesByMeasure, onScoreRerender]);

  useEffect(() => {
    if (isTransportActive) return;

    const scrollShell = scrollShellRef.current;
    const overlayLayer = overlayLayerRef.current;
    if (!scrollShell || !overlayLayer) return;

    const eventSelector = selectedEventId
      ? `[data-tat-node-id="${CSS.escape(selectedEventId)}"]`
      : ".osmd-overlay-target.is-selected";

    selectedOverlayRef.current = overlayLayer.querySelector(eventSelector);

    const selectedPartId = selectedBridgeEntry?.sourceRef?.partId ?? null;
    const selectedMeasureNumber =
      selectedBridgeEntry?.sourceRef?.measureNumber ??
      overlayTargets?.measureNumber ??
      null;

    if (selectedPartId && typeof selectedMeasureNumber === "number") {
      selectedMeasureRef.current = overlayLayer.querySelector(
        `[data-part-id="${CSS.escape(selectedPartId)}"][data-measure-number="${selectedMeasureNumber}"]`,
      );
    } else if (selectedMeasureNumber !== null && selectedMeasureNumber !== undefined) {
      selectedMeasureRef.current = overlayLayer.querySelector(
        `[data-measure-number="${selectedMeasureNumber}"]`,
      );
    } else {
      selectedMeasureRef.current = overlayLayer.querySelector(
        ".osmd-measure-box.is-selected",
      );
    }

    const focusTarget = selectedOverlayRef.current ?? selectedMeasureRef.current;
    if (!focusTarget) return;

    scrollElementIntoViewIfNeeded(scrollShell, focusTarget, {
      padding: 56,
      edgeThreshold: 24,
      behavior: "smooth",
    });
  }, [
    selectedEventId,
    overlayLayout,
    selectedBridgeEntry?.sourceKey,
    selectedBridgeEntry?.sourceRef?.partId,
    selectedBridgeEntry?.sourceRef?.measureNumber,
    overlayTargets?.measureNumber,
    isTransportActive,
  ]);

  useEffect(() => {
    if (!isTransportActive) return;

    const scrollShell = scrollShellRef.current;
    if (!scrollShell || !playbackPlayheadLayout) return;

    scrollPlaybackLineIntoComfortView(scrollShell, playbackPlayheadLayout, {
      behavior: "auto",
    });
  }, [
    isTransportActive,
    playbackPlayheadLayout,
  ]);

  return (
    <section className="panel">
      <h2>{title}</h2>

      <div className="osmd-overlay-controls">
        <div className="osmd-segment-controls">
          <label className="osmd-segment-control">
            <span>Start Measure</span>
            <input
              type="number"
              min={segmentMeasureMin ?? undefined}
              max={segmentMeasureMax ?? undefined}
              value={
                isEditingStartMeasure
                  ? startMeasureInput
                  : typeof segmentStartMeasure === "number"
                    ? String(segmentStartMeasure)
                    : ""
              }
              onFocus={() => {
                setIsEditingStartMeasure(true);
                setStartMeasureInput(
                  typeof segmentStartMeasure === "number"
                    ? String(segmentStartMeasure)
                    : "",
                );
              }}
              onChange={(event) => setStartMeasureInput(event.target.value)}
              onBlur={commitStartMeasureInput}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                commitStartMeasureInput();
              }}
              disabled={
                typeof segmentMeasureMin !== "number" ||
                typeof segmentMeasureMax !== "number"
              }
            />
          </label>
          <label className="osmd-segment-control">
            <span>End Measure</span>
            <input
              type="number"
              min={segmentMeasureMin ?? undefined}
              max={segmentMeasureMax ?? undefined}
              value={
                isEditingEndMeasure
                  ? endMeasureInput
                  : typeof segmentEndMeasure === "number"
                    ? String(segmentEndMeasure)
                    : ""
              }
              onFocus={() => {
                setIsEditingEndMeasure(true);
                setEndMeasureInput(
                  typeof segmentEndMeasure === "number"
                    ? String(segmentEndMeasure)
                    : "",
                );
              }}
              onChange={(event) => setEndMeasureInput(event.target.value)}
              onBlur={commitEndMeasureInput}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                commitEndMeasureInput();
              }}
              disabled={
                typeof segmentMeasureMin !== "number" ||
                typeof segmentMeasureMax !== "number"
              }
            />
          </label>
          <span className="osmd-segment-label">{activeSegmentLabel}</span>
        </div>
        <button
          type="button"
          className="playback-button"
          onClick={() => isSongPlaybackActive ? onStopSong?.() : onPlaySong?.()}
          disabled={!canPlaySong || isMeasurePlaybackActive || isMeasureEvaluationActive}
        >
          {isSongPlaybackActive ? "Stop Song" : "Play Song"}
        </button>
        <button
          type="button"
          className="playback-button"
          onClick={() => onPlaySelectedSegment?.()}
          disabled={!canPlaySelectedSegment || isMeasurePlaybackActive || isSongPlaybackActive}
        >
          {isMeasurePlaybackActive ? "Playing Segment..." : "Play Segment"}
        </button>
        <button
          type="button"
          className="playback-button"
          onClick={() => onEvaluateSelectedSegment?.()}
          disabled={!canEvaluateSelectedSegment || isMeasureEvaluationActive}
        >
          {isMeasureEvaluationActive ? "Evaluating..." : "Evaluate Segment"}
        </button>
      </div>

      {renderError ? (
        <div className="osmd-error">
          <p>{renderError}</p>
        </div>
      ) : null}

      <div ref={scrollShellRef} className="osmd-score-shell">
        <div className="osmd-overlay-stage">
          <div ref={containerRef} className="osmd-score-container" />

          <div
            ref={overlayLayerRef}
            className="osmd-overlay-layer"
            aria-hidden="false"
          >
            {visibleMeasureBoxes.map((box) => {
              const isSelected =
                selectedBridgeEntry &&
                selectedBridgeEntry.sourceRef.partId === box.partId &&
                selectedBridgeEntry.sourceRef.measureNumber === box.measureNumber;
              const isPlayback =
                isTransportActive &&
                typeof activeTransportMeasureNumber === "number" &&
                box.measureNumber === activeTransportMeasureNumber;

              return (
                <button
                  key={`measure-${box.partId}-${box.measureNumber}`}
                  type="button"
                  className={[
                    "osmd-measure-box",
                    isSelected ? "is-selected" : "",
                    isPlayback ? "is-playback" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{
                    left: `${box.left}px`,
                    top: `${box.top}px`,
                    width: `${box.width}px`,
                    height: `${box.height}px`,
                  }}
                  onClick={() => {
                    onSelectMeasure?.(box.partId, box.measureNumber);
                  }}
                  title={`${box.partId} · measure ${box.measureNumber}`}
                  data-part-id={box.partId}
                  data-measure-number={box.measureNumber}
                />
              );
            })}

            {isTransportActive && playbackPlayheadLayout ? (
              <div
                className="osmd-playhead-line"
                style={{
                  left: `${playbackPlayheadLayout.x}px`,
                  top: `${playbackPlayheadLayout.top}px`,
                  height: `${playbackPlayheadLayout.height}px`,
                }}
                aria-hidden="true"
              />
            ) : null}

            {visibleNoteOverlays.map((target) => {
              const isSelected = target.tatNodeId === selectedEventId;
              const isPlayback =
                isTransportActive && playbackEventIdSet.has(target.tatNodeId);
              const isMeasurePlaybackActiveNote =
                isTransportActive && target.tatNodeId === activeMeasurePlaybackNoteId;
              const isInspectedEvaluationNote =
                target.tatNodeId === activeInspectedEvaluationNoteId;
              const evaluation = noteEvaluationsByNodeId[target.tatNodeId];
              const isReview = evaluation?.needsReview === true;
              const isCorrect =
                evaluation?.correct === true ||
                measureCorrectByNodeId[target.tatNodeId] === true;
              const measureMarker = evaluationMarkersByNodeId[target.tatNodeId] ?? "";

              const className = [
                "osmd-overlay-target",
                isSelected ? "is-selected" : "",
                isPlayback ? "is-playback" : "",
                isMeasurePlaybackActiveNote ? "is-measure-playback-active" : "",
                isInspectedEvaluationNote ? "is-inspected-evaluation" : "",
                isReview ? "is-review" : "",
                isCorrect ? "is-correct" : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <div key={target.sourceKey}>
                  {measureMarker ? (
                    <span
                      className="osmd-eval-marker"
                      style={{
                        top: `${target.y - 14}px`,
                        left: `${target.x}px`,
                      }}
                      aria-hidden="true"
                    >
                      {measureMarker}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className={className}
                    style={{
                      top: `${target.y}px`,
                      left: `${target.x}px`,
                      zIndex: isSelected ? 4 : isPlayback ? 3 : 2,
                      transform: "translate(-50%, -50%)",
                    }}
                    onClick={() =>
                      onSelectEvent?.(target.tatNodeId, {
                        pitch: target.pitch ?? null,
                        pitchText: target.pitchText ?? null,
                      })}
                    title={formatOverlayTitle(target.sourceKey)}
                    data-source-key={target.sourceKey}
                    data-tat-node-id={target.tatNodeId}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function buildScoreOverlayLayout(root, semanticEntriesByMeasure) {
  const svg = root.querySelector("svg");
  if (!svg) return null;

  const svgRect = svg.getBoundingClientRect();
  const measureGroups = Array.from(svg.querySelectorAll("g.vf-measure"));

  if (!measureGroups.length) return null;

  const partIdsFromSemantic = Array.from(
    new Set(Array.from(semanticEntriesByMeasure.keys()).map((key) => key.split("::")[0])),
  );

  const orderedPartIds =
    partIdsFromSemantic.length > 0
      ? partIdsFromSemantic.sort((a, b) => getPartOrder(a) - getPartOrder(b))
      : ["P1", "P2", "P3", "P4"];
  const measureNumbersByPart = new Map(
    orderedPartIds.map((partId) => [
      partId,
      Array.from(semanticEntriesByMeasure.keys())
        .filter((key) => key.startsWith(`${partId}::`))
        .map((key) => Number.parseInt(key.split("::")[1], 10))
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b),
    ]),
  );

  const measuresWithRects = measureGroups.map((group) => {
    const rect =
      deriveMeasureStaffRect(group, svgRect) ??
      deriveSafeFallbackRect(group, svgRect) ??
      group.getBoundingClientRect();
    return {
      group,
      left: rect.left - svgRect.left,
      right: rect.right - svgRect.left,
      top: rect.top - svgRect.top,
      bottom: rect.bottom - svgRect.top,
      centerY: rect.top - svgRect.top + rect.height / 2,
    };
  });

  const rowClusters = clusterMeasureRows(measuresWithRects);

  rowClusters.forEach((row) => {
    row.sort((a, b) => a.left - b.left);

    // Snap each measure's left edge to its left neighbor's right edge.
    // This makes overlays extend continuously from barline to barline: the right
    // barline of measure N is the same physical position as the left barline of
    // measure N+1, so no gap or note-area offset remains.
    for (let i = 1; i < row.length; i++) {
      row[i].left = row[i - 1].right;
    }

    // The first measure in each system row has a clef / key sig / time sig block
    // to the left of the notes. Push the overlay's left edge to the right side of
    // that modifier area (effectively the end of the time signature) so the
    // hitbox covers only the note area, not the leading header elements.
    if (row.length > 0) {
      const modifierRight = getModifierAreaRight(row[0].group, svgRect);
      if (modifierRight !== null) {
        row[0].left = modifierRight;
      }
    }
  });

  rowClusters.sort(
    (a, b) =>
      average(a.map((item) => item.centerY)) - average(b.map((item) => item.centerY)),
  );

  const allMeasureBoxes = [];
  const allNoteOverlays = [];

  orderedPartIds.forEach((partId, partIndex) => {
    const row = rowClusters[partIndex] ?? [];
    const partMeasureNumbers = measureNumbersByPart.get(partId) ?? [];

    row.forEach((measureEntry, index) => {
      const measureNumber = partMeasureNumbers[index] ?? index + 1;
      const groupRect = measureEntry.group.getBoundingClientRect();
      const clipLeft = groupRect.left - svgRect.left;
      const clipTop = groupRect.top - svgRect.top;
      const clipWidth = Math.max(groupRect.width, 1);
      const clipHeight = Math.max(groupRect.height, 1);

      allMeasureBoxes.push({
        partId,
        measureNumber,
        left: measureEntry.left,
        top: measureEntry.top,
        width: Math.max(measureEntry.right - measureEntry.left, 1),
        height: Math.max(measureEntry.bottom - measureEntry.top, 1),
        groupElement: measureEntry.group,
        clipLeft,
        clipTop,
        clipWidth,
        clipHeight,
      });

      const semanticEntries =
        semanticEntriesByMeasure.get(makePartMeasureKey(partId, measureNumber)) ?? [];

      if (!semanticEntries.length) return;

      const anchoredNotes = Array.from(
        measureEntry.group.querySelectorAll("g.vf-stavenote"),
      )
        .map((noteGroup) => {
          const notehead = noteGroup.querySelector("g.vf-notehead");
          if (!notehead) return null;

          const noteheadRect = notehead.getBoundingClientRect();
          const stavenoteRect = noteGroup.getBoundingClientRect();

          return {
            x: noteheadRect.left - svgRect.left + noteheadRect.width / 2,
            y: noteheadRect.top - svgRect.top + noteheadRect.height / 2,
            sortLeft: stavenoteRect.left - svgRect.left,
            sortTop: stavenoteRect.top - svgRect.top,
          };
        })
        .filter((note) => note !== null)
        .sort((a, b) => {
          if (a.sortLeft !== b.sortLeft) return a.sortLeft - b.sortLeft;
          return a.sortTop - b.sortTop;
        });

      const overlayCount = Math.min(semanticEntries.length, anchoredNotes.length);

      for (let noteIndex = 0; noteIndex < overlayCount; noteIndex += 1) {
        const entry = semanticEntries[noteIndex];
        const anchor = anchoredNotes[noteIndex];

        allNoteOverlays.push({
          tatNodeId: entry.tatNodeId,
          sourceKey: entry.sourceKey,
          pitchText: entry.pitchText ?? null,
          partId: entry.sourceRef.partId,
          measureNumber: entry.sourceRef.measureNumber,
          voice: entry.sourceRef.voice,
          eventIndex: entry.sourceRef.eventIndex,
          chordIndex: entry.sourceRef.chordIndex,
          x: anchor.x,
          y: anchor.y,
        });
      }
    });
  });

  return {
    allMeasureBoxes,
    allNoteOverlays,
  };
}

function deriveMeasureStaffRect(measureGroup, svgRect) {
  // Build an exclusion set: connective elements (ties, slurs) and ALL of their
  // descendants. This prevents a cross-measure tie that is DOM-nested inside this
  // measure group from inflating the horizontal bounding rect, even when the tie
  // element happens to be a child of a stave group rather than a direct child of
  // the measure group.
  const excludedElements = buildConnectiveExclusionSet(measureGroup);

  const descendants = Array.from(measureGroup.querySelectorAll("*")).filter(
    (el) => !excludedElements.has(el),
  );

  const staffElements = descendants.filter((element) =>
    hasAnyClassToken(element, STAFF_CLASS_TOKENS),
  );
  const lineElements = descendants.filter((element) =>
    hasAnyClassToken(element, STAFF_LINE_CLASS_TOKENS),
  );
  const barlineElements = descendants.filter((element) =>
    hasAnyClassToken(element, BARLINE_CLASS_TOKENS),
  );

  const verticalSources = lineElements.length ? lineElements : staffElements;
  if (!verticalSources.length) return null;

  const verticalBounds = computeRelativeBounds(verticalSources, svgRect);
  if (!verticalBounds) return null;

  const horizontalSources = barlineElements.length
    ? [...verticalSources, ...barlineElements]
    : verticalSources;
  const horizontalBounds = computeRelativeBounds(horizontalSources, svgRect);
  if (!horizontalBounds) return null;

  return {
    left: horizontalBounds.left + svgRect.left,
    right: horizontalBounds.right + svgRect.left,
    top: verticalBounds.top + svgRect.top,
    bottom: verticalBounds.bottom + svgRect.top,
  };
}

// Returns a Set of every connective element (vf-stavetie, vf-curve) within
// measureGroup plus all of their DOM descendants. Used to exclude them from
// bounding-rect computations so cross-measure ties/slurs never inflate the
// local measure overlay.
function buildConnectiveExclusionSet(measureGroup) {
  const excluded = new Set();
  CONNECTIVE_CLASS_TOKENS.forEach((token) => {
    measureGroup.querySelectorAll(`.${token}, .${token} *`).forEach((el) => {
      excluded.add(el);
    });
  });
  return excluded;
}

// Returns the SVG-relative right edge of the leading stave modifiers (clef, key
// sig, time sig) inside measureGroup. Because the time signature is always the
// rightmost modifier, this equals the end of the time signature — the x position
// where the note area begins. Returns null when no modifier elements are found.
function getModifierAreaRight(measureGroup, svgRect) {
  const selector = STAVE_MODIFIER_CLASS_TOKENS.map((t) => `.${t}`).join(", ");
  const modifiers = Array.from(measureGroup.querySelectorAll(selector));
  if (!modifiers.length) return null;

  let maxRight = Number.NEGATIVE_INFINITY;
  modifiers.forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      maxRight = Math.max(maxRight, rect.right - svgRect.left);
    }
  });

  return Number.isFinite(maxRight) ? maxRight : null;
}

// Safe fallback when deriveMeasureStaffRect cannot find stave/line elements.
// Computes bounds from all descendants except connective graphics, so a
// cross-measure tie nested in this measure group cannot expand the result.
// Returns viewport-coordinate rect (same shape as getBoundingClientRect) or
// null if no usable elements are found.
function deriveSafeFallbackRect(measureGroup, svgRect) {
  const excluded = buildConnectiveExclusionSet(measureGroup);
  const elements = Array.from(measureGroup.querySelectorAll("*")).filter(
    (el) => !excluded.has(el),
  );
  const bounds = computeRelativeBounds(elements, svgRect);
  if (!bounds) return null;
  return {
    left: bounds.left + svgRect.left,
    right: bounds.right + svgRect.left,
    top: bounds.top + svgRect.top,
    bottom: bounds.bottom + svgRect.top,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
  };
}

function trimRenderedSvgWhitespace(root, padding = 0) {
  const svg = root.querySelector("svg");
  if (!svg) return;

  const boundingGroups = Array.from(
    svg.querySelectorAll("g.vf-system, g.vf-measure"),
  );
  if (!boundingGroups.length) return;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  boundingGroups.forEach((group) => {
    const box = group.getBBox();
    if (!Number.isFinite(box.x) || !Number.isFinite(box.y)) return;
    if (!Number.isFinite(box.width) || !Number.isFinite(box.height)) return;
    if (box.width <= 0 || box.height <= 0) return;

    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  });

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    return;
  }

  const resolvedPadding =
    typeof padding === "number"
      ? {
          left: Math.max(padding, 0),
          right: Math.max(padding, 0),
          top: Math.max(padding, 0),
          bottom: Math.max(padding, 0),
        }
      : {
          left: Math.max(padding.left ?? 0, 0),
          right: Math.max(padding.right ?? 0, 0),
          top: Math.max(padding.top ?? 0, 0),
          bottom: Math.max(padding.bottom ?? 0, 0),
        };

  const viewBoxX = minX - resolvedPadding.left;
  const viewBoxY = minY - resolvedPadding.top;
  const width = Math.max(
    maxX - minX + resolvedPadding.left + resolvedPadding.right,
    1,
  );
  const height = Math.max(
    maxY - minY + resolvedPadding.top + resolvedPadding.bottom,
    1,
  );

  svg.setAttribute("viewBox", `${viewBoxX} ${viewBoxY} ${width} ${height}`);
  svg.setAttribute("width", `${width}`);
  svg.setAttribute("height", `${height}`);

  root.style.width = `${width}px`;
  root.style.minWidth = `${width}px`;
}

function clusterMeasureRows(measures, tolerance = 28) {
  if (!measures.length) return [];

  const sorted = [...measures].sort((a, b) => a.centerY - b.centerY);
  const rows = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const lastRow = rows[rows.length - 1];
    const rowCenter = average(lastRow.map((item) => item.centerY));

    if (Math.abs(current.centerY - rowCenter) <= tolerance) {
      lastRow.push(current);
    } else {
      rows.push([current]);
    }
  }

  return rows;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function hasAnyClassToken(element, tokens) {
  if (!element?.classList) return false;
  return tokens.some((token) => element.classList.contains(token));
}

function computeRelativeBounds(elements, svgRect) {
  let minLeft = Number.POSITIVE_INFINITY;
  let minTop = Number.POSITIVE_INFINITY;
  let maxRight = Number.NEGATIVE_INFINITY;
  let maxBottom = Number.NEGATIVE_INFINITY;

  elements.forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return;
    if (!Number.isFinite(rect.right) || !Number.isFinite(rect.bottom)) return;
    if (rect.width <= 0 || rect.height <= 0) return;

    minLeft = Math.min(minLeft, rect.left - svgRect.left);
    minTop = Math.min(minTop, rect.top - svgRect.top);
    maxRight = Math.max(maxRight, rect.right - svgRect.left);
    maxBottom = Math.max(maxBottom, rect.bottom - svgRect.top);
  });

  if (
    !Number.isFinite(minLeft) ||
    !Number.isFinite(minTop) ||
    !Number.isFinite(maxRight) ||
    !Number.isFinite(maxBottom)
  ) {
    return null;
  }

  return {
    left: minLeft,
    top: minTop,
    right: maxRight,
    bottom: maxBottom,
  };
}

const STAFF_CLASS_TOKENS = ["vf-stave"];
const STAFF_LINE_CLASS_TOKENS = ["vf-staveline"];
const BARLINE_CLASS_TOKENS = ["vf-stavebarline", "vf-barline"];

// Elements that can span across barlines — must never inflate a measure's local bbox.
const CONNECTIVE_CLASS_TOKENS = ["vf-stavetie", "vf-curve"];

// Leading stave modifiers (clef, key sig, time sig). The time signature is always
// the rightmost of these, so the max right-edge of this set equals the end of the
// time signature — the point where the actual note area begins.
const STAVE_MODIFIER_CLASS_TOKENS = [
  "vf-clef",
  "vf-keysig",
  "vf-keysignature",
  "vf-timesig",
  "vf-timesignature",
  "vf-time-signature",
];

function getPartOrder(partId) {
  const normalized = String(partId).toUpperCase();

  if (normalized === "P1" || normalized === "S") return 0;
  if (normalized === "P2" || normalized === "A") return 1;
  if (normalized === "P3" || normalized === "T") return 2;
  if (normalized === "P4" || normalized === "B") return 3;

  const numeric = normalized.match(/^P(\d+)$/);
  if (numeric) return Number.parseInt(numeric[1], 10) - 1;

  return 0;
}

function formatOverlayTitle(sourceKey) {
  return `${sourceKey} · note`;
}

function buildSemanticEntriesByMeasure(semanticBridge) {
  const byMeasure = new Map();

  if (!semanticBridge?.bySourceKey) return byMeasure;

  for (const entry of semanticBridge.bySourceKey.values()) {
    const key = makePartMeasureKey(
      entry.sourceRef.partId,
      entry.sourceRef.measureNumber,
    );

    if (!byMeasure.has(key)) {
      byMeasure.set(key, []);
    }

    byMeasure.get(key).push(entry);
  }

  for (const entries of byMeasure.values()) {
    entries.sort(compareSemanticEntries);
  }

  return byMeasure;
}

const RANGE_CLIP_ROW_TOLERANCE_PX = 28;
const RANGE_CLIP_VERTICAL_PADDING_PX = 80;

function buildRangeClipRects({
  measureBoxes,
  startMeasure,
  endMeasure,
  includeSystemHeaders = false,
}) {
  if (!Array.isArray(measureBoxes) || !measureBoxes.length) return [];

  const selectedStart = Math.min(startMeasure, endMeasure);
  const selectedEnd = Math.max(startMeasure, endMeasure);
  const rowGroups = clusterMeasureOverlayRowsByCenterY(
    measureBoxes,
    RANGE_CLIP_ROW_TOLERANCE_PX,
  );

  return rowGroups
    .map((row) => {
      const inRange = row.filter(
        (box) =>
          box.measureNumber >= selectedStart && box.measureNumber <= selectedEnd,
      );
      if (!inRange.length) return null;

      const minX = Math.min(
        ...inRange.map((box) =>
          Number.isFinite(box.clipLeft) ? box.clipLeft : box.left,
        ),
      );
      const maxX = Math.max(
        ...inRange.map((box) => {
          const left = Number.isFinite(box.clipLeft) ? box.clipLeft : box.left;
          const width = Number.isFinite(box.clipWidth) ? box.clipWidth : box.width;
          return left + width;
        }),
      );
      const rowTop = Math.min(
        ...row.map((box) => (Number.isFinite(box.clipTop) ? box.clipTop : box.top)),
      );
      const rowBottom = Math.max(
        ...row.map((box) => {
          const top = Number.isFinite(box.clipTop) ? box.clipTop : box.top;
          const height = Number.isFinite(box.clipHeight) ? box.clipHeight : box.height;
          return top + height;
        }),
      );

      const clippedX = includeSystemHeaders ? 0 : minX;
      return {
        x: clippedX,
        y: Math.max(0, rowTop - RANGE_CLIP_VERTICAL_PADDING_PX),
        width: Math.max(1, maxX - clippedX),
        height: Math.max(
          1,
          rowBottom - rowTop + RANGE_CLIP_VERTICAL_PADDING_PX * 2,
        ),
      };
    })
    .filter((rect) => rect !== null);
}

function clusterMeasureOverlayRowsByCenterY(measureBoxes, tolerance = 28) {
  if (!measureBoxes.length) return [];

  const sortable = [...measureBoxes]
    .map((box) => ({
      ...box,
      _centerY:
        (Number.isFinite(box.clipTop) ? box.clipTop : box.top) +
        (Number.isFinite(box.clipHeight) ? box.clipHeight : box.height) / 2,
    }))
    .sort((a, b) => a._centerY - b._centerY);

  const rows = [[sortable[0]]];
  for (let index = 1; index < sortable.length; index += 1) {
    const current = sortable[index];
    const lastRow = rows[rows.length - 1];
    const rowCenter =
      lastRow.reduce((sum, entry) => sum + entry._centerY, 0) / lastRow.length;

    if (Math.abs(current._centerY - rowCenter) <= tolerance) {
      lastRow.push(current);
    } else {
      rows.push([current]);
    }
  }

  return rows.map((row) =>
    row.sort((a, b) => {
      const leftA = Number.isFinite(a.clipLeft) ? a.clipLeft : a.left;
      const leftB = Number.isFinite(b.clipLeft) ? b.clipLeft : b.left;
      return leftA - leftB;
    }),
  );
}

function makePartMeasureKey(partId, measureNumber) {
  return `${partId}::${measureNumber}`;
}

function compareSemanticEntries(a, b) {
  const voiceCompare = a.sourceRef.voice.localeCompare(
    b.sourceRef.voice,
    undefined,
    { numeric: true },
  );
  if (voiceCompare !== 0) return voiceCompare;

  const eventCompare = a.sourceRef.eventIndex - b.sourceRef.eventIndex;
  if (eventCompare !== 0) return eventCompare;

  return (a.sourceRef.chordIndex ?? 0) - (b.sourceRef.chordIndex ?? 0);
}

function buildTransportPlayheadLayout({
  overlayLayout,
  transportMode,
  playbackIsPlaying,
  preferTickPlayhead = false,
  activeNoteId,
  playbackMeasureNumber,
  playbackMeasureTiming,
  currentTick,
}) {
  if (!overlayLayout?.allMeasureBoxes?.length || transportMode === "idle") return null;

  if (
    !preferTickPlayhead &&
    activeNoteId &&
    overlayLayout?.allNoteOverlays?.length
  ) {
    const activeNote = overlayLayout.allNoteOverlays.find(
      (note) => note.tatNodeId === activeNoteId,
    );
    if (activeNote) {
      const measureBoxes = overlayLayout.allMeasureBoxes.filter(
        (box) => box.measureNumber === activeNote.measureNumber,
      );
      if (!measureBoxes.length) return null;

      const top = Math.min(...measureBoxes.map((box) => box.top));
      const bottom = Math.max(...measureBoxes.map((box) => box.top + box.height));
      return {
        x: activeNote.x,
        top,
        bottom,
        height: Math.max(bottom - top, 1),
        centerY: top + (bottom - top) / 2,
      };
    }
  }

  if (!playbackIsPlaying) return null;

  if (typeof playbackMeasureNumber !== "number" || !playbackMeasureTiming) {
    return null;
  }

  const measureBoxes = overlayLayout.allMeasureBoxes.filter(
    (box) => box.measureNumber === playbackMeasureNumber,
  );
  if (!measureBoxes.length) return null;

  const measureDuration = Math.max(playbackMeasureTiming.measureDurationTicks ?? 0, 1);
  const relativeTick = currentTick - (playbackMeasureTiming.measureStartTicks ?? 0);
  const progress = clamp(relativeTick / measureDuration, 0, 1);

  const anchors = measureBoxes.map((box) => ({
    x: box.left + box.width * progress,
    top: box.top,
    bottom: box.top + box.height,
  }));

  if (!anchors.length) return null;

  const x = average(anchors.map((anchor) => anchor.x));
  const top = Math.min(...anchors.map((anchor) => anchor.top));
  const bottom = Math.max(...anchors.map((anchor) => anchor.bottom));

  return {
    x,
    top,
    bottom,
    height: Math.max(bottom - top, 1),
    centerY: top + (bottom - top) / 2,
  };
}

function scrollPlaybackLineIntoComfortView(
  container,
  playheadLayout,
  { behavior = "auto" } = {},
) {
  const currentLeft = container.scrollLeft;
  const currentTop = container.scrollTop;
  const viewWidth = Math.max(container.clientWidth, 1);
  const viewHeight = Math.max(container.clientHeight, 1);

  const comfortLeft = currentLeft + viewWidth * 0.2;
  const comfortRight = currentLeft + viewWidth * 0.8;
  const comfortTop = currentTop + viewHeight * 0.2;
  const comfortBottom = currentTop + viewHeight * 0.8;

  let desiredLeft = currentLeft;
  let desiredTop = currentTop;

  if (playheadLayout.x < comfortLeft) {
    desiredLeft = playheadLayout.x - viewWidth * 0.35;
  } else if (playheadLayout.x > comfortRight) {
    desiredLeft = playheadLayout.x - viewWidth * 0.65;
  }

  if (playheadLayout.centerY < comfortTop) {
    desiredTop = playheadLayout.centerY - viewHeight * 0.35;
  } else if (playheadLayout.centerY > comfortBottom) {
    desiredTop = playheadLayout.centerY - viewHeight * 0.65;
  }

  const clampedLeft = clamp(
    desiredLeft,
    0,
    Math.max(container.scrollWidth - viewWidth, 0),
  );
  const clampedTop = clamp(
    desiredTop,
    0,
    Math.max(container.scrollHeight - viewHeight, 0),
  );

  if (
    Math.abs(clampedLeft - currentLeft) < 1 &&
    Math.abs(clampedTop - currentTop) < 1
  ) {
    return;
  }

  container.scrollTo({
    left: clampedLeft,
    top: clampedTop,
    behavior,
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function scrollElementIntoViewIfNeeded(
  container,
  element,
  { padding = 48, edgeThreshold = 20, behavior = "smooth" } = {},
) {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  const currentLeft = container.scrollLeft;
  const currentTop = container.scrollTop;

  const elementLeft = currentLeft + (elementRect.left - containerRect.left);
  const elementRight = elementLeft + elementRect.width;
  const elementTop = currentTop + (elementRect.top - containerRect.top);
  const elementBottom = elementTop + elementRect.height;

  const viewLeft = currentLeft;
  const viewRight = currentLeft + container.clientWidth;
  const viewTop = currentTop;
  const viewBottom = currentTop + container.clientHeight;

  let nextLeft = currentLeft;
  let nextTop = currentTop;

  if (elementLeft - padding < viewLeft + edgeThreshold) {
    nextLeft = elementLeft - padding;
  } else if (elementRight + padding > viewRight - edgeThreshold) {
    nextLeft = elementRight + padding - container.clientWidth;
  }

  if (elementTop - padding < viewTop + edgeThreshold) {
    nextTop = elementTop - padding;
  } else if (elementBottom + padding > viewBottom - edgeThreshold) {
    nextTop = elementBottom + padding - container.clientHeight;
  }

  const maxLeft = Math.max(container.scrollWidth - container.clientWidth, 0);
  const maxTop = Math.max(container.scrollHeight - container.clientHeight, 0);

  const clampedLeft = Math.min(Math.max(nextLeft, 0), maxLeft);
  const clampedTop = Math.min(Math.max(nextTop, 0), maxTop);

  if (
    Math.abs(clampedLeft - currentLeft) < 1 &&
    Math.abs(clampedTop - currentTop) < 1
  ) {
    return;
  }

  container.scrollTo({
    left: clampedLeft,
    top: clampedTop,
    behavior,
  });
}
