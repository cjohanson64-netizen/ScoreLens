import {
  DEFAULT_BPM,
  PLAYBACK_PPQ,
  clampBpm,
  millisecondsToTicks,
} from "../constants/timing";

export type TransportSnapshot = {
  isPlaying: boolean;
  currentTick: number;
  bpm: number;
};

export type TransportSubscriber = (snapshot: TransportSnapshot) => void;

export type Transport = {
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (tick: number) => void;
  setBpm: (bpm: number) => void;
  subscribe: (subscriber: TransportSubscriber) => () => void;
  get currentTick(): number;
  get bpm(): number;
  get isPlaying(): boolean;
  ppq: number;
};

export type CreateTransportOptions = {
  bpm?: number;
  initialTick?: number;
  ppq?: number;
};

export function createTransport(options: CreateTransportOptions = {}): Transport {
  const ppq = options.ppq ?? PLAYBACK_PPQ;

  let bpm = clampBpm(options.bpm ?? DEFAULT_BPM);
  let currentTick = Math.max(0, options.initialTick ?? 0);
  let isPlaying = false;

  let anchorTimeMs: number | null = null;
  let anchorTick = currentTick;
  let rafId: number | null = null;

  const subscribers = new Set<TransportSubscriber>();

  function nowMs(): number {
    if (typeof performance !== "undefined") return performance.now();
    return Date.now();
  }

  function tickAtTime(timeMs: number): number {
    if (!isPlaying || anchorTimeMs === null) {
      return currentTick;
    }

    const elapsedMs = Math.max(0, timeMs - anchorTimeMs);
    return Math.max(0, anchorTick + millisecondsToTicks(elapsedMs, bpm, ppq));
  }

  function emit() {
    const snapshot: TransportSnapshot = {
      isPlaying,
      currentTick,
      bpm,
    };

    subscribers.forEach((subscriber) => subscriber(snapshot));
  }

  function cancelFrame() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function frame() {
    if (!isPlaying) {
      cancelFrame();
      return;
    }

    currentTick = tickAtTime(nowMs());
    emit();
    rafId = requestAnimationFrame(frame);
  }

  function play() {
    if (isPlaying) return;

    isPlaying = true;
    anchorTimeMs = nowMs();
    anchorTick = currentTick;

    emit();
    rafId = requestAnimationFrame(frame);
  }

  function pause() {
    if (!isPlaying) return;

    currentTick = tickAtTime(nowMs());
    isPlaying = false;
    anchorTimeMs = null;
    anchorTick = currentTick;
    cancelFrame();
    emit();
  }

  function stop() {
    isPlaying = false;
    currentTick = 0;
    anchorTick = 0;
    anchorTimeMs = null;
    cancelFrame();
    emit();
  }

  function seek(tick: number) {
    const nextTick = Number.isFinite(tick) ? Math.max(0, tick) : currentTick;

    currentTick = nextTick;
    if (isPlaying) {
      anchorTick = nextTick;
      anchorTimeMs = nowMs();
    } else {
      anchorTick = nextTick;
    }

    emit();
  }

  function setBpm(nextBpm: number) {
    const clamped = clampBpm(nextBpm);
    if (clamped === bpm) return;

    if (isPlaying) {
      currentTick = tickAtTime(nowMs());
      anchorTick = currentTick;
      anchorTimeMs = nowMs();
    }

    bpm = clamped;
    emit();
  }

  function subscribe(subscriber: TransportSubscriber): () => void {
    subscribers.add(subscriber);
    subscriber({ isPlaying, currentTick, bpm });

    return () => {
      subscribers.delete(subscriber);
    };
  }

  return {
    play,
    pause,
    stop,
    seek,
    setBpm,
    subscribe,
    get currentTick() {
      return isPlaying ? tickAtTime(nowMs()) : currentTick;
    },
    get bpm() {
      return bpm;
    },
    get isPlaying() {
      return isPlaying;
    },
    ppq,
  };
}
