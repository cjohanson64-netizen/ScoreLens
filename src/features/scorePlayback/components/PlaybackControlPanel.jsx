import { useState } from "react";

export default function PlaybackControlPanel({
  isPlaying,
  bpm,
  currentTick,
  totalDurationTicks,
  currentEvent,
  currentMeasure,
  activeEventCount = 0,
  onBpmChange,
}) {
  const [bpmInput, setBpmInput] = useState("");
  const [isEditingBpm, setIsEditingBpm] = useState(false);

  const commitBpmInput = () => {
    const parsed = Number.parseInt(bpmInput, 10);
    if (Number.isFinite(parsed)) {
      onBpmChange?.(parsed);
    } else {
      setBpmInput(String(Math.round(bpm)));
    }
    setIsEditingBpm(false);
  };

  const tickPercent =
    totalDurationTicks > 0
      ? Math.min(100, Math.max(0, (currentTick / totalDurationTicks) * 100))
      : 0;

  return (
    <section className="panel">
      <h2>Playback</h2>

      <div className="playback-bpm-row">
        <label htmlFor="playback-bpm-input">BPM</label>
        <input
          id="playback-bpm-input"
          type="number"
          min="20"
          max="320"
          step="1"
          value={isEditingBpm ? bpmInput : String(Math.round(bpm))}
          onFocus={() => {
            setIsEditingBpm(true);
            setBpmInput(String(Math.round(bpm)));
          }}
          onChange={(event) => setBpmInput(event.target.value)}
          onBlur={commitBpmInput}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            commitBpmInput();
          }}
        />
      </div>

      <div className="playback-progress-shell" aria-label="Playback progress">
        <div
          className="playback-progress-fill"
          style={{ width: `${tickPercent}%` }}
        />
      </div>

      <div className="playback-meta-grid">
        <p>
          <strong>Status:</strong> {isPlaying ? "Playing" : "Stopped"}
        </p>
        <p>
          <strong>Tick:</strong> {Math.round(currentTick)} / {Math.round(totalDurationTicks)}
        </p>
        <p>
          <strong>Measure:</strong>{" "}
          {currentMeasure
            ? `${currentMeasure.partId} m${currentMeasure.measureNumber}`
            : "-"}
        </p>
        <p>
          <strong>Event:</strong>{" "}
          {currentEvent
            ? `${currentEvent.kind} ${currentEvent.partId} m${currentEvent.measureNumber} v${currentEvent.voice} e${currentEvent.eventIndex}`
            : "-"}
        </p>
        <p>
          <strong>Active events:</strong> {activeEventCount}
        </p>
      </div>
    </section>
  );
}
