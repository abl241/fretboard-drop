import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DROP_NOTE_SOUND_STORAGE_KEY,
  generateKarplusStrongPluckBuffer,
  getFrequencyForMidiNote,
  getGuitarNoteFrequency,
  getGuitarNoteMidi,
  playFretboardNote,
  playWrongBuzz,
  readNoteSoundEnabled,
  resetDropNoteAudioForTests,
  unlockNoteAudio,
  writeNoteSoundEnabled,
} from "./dropNoteAudio";

describe("Fretboard Drop note audio", () => {
  afterEach(() => {
    resetDropNoteAudioForTests();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("maps open guitar strings to octave-correct MIDI notes", () => {
    expect(getGuitarNoteMidi(5, 0)).toBe(40);
    expect(getGuitarNoteMidi(4, 0)).toBe(45);
    expect(getGuitarNoteMidi(3, 0)).toBe(50);
    expect(getGuitarNoteMidi(2, 0)).toBe(55);
    expect(getGuitarNoteMidi(1, 0)).toBe(59);
    expect(getGuitarNoteMidi(0, 0)).toBe(64);
  });

  it("maps fretted notes by semitone", () => {
    expect(getGuitarNoteMidi(0, 1)).toBe(65);
    expect(getGuitarNoteMidi(0, 5)).toBe(69);
    expect(getGuitarNoteMidi(5, 5)).toBe(45);
    expect(getGuitarNoteMidi(4, 5)).toBe(50);
  });

  it("converts MIDI notes to frequencies from A4 = 440 Hz", () => {
    expect(getFrequencyForMidiNote(69)).toBeCloseTo(440, 5);
    expect(getGuitarNoteFrequency(0, 5)).toBeCloseTo(440, 5);
  });

  it("stores the note sound preference locally", () => {
    expect(readNoteSoundEnabled()).toBe(true);

    writeNoteSoundEnabled(true);
    expect(window.localStorage.getItem(DROP_NOTE_SOUND_STORAGE_KEY)).toBe("on");
    expect(readNoteSoundEnabled()).toBe(true);

    writeNoteSoundEnabled(false);
    expect(window.localStorage.getItem(DROP_NOTE_SOUND_STORAGE_KEY)).toBe("off");
    expect(readNoteSoundEnabled()).toBe(false);
  });

  it("generates a decaying pluck waveform for Karplus-Strong playback", () => {
    const pluck = generateKarplusStrongPluckBuffer(44_100, 440, 0.5, 0.996);

    expect(pluck.length).toBeGreaterThan(1_000);
    expect(Math.abs(pluck[0])).toBeLessThanOrEqual(1);
    expect(Math.abs(pluck[Math.floor(pluck.length * 0.5)])).toBeLessThan(Math.abs(pluck[0]));
    expect(Math.abs(pluck[pluck.length - 1])).toBeLessThan(0.2);
  });

  it("resumes a suspended audio context before playback", async () => {
    const resume = vi.fn(async function (this: { state: AudioContextState }) {
      this.state = "running";
    });
    vi.stubGlobal("AudioContext", vi.fn(() => ({
      currentTime: 0,
      sampleRate: 44_100,
      state: "suspended" as AudioContextState,
      destination: {},
      resume,
      createBufferSource: vi.fn(),
      createGain: vi.fn(),
      createBiquadFilter: vi.fn(),
      createBuffer: vi.fn(),
    })));

    await expect(unlockNoteAudio()).resolves.toBe(true);
    expect(resume).toHaveBeenCalled();
  });

  it("plays correct and wrong sounds without throwing when Web Audio is available", async () => {
    const bufferSources: Array<{ stop: ReturnType<typeof vi.fn> }> = [];
    const createBufferSource = vi.fn(() => {
      const source = {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      bufferSources.push(source);
      return source;
    });
    const createGain = vi.fn(() => ({
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
        setTargetAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }));
    const createBiquadFilter = vi.fn(() => ({
      type: "lowpass",
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      Q: { setValueAtTime: vi.fn() },
      gain: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
    }));
    const createOscillator = vi.fn(() => ({
      type: "sawtooth",
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }));
    const createBuffer = vi.fn((channels: number, length: number) => ({
      copyToChannel: vi.fn(),
      getChannelData: () => new Float32Array(length),
    }));

    vi.stubGlobal("AudioContext", vi.fn(() => ({
      currentTime: 0,
      sampleRate: 44_100,
      state: "running",
      destination: {},
      resume: vi.fn(),
      createBufferSource,
      createGain,
      createBiquadFilter,
      createOscillator,
      createBuffer,
    })));

    playFretboardNote({ stringIndex: 0, fret: 5 });
    playWrongBuzz();
    await Promise.resolve();

    expect(createBufferSource).toHaveBeenCalled();
    expect(bufferSources.length).toBeGreaterThanOrEqual(2);
    expect(createOscillator).toHaveBeenCalled();
  });
});
