import type { DropStringIndex } from "./dropGameTypes";

export const DROP_NOTE_SOUND_STORAGE_KEY = "fretboard-drop:note-sound-enabled:v1";
export const DROP_STRING_OPEN_MIDI_NOTES = [64, 59, 55, 50, 45, 40] as const satisfies readonly number[];

const A4_MIDI_NOTE = 69;
const A4_FREQUENCY_HZ = 440;
const PLUCK_DURATION_SEC = 1.35;

type ActiveSound = {
  stop: (now: number) => void;
};

let activeSound: ActiveSound | null = null;
let audioContext: AudioContext | null = null;

export function resetDropNoteAudioForTests(): void {
  activeSound = null;
  audioContext = null;
}

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

export function getGuitarNoteMidi(stringIndex: DropStringIndex, fret: number): number {
  return DROP_STRING_OPEN_MIDI_NOTES[stringIndex] + Math.max(0, Math.round(fret));
}

export function getFrequencyForMidiNote(midiNote: number): number {
  return A4_FREQUENCY_HZ * 2 ** ((midiNote - A4_MIDI_NOTE) / 12);
}

export function getGuitarNoteFrequency(stringIndex: DropStringIndex, fret: number): number {
  return getFrequencyForMidiNote(getGuitarNoteMidi(stringIndex, fret));
}

export function readNoteSoundEnabled(): boolean {
  try {
    const stored = window.localStorage.getItem(DROP_NOTE_SOUND_STORAGE_KEY);
    // Default on so note feedback plays until the player explicitly turns it off.
    if (stored === null) return true;
    return stored === "on";
  } catch {
    return true;
  }
}

export function writeNoteSoundEnabled(isEnabled: boolean): void {
  try {
    window.localStorage.setItem(DROP_NOTE_SOUND_STORAGE_KEY, isEnabled ? "on" : "off");
  } catch {
    // Sound preference is local-only polish.
  }
}

function getAudioContext(): AudioContext | null {
  if (audioContext) return audioContext;
  if (typeof window === "undefined") return null;

  const AudioContextConstructor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  audioContext = new AudioContextConstructor();
  return audioContext;
}

export function unlockNoteAudio(): Promise<boolean> {
  const context = getAudioContext();
  if (!context) return Promise.resolve(false);
  if (context.state === "running") return Promise.resolve(true);
  return context
    .resume()
    .then(() => context.state === "running")
    .catch(() => false);
}

function stopActiveSound(now: number): void {
  if (!activeSound) return;
  activeSound.stop(now);
  activeSound = null;
}

function trackActiveSound(
  stop: (now: number) => void,
  durationSec: number,
): void {
  activeSound = { stop };

  window.setTimeout(() => {
    if (activeSound?.stop === stop) activeSound = null;
  }, Math.ceil(durationSec * 1_000) + 40);
}

function getStringPluckDamping(stringIndex: DropStringIndex): number {
  // Lower strings ring longer; higher strings decay faster like a real guitar.
  return [0.9935, 0.9945, 0.9952, 0.996, 0.9968, 0.9974][stringIndex];
}

export function generateKarplusStrongPluckBuffer(
  sampleRate: number,
  frequency: number,
  durationSec: number,
  damping = 0.996,
): Float32Array {
  const delayLength = Math.max(2, Math.round(sampleRate / frequency));
  const outputLength = Math.max(delayLength + 1, Math.round(sampleRate * durationSec));
  const delayLine = new Float32Array(delayLength);

  for (let index = 0; index < delayLength; index += 1) {
    delayLine[index] = (Math.random() * 2 - 1) * (1 - index / delayLength * 0.35);
  }

  const output = new Float32Array(outputLength);
  let pointer = 0;

  for (let sample = 0; sample < outputLength; sample += 1) {
    const nextPointer = (pointer + 1) % delayLength;
    const averaged = (delayLine[pointer] + delayLine[nextPointer]) * 0.5;
    const nextSample = averaged * damping;
    delayLine[pointer] = nextSample;
    output[sample] = nextSample;
    pointer = nextPointer;
  }

  let peak = 0.0001;
  for (let index = 0; index < output.length; index += 1) {
    peak = Math.max(peak, Math.abs(output[index]));
  }
  for (let index = 0; index < output.length; index += 1) {
    output[index] /= peak;
  }

  return output;
}

function createPickAttackBuffer(context: AudioContext, volume: number): AudioBuffer {
  const attackLength = Math.max(8, Math.round(context.sampleRate * 0.012));
  const buffer = context.createBuffer(1, attackLength, context.sampleRate);
  const samples = buffer.getChannelData(0);

  for (let index = 0; index < attackLength; index += 1) {
    const envelope = 1 - index / attackLength;
    samples[index] = (Math.random() * 2 - 1) * envelope * envelope * volume;
  }

  return buffer;
}

