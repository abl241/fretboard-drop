import { describe, expect, it } from "vitest";
import {
  DROP_NOTE_SOUND_STORAGE_KEY,
  getFrequencyForMidiNote,
  getGuitarNoteFrequency,
  getGuitarNoteMidi,
  readNoteSoundEnabled,
  writeNoteSoundEnabled,
} from "./dropNoteAudio";

describe("Fretboard Drop note audio", () => {
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
    expect(readNoteSoundEnabled()).toBe(false);

    writeNoteSoundEnabled(true);
    expect(window.localStorage.getItem(DROP_NOTE_SOUND_STORAGE_KEY)).toBe("on");
    expect(readNoteSoundEnabled()).toBe(true);

    writeNoteSoundEnabled(false);
    expect(window.localStorage.getItem(DROP_NOTE_SOUND_STORAGE_KEY)).toBe("off");
    expect(readNoteSoundEnabled()).toBe(false);
  });
});
