import type { PlaybackTimelineProjection } from "../projectors/projectPlaybackTimeline";

export type MetronomeClick = {
  tick: number;
  accent: boolean;
};

export type Metronome = {
  prepare: () => Promise<void>;
  onTransportTick: (snapshot: {
    currentTick: number;
    isPlaying: boolean;
  }) => void;
  stopAll: () => void;
  dispose: () => void;
};

export function buildMetronomeClicks(
  timeline: PlaybackTimelineProjection,
): MetronomeClick[] {
  const clicks: MetronomeClick[] = [];

  timeline.measures.forEach((measure) => {
    const beatTicks = Math.max(
      1,
      measure.beatTicks ?? timeline.ppq,
    );
    const beatCount = Math.max(
      1,
      Math.floor(measure.measureDurationTicks / beatTicks),
    );

    for (let beatIndex = 0; beatIndex < beatCount; beatIndex += 1) {
      const tick = measure.measureStartTicks + beatIndex * beatTicks;
      if (tick >= measure.measureEndTicks) break;

      clicks.push({
        tick,
        accent: beatIndex === 0,
      });
    }
  });

  clicks.sort((a, b) => a.tick - b.tick);

  return clicks;
}

export function createMetronome(clicks: MetronomeClick[]): Metronome {
  let audioContext: AudioContext | null = null;
  let nextClickIndex = 0;
  let lastTick = 0;
  const activeClicks = new Set<{
    oscillator: OscillatorNode;
    gainNode: GainNode;
  }>();

  function ensureContext(): AudioContext | null {
    if (typeof window === "undefined" || !("AudioContext" in window)) {
      return null;
    }

    if (!audioContext) {
      audioContext = new window.AudioContext();
    }

    return audioContext;
  }

  function syncNextClickIndex(currentTick: number) {
    nextClickIndex = lowerBound(clicks, currentTick);
  }

  function triggerClick(accent: boolean) {
    const ctx = ensureContext();
    if (!ctx) return;

    const when = ctx.currentTime + 0.001;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = "square";
    oscillator.frequency.value = accent ? 1480 : 980;

    gainNode.gain.setValueAtTime(0.0001, when);
    gainNode.gain.exponentialRampToValueAtTime(accent ? 0.2 : 0.14, when + 0.004);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    const clickVoice = { oscillator, gainNode };
    activeClicks.add(clickVoice);
    oscillator.onended = () => {
      activeClicks.delete(clickVoice);
      oscillator.onended = null;
      try {
        oscillator.disconnect();
      } catch {
        // Ignore disconnect races during stop/dispose.
      }
      try {
        gainNode.disconnect();
      } catch {
        // Ignore disconnect races during stop/dispose.
      }
    };

    oscillator.start(when);
    oscillator.stop(when + 0.045);
  }

  async function prepare() {
    const ctx = ensureContext();
    if (!ctx) return;

    if (ctx.state !== "running") {
      await ctx.resume();
    }
  }

  function onTransportTick(snapshot: { currentTick: number; isPlaying: boolean }) {
    const currentTick = Number.isFinite(snapshot.currentTick)
      ? Math.max(0, snapshot.currentTick)
      : 0;

    if (!snapshot.isPlaying) {
      syncNextClickIndex(currentTick);
      lastTick = currentTick;
      return;
    }

    if (currentTick < lastTick) {
      syncNextClickIndex(currentTick);
    }

    while (
      nextClickIndex < clicks.length &&
      clicks[nextClickIndex].tick <= currentTick
    ) {
      const click = clicks[nextClickIndex];
      if (click.tick >= lastTick) {
        triggerClick(click.accent);
      }
      nextClickIndex += 1;
    }

    lastTick = currentTick;
  }

  function stopAll() {
    const ctx = audioContext;
    if (!ctx) return;

    const now = ctx.currentTime;
    for (const clickVoice of activeClicks) {
      try {
        clickVoice.gainNode.gain.cancelScheduledValues(now);
        clickVoice.gainNode.gain.setValueAtTime(
          Math.max(clickVoice.gainNode.gain.value, 0.0001),
          now,
        );
        clickVoice.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.008);
      } catch {
        // Ignore clicks already ending.
      }

      try {
        clickVoice.oscillator.stop(now + 0.012);
      } catch {
        // Ignore clicks already stopped.
      }
    }
  }

  function dispose() {
    stopAll();
    if (audioContext) {
      void audioContext.close();
      audioContext = null;
    }
  }

  return {
    prepare,
    onTransportTick,
    stopAll,
    dispose,
  };
}

function lowerBound(clicks: MetronomeClick[], tick: number): number {
  let left = 0;
  let right = clicks.length;

  while (left < right) {
    const mid = (left + right) >> 1;
    if (clicks[mid].tick < tick) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  return left;
}
