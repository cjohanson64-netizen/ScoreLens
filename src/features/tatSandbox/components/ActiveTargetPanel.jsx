export default function ActiveTargetPanel({
  activeTarget,
  activePitchTarget,
  pitchEvaluation,
  repeatedPitchGate,
  practiceMode = "single-note",
  onPracticeModeChange,
  measurePractice = null,
  isListening = false,
  onStartListening,
  onStopListening,
}) {
  const target = activeTarget?.target;

  if (!target) {
    return (
      <section className="panel">
        <h2>Active Target</h2>
        <p>No active target selected.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Active Target</h2>

      <div className="target-card">
        <div className="target-header">
          <h3>{target.label}</h3>
          <span className="target-kind">{target.kind}</span>
        </div>

        <div className="target-location">
          <span>{target.location.partId}</span>
          <span>m. {target.location.measureNumber}</span>
          {target.location.voice ? <span>voice {target.location.voice}</span> : null}
        </div>

        <div className="target-grid">
          <div className="target-block">
            <h4>Pitch Evaluation</h4>
            <div className="target-controls">
              <button
                type="button"
                className={[
                  "target-control-button",
                  practiceMode === "single-note" ? "is-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onPracticeModeChange?.("single-note")}
              >
                Single-Note Mode
              </button>
              <button
                type="button"
                className={[
                  "target-control-button",
                  practiceMode === "measure" ? "is-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onPracticeModeChange?.("measure")}
              >
                Measure Mode
              </button>
            </div>

            <p>Type: {activePitchTarget?.targetType === "rest" ? "Rest" : "Note"}</p>
            <p>Goal: {activePitchTarget?.goalText ?? "—"}</p>
            <p>Selected Pitch: {activePitchTarget?.pitchText ?? "—"}</p>
            <p>
              Target Hz:{" "}
              {activePitchTarget?.targetType === "rest"
                ? "—"
                : typeof activePitchTarget?.targetHz === "number"
                ? activePitchTarget.targetHz.toFixed(2)
                : "—"}
            </p>
            <p>
              Detected Hz:{" "}
              {typeof pitchEvaluation?.detectedHz === "number"
                ? pitchEvaluation.detectedHz.toFixed(2)
                : "—"}
            </p>
            <p>
              Cents Off:{" "}
              {typeof pitchEvaluation?.centError === "number"
                ? `${pitchEvaluation.centError > 0 ? "+" : ""}${pitchEvaluation.centError.toFixed(1)}`
                : "—"}
            </p>
            <p>Result: {formatStatus(pitchEvaluation?.status)}</p>
            {repeatedPitchGate?.requiresFreshAttack ? (
              <p>Repeated Note Gate: {formatRepeatedGatePhase(repeatedPitchGate.phase)}</p>
            ) : null}
            {practiceMode === "measure" ? (
              <p>
                Measure Progress:{" "}
                {measurePractice
                  ? `${Math.min(
                      measurePractice.currentIndex + (measurePractice.completed ? 1 : 0),
                      measurePractice.noteSequence.length,
                    )}/${measurePractice.noteSequence.length}${
                      measurePractice.completed ? " (complete)" : ""
                    }`
                  : "—"}
              </p>
            ) : null}

            <div className="target-controls">
              <button
                type="button"
                className="target-control-button"
                disabled={!activePitchTarget || isListening}
                onClick={() => onStartListening?.()}
              >
                {activePitchTarget?.targetType === "rest"
                  ? "Start Silence Listening"
                  : "Start Listening"}
              </button>
              <button
                type="button"
                className="target-control-button"
                disabled={!isListening}
                onClick={() => onStopListening?.()}
              >
                Stop
              </button>
            </div>
          </div>

          <div className="target-block">
            <h4>Expected</h4>
            <p>Pitch: {target.expected.pitch ?? "—"}</p>
            <p>Rhythm: {target.expected.rhythm ?? "—"}</p>
            <p>Lyric: {target.expected.lyric ?? "—"}</p>
          </div>

          <div className="target-block">
            <h4>Observed</h4>
            <p>Pitch: {target.observed.pitch ?? "—"}</p>
            <p>Rhythm: {target.observed.rhythm ?? "—"}</p>
          </div>

          <div className="target-block">
            <h4>Status</h4>
            <p>Selected: {String(target.state.selected)}</p>
            <p>Correct: {formatMaybeBoolean(target.state.correct)}</p>
            <p>Needs Review: {formatMaybeBoolean(target.state.needsReview)}</p>
            <p>Evaluated: {formatMaybeBoolean(target.evaluation?.evaluated)}</p>
            <p>
              Detected Pitch Hz:{" "}
              {typeof target.evaluation?.detectedPitchHz === "number"
                ? target.evaluation.detectedPitchHz.toFixed(2)
                : "—"}
            </p>
            <p>
              Cent Error:{" "}
              {typeof target.evaluation?.centError === "number"
                ? `${target.evaluation.centError > 0 ? "+" : ""}${target.evaluation.centError.toFixed(1)}`
                : "—"}
            </p>
            <p>Progression: {target.state.progression ?? "—"}</p>
            <p>Next Step: {target.state.nextStep ?? "—"}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function formatMaybeBoolean(value) {
  return typeof value === "boolean" ? String(value) : "—";
}

function formatStatus(status) {
  if (!status) return "—";
  return status;
}

function formatRepeatedGatePhase(phase) {
  if (phase === "waiting-ready") return "Waiting for release";
  if (phase === "waiting-attack") return "Waiting for new attack";
  if (phase === "ready") return "New attack detected";
  return "—";
}
