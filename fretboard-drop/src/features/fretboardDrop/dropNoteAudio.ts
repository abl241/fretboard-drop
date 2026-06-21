import type { DropStringIndex } from "./dropGameTypes";

export const DROP_NOTE_SOUND_STORAGE_KEY = "fretboard-drop:note-sound-enabled:v1";
export const DROP_STRING_OPEN_MIDI_NOTES = [64, 59, 55, 50, 45, 40] as const satisfies readonly number[];

const A4_MIDI_NOTE = 69;
const A4_FREQUENCY_HZ = 440;

let activeAudio:
  | {
      oscillator: OscillatorNode;
      gain: GainNode;
    }
  | null = null;
let audioContext: AudioContext | null = null;

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
    return window.localStorage.getItem(DROP_NOTE_SOUND_STORAGE_KEY) === "on";
  } catch {
    return false;
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

function stopActiveAudio(now: number): void {
  if (!activeAudio) return;
  activeAudio.gain.gain.cancelScheduledValues(now);
  activeAudio.gain.gain.setTargetAtTime(0.0001, now, 0.018);
  activeAudio.oscillator.stop(now + 0.06);
  activeAudio = null;
}

export function playFretboardNote({
  stringIndex,
  fret,
  volume = 0.13,
}: {
  stringIndex: DropStringIndex;
  fret: number;
  volume?: number;
}): void {
  const context = getAudioContext();
  if (!context) return;

  const now = context.currentTime;
  stopActiveAudio(now);

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  const frequency = getGuitarNoteFrequency(stringIndex, fret);

  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(frequency, now);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1_850, now);
  filter.frequency.exponentialRampToValueAtTime(760, now + 0.34);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.032, now + 0.13);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.46);

  activeAudio = { oscillator, gain };
}