function playFretboardNoteOnContext(
  context: AudioContext,
  {
    stringIndex,
    fret,
    volume = 0.2,
  }: {
    stringIndex: DropStringIndex;
    fret: number;
    volume?: number;
  },
): void {
  const now = context.currentTime;
  stopActiveSound(now);

  const frequency = getGuitarNoteFrequency(stringIndex, fret);
  const damping = getStringPluckDamping(stringIndex);
  const pluckSamples = generateKarplusStrongPluckBuffer(
    context.sampleRate,
    frequency,
    PLUCK_DURATION_SEC,
    damping,
  );
  const pluckBuffer = context.createBuffer(1, pluckSamples.length, context.sampleRate);
  pluckBuffer.getChannelData(0).set(pluckSamples);

  const pluck = context.createBufferSource();
  const pickAttack = context.createBufferSource();
  const body = context.createBiquadFilter();
  const presence = context.createBiquadFilter();
  const output = context.createGain();
  const brightnessHz = Math.min(3_200, 900 + frequency * 1.1);

  pluck.buffer = pluckBuffer;
  pickAttack.buffer = createPickAttackBuffer(context, 0.42);

  body.type = "peaking";
  body.frequency.setValueAtTime(118, now);
  body.Q.setValueAtTime(0.75, now);
  body.gain.setValueAtTime(4.5, now);

  presence.type = "lowpass";
  presence.frequency.setValueAtTime(brightnessHz, now);
  presence.frequency.exponentialRampToValueAtTime(Math.max(520, brightnessHz * 0.55), now + 0.7);
  presence.Q.setValueAtTime(0.55, now);

  output.gain.setValueAtTime(0.0001, now);
  output.gain.exponentialRampToValueAtTime(volume, now + 0.004);
  output.gain.exponentialRampToValueAtTime(volume * 0.55, now + 0.16);
  output.gain.exponentialRampToValueAtTime(0.0001, now + PLUCK_DURATION_SEC);

  pluck.connect(body);
  pickAttack.connect(body);
  body.connect(presence);
  presence.connect(output);
  output.connect(context.destination);

  pluck.start(now);
  pickAttack.start(now);
  pluck.stop(now + PLUCK_DURATION_SEC);
  pickAttack.stop(now + 0.02);

  trackActiveSound((stopAt) => {
    output.gain.cancelScheduledValues(stopAt);
    output.gain.setTargetAtTime(0.0001, stopAt, 0.012);
    try {
      pluck.stop(stopAt + 0.05);
      pickAttack.stop(stopAt + 0.02);
    } catch {
      // Source may already be stopped.
    }
  }, PLUCK_DURATION_SEC);
}

export function playFretboardNote({
  stringIndex,
  fret,
  volume = 0.2,
}: {
  stringIndex: DropStringIndex;
  fret: number;
  volume?: number;
}): void {
  const context = getAudioContext();
  if (!context) return;

  void unlockNoteAudio().then((ready) => {
    if (!ready) return;
    playFretboardNoteOnContext(context, { stringIndex, fret, volume });
  });
}

function playWrongBuzzOnContext(context: AudioContext, volume = 0.09): void {
  const now = context.currentTime;
  stopActiveSound(now);

  const oscillator = context.createOscillator();
  const noise = context.createBufferSource();
  const noiseGain = context.createGain();
  const toneGain = context.createGain();
  const mix = context.createGain();
  const filter = context.createBiquadFilter();
  const output = context.createGain();
  const noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.22), context.sampleRate);
  const noiseSamples = noiseBuffer.getChannelData(0);

  for (let index = 0; index < noiseSamples.length; index += 1) {
    noiseSamples[index] = Math.random() * 2 - 1;
  }

  oscillator.type = "sawtooth";
  oscillator.frequency.setValueAtTime(104, now);
  oscillator.frequency.exponentialRampToValueAtTime(74, now + 0.16);

  noise.buffer = noiseBuffer;
  noiseGain.gain.setValueAtTime(0.42, now);
  toneGain.gain.setValueAtTime(0.58, now);

  filter.type = "bandpass";
  filter.frequency.setValueAtTime(260, now);
  filter.Q.setValueAtTime(0.9, now);

  output.gain.setValueAtTime(0.0001, now);
  output.gain.exponentialRampToValueAtTime(volume, now + 0.004);
  output.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

  oscillator.connect(toneGain);
  toneGain.connect(mix);
  noise.connect(noiseGain);
  noiseGain.connect(mix);
  mix.connect(filter);
  filter.connect(output);
  output.connect(context.destination);

  oscillator.start(now);
  noise.start(now);
  oscillator.stop(now + 0.24);
  noise.stop(now + 0.24);

  trackActiveSound((stopAt) => {
    output.gain.cancelScheduledValues(stopAt);
    output.gain.setTargetAtTime(0.0001, stopAt, 0.012);
    try {
      oscillator.stop(stopAt + 0.05);
      noise.stop(stopAt + 0.05);
    } catch {
      // Source may already be stopped.
    }
  }, 0.24);
}

export function playWrongBuzz({
  volume = 0.09,
}: {
  volume?: number;
} = {}): void {
  const context = getAudioContext();
  if (!context) return;

  void unlockNoteAudio().then((ready) => {
    if (!ready) return;
    playWrongBuzzOnContext(context, volume);
  });
}
