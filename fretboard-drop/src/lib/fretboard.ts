export const CHROMATIC_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export type Note = (typeof CHROMATIC_NOTES)[number];

export const OPEN_STRING_NOTES: Note[] = ["E", "B", "G", "D", "A", "E"];

export function getNoteAtFret(stringIndex: number, fret: number): Note {
  const openNote = OPEN_STRING_NOTES[stringIndex];
  const openIndex = CHROMATIC_NOTES.indexOf(openNote);
  return CHROMATIC_NOTES[(openIndex + fret) % CHROMATIC_NOTES.length];
}

export const DOT_FRETS = [3, 5, 7, 9, 12];
export const DOUBLE_DOT_FRETS = [12];
