import { PitchDetector } from "pitchy";

type CreatePitchListenerOptions = {
  fftSize?: number;
  clarityThreshold?: number;
  quietnessThresholdDb?: number;
  minValidPitchHz?: number;
  onPitch: (detectedHz: number) => void;
  onNoPitch?: () => void;
  onAnalysis?: (analysis: {
    detectedHz: number | null;
    clarity: number;
    rmsDb: number;
    hasStablePitch: boolean;
    isQuiet: boolean;
  }) => void;
};

export type PitchListener = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  isRunning: () => boolean;
};

export function createPitchListener(
  options: CreatePitchListenerOptions,
): PitchListener {
  const fftSize = options.fftSize ?? 2048;
  const clarityThreshold = options.clarityThreshold ?? 0.92;
  const quietnessThresholdDb = options.quietnessThresholdDb ?? -50;
  const minValidPitchHz = options.minValidPitchHz ?? 80;

  let audioContext: AudioContext | null = null;
  let mediaStream: MediaStream | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let analyserNode: AnalyserNode | null = null;
  let frameId: number | null = null;
  let running = false;

  const input = new Float32Array(fftSize);
  const detector = PitchDetector.forFloat32Array(input.length);
  detector.clarityThreshold = clarityThreshold;
  detector.minVolumeDecibels = -55;

  async function start() {
    if (running) return;

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    audioContext = new AudioContext();
    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = fftSize;
    analyserNode.smoothingTimeConstant = 0.1;

    sourceNode.connect(analyserNode);
    running = true;

    const tick = () => {
      if (!running || !analyserNode || !audioContext) return;

      analyserNode.getFloatTimeDomainData(input);
      const [pitchHz, clarity] = detector.findPitch(input, audioContext.sampleRate);
      const rmsDb = toRmsDb(input);
      const hasStablePitch =
        pitchHz >= minValidPitchHz && clarity >= clarityThreshold;
      const isQuiet = rmsDb <= quietnessThresholdDb;

      options.onAnalysis?.({
        detectedHz: hasStablePitch ? pitchHz : null,
        clarity,
        rmsDb,
        hasStablePitch,
        isQuiet,
      });

      if (hasStablePitch) {
        options.onPitch(pitchHz);
      } else {
        options.onNoPitch?.();
      }

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
  }

  async function stop() {
    if (!running) return;
    running = false;

    if (frameId !== null) {
      window.cancelAnimationFrame(frameId);
      frameId = null;
    }

    if (sourceNode) {
      sourceNode.disconnect();
      sourceNode = null;
    }

    if (analyserNode) {
      analyserNode.disconnect();
      analyserNode = null;
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }

    if (audioContext) {
      await audioContext.close();
      audioContext = null;
    }
  }

  return {
    start,
    stop,
    isRunning: () => running,
  };
}

function toRmsDb(buffer: Float32Array): number {
  let sumSquares = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const sample = buffer[i];
    sumSquares += sample * sample;
  }

  const rms = Math.sqrt(sumSquares / Math.max(1, buffer.length));
  return 20 * Math.log10(Math.max(rms, 1e-8));
}
