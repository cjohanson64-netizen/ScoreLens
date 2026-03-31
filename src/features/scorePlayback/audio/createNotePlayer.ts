import { pitchToFrequency } from "../pitch/pitchUtils";
import type { PitchNote } from "../pitch/pitchUtils";

export type NotePlayer = {
  prepare: () => Promise<void>;
  playFrequency: (
    frequencyHz: number,
    options?: { durationMs?: number; gain?: number },
  ) => Promise<void>;
  playNote: (
    pitch: PitchNote,
    options?: { durationMs?: number; gain?: number },
  ) => Promise<void>;
  stopAll: () => void;
  dispose: () => void;
};

const DEFAULT_NOTE_DURATION_MS = 360;
const DEFAULT_GAIN = 0.18;
const ATTACK_SECONDS = 0.008;
const RELEASE_SECONDS = 0.12;

export function createNotePlayer(): NotePlayer {
  let audioContext: AudioContext | null = null;
  const activeVoices = new Set<{
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

  async function prepare() {
    const ctx = ensureContext();
    if (!ctx) return;

    if (ctx.state !== "running") {
      await ctx.resume();
    }
  }

  async function playFrequency(
    frequencyHz: number,
    options: { durationMs?: number; gain?: number } = {},
  ) {
    if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) return;

    await prepare();

    const ctx = ensureContext();
    if (!ctx) return;

    const durationSeconds = Math.max(
      (options.durationMs ?? DEFAULT_NOTE_DURATION_MS) / 1000,
      ATTACK_SECONDS + RELEASE_SECONDS + 0.02,
    );
    const peakGain = Math.max(0.0001, options.gain ?? DEFAULT_GAIN);

    const startTime = ctx.currentTime + 0.002;
    const releaseStart = startTime + Math.max(durationSeconds - RELEASE_SECONDS, 0.01);
    const stopTime = releaseStart + RELEASE_SECONDS;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequencyHz, startTime);

    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(peakGain, startTime + ATTACK_SECONDS);
    gainNode.gain.setValueAtTime(peakGain, releaseStart);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, stopTime);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    const voice = { oscillator, gainNode };
    activeVoices.add(voice);
    oscillator.onended = () => {
      activeVoices.delete(voice);
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

    oscillator.start(startTime);
    oscillator.stop(stopTime + 0.005);
  }

  async function playNote(
    pitch: PitchNote,
    options: { durationMs?: number; gain?: number } = {},
  ) {
    const frequency = pitchToFrequency(pitch);
    if (!frequency) return;
    await playFrequency(frequency, options);
  }

  function stopAll() {
    const ctx = audioContext;
    if (!ctx) return;

    const now = ctx.currentTime;
    for (const voice of activeVoices) {
      try {
        voice.gainNode.gain.cancelScheduledValues(now);
        voice.gainNode.gain.setValueAtTime(
          Math.max(voice.gainNode.gain.value, 0.0001),
          now,
        );
        voice.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.01);
      } catch {
        // Ignore voices that are already ending.
      }

      try {
        voice.oscillator.stop(now + 0.015);
      } catch {
        // Ignore voices that have already been stopped.
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
    playFrequency,
    playNote,
    stopAll,
    dispose,
  };
}
