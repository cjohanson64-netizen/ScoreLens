export default function EvaluationSummaryPanel({
  evaluationSummary,
  onInspectPrevious,
  onInspectNext,
  canInspectPrevious = false,
  canInspectNext = false,
  inspectedPositionLabel = "—",
}) {
  if (!evaluationSummary || !evaluationSummary.targetId) {
    return (
      <section className="panel">
        <h2>Evaluation Summary</h2>
        <p>No evaluation summary available.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Evaluation Summary</h2>
      <div className="playback-controls-row" style={{ marginBottom: "10px" }}>
        <button
          type="button"
          className="playback-button"
          onClick={() => onInspectPrevious?.()}
          disabled={!canInspectPrevious}
        >
          Previous
        </button>
        <button
          type="button"
          className="playback-button"
          onClick={() => onInspectNext?.()}
          disabled={!canInspectNext}
        >
          Next
        </button>
        <p style={{ margin: "0", fontSize: "13px", color: "#cbd5e1" }}>
          Event: {inspectedPositionLabel}
        </p>
      </div>

      <div className="evaluation-grid">
        <div className="evaluation-block">
          <h3>Status</h3>
          <p>Correct: {formatMaybeBoolean(evaluationSummary.status.correct)}</p>
          <p>Needs Review: {formatMaybeBoolean(evaluationSummary.status.needsReview)}</p>
          <p>Progression: {evaluationSummary.status.progression ?? "—"}</p>
        </div>

        <div className="evaluation-block">
          <h3>Comparison</h3>
          <p>Expected Pitch: {evaluationSummary.comparison.expectedPitch ?? "—"}</p>
          <p>Observed Pitch: {evaluationSummary.comparison.observedPitch ?? "—"}</p>
          <p>Expected Rhythm: {evaluationSummary.comparison.expectedRhythm ?? "—"}</p>
          <p>Observed Rhythm: {evaluationSummary.comparison.observedRhythm ?? "—"}</p>
        </div>

        <div className="evaluation-block">
          <h3>Scores</h3>
          <p>
            Intonation:{" "}
            {formatPercent(evaluationSummary?.scores?.pitchScorePercent)}
          </p>
          <p>
            Rhythmic Accuracy:{" "}
            {formatPercent(evaluationSummary?.scores?.rhythmScorePercent)}
          </p>
        </div>

        <div className="evaluation-block">
          <h3>Feedback</h3>
          <p>{evaluationSummary.feedback ?? "—"}</p>
        </div>
      </div>

      <div className="evaluation-lists">
        <div className="evaluation-block">
          <h3>Diagnostics</h3>
          {evaluationSummary.diagnostics.length === 0 ? (
            <p>None</p>
          ) : (
            <ul className="evaluation-list">
              {evaluationSummary.diagnostics.map((diagnostic) => (
                <li key={diagnostic.name}>
                  <strong>{diagnostic.name}</strong>
                  {diagnostic.severity ? ` · ${diagnostic.severity}` : ""}
                  {typeof diagnostic.confidence === "number"
                    ? ` · confidence ${diagnostic.confidence}`
                    : ""}
                  {diagnostic.explanation ? (
                    <div className="evaluation-subtext">{diagnostic.explanation}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="evaluation-block">
          <h3>Goals</h3>
          {evaluationSummary.goals.length === 0 ? (
            <p>None</p>
          ) : (
            <ul className="evaluation-list">
              {evaluationSummary.goals.map((goal) => (
                <li key={goal.name}>
                  <strong>{goal.name}</strong>
                  {typeof goal.threshold === "number" ? ` · threshold ${goal.threshold}` : ""}
                  {typeof goal.met === "boolean" ? ` · met ${String(goal.met)}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function formatMaybeBoolean(value) {
  return typeof value === "boolean" ? String(value) : "—";
}

function formatPercent(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}%`;
}
