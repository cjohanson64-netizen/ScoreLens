export default function NextActionPanel({ nextAction }) {
  if (!nextAction || !nextAction.targetId) {
    return (
      <section className="panel">
        <h2>Next Action</h2>
        <p>No next action available.</p>
      </section>
    );
  }

  const controls = nextAction.teacherControls;

  return (
    <section className="panel">
      <h2>Next Action</h2>

      <div className="next-action-grid">
        <div className="next-action-block">
          <h3>Decision</h3>
          <p>Progression: {nextAction.progression ?? "—"}</p>
          <p>Next Step: {nextAction.nextStep ?? "—"}</p>
          <p>Support Action: {nextAction.supportAction ?? "—"}</p>
        </div>

        <div className="next-action-block">
          <h3>Reason</h3>
          <p>{nextAction.decisionReason ?? "—"}</p>
        </div>

        <div className="next-action-block">
          <h3>Teacher Controls</h3>
          {controls ? (
            <>
              <p>Minimum Attempts: {formatMaybeNumber(controls.minimumAttempts)}</p>
              <p>Maximum Attempts: {formatMaybeNumber(controls.maximumAttempts)}</p>
              <p>Allow Move On: {formatMaybeBoolean(controls.allowMoveOn)}</p>
              <p>Allow Scaffold: {formatMaybeBoolean(controls.allowScaffold)}</p>
              <p>Allow Slow Down: {formatMaybeBoolean(controls.allowSlowDown)}</p>
              <p>
                Stop After Maximum Attempts:{" "}
                {formatMaybeBoolean(controls.stopAfterMaximumAttempts)}
              </p>
            </>
          ) : (
            <p>No teacher controls available.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function formatMaybeBoolean(value) {
  return typeof value === "boolean" ? String(value) : "—";
}

function formatMaybeNumber(value) {
  return typeof value === "number" ? String(value) : "—";
}