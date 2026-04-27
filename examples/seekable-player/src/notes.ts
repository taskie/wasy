import { midi, smf } from "wasy";

export interface PianoRollNote {
    channel: number;
    noteNumber: number;
    velocity: number;
    startTick: number;
    endTick: number;
}

export const computeDurationTicks = (song: smf.Song): number => {
    let max = 0;
    for (const track of song.tracks) {
        const last = track.events[track.events.length - 1];
        if (last != null && last.tick > max) max = last.tick;
    }
    return max;
};

// Pair NoteOn / NoteOff into closed [startTick, endTick] notes for piano-roll
// rendering. Events are merged across all tracks and sorted by tick so that
// SMFs which split a single channel across multiple tracks still pair correctly.
export const collectNotes = (song: smf.Song): PianoRollNote[] => {
    const all: midi.Event[] = [];
    for (const track of song.tracks) {
        for (const e of track.events) all.push(e);
    }
    all.sort((a, b) => a.tick - b.tick);

    const notes: PianoRollNote[] = [];
    const active = new Map<number, { startTick: number; velocity: number }>();
    const closeNote = (channel: number, noteNumber: number, endTick: number) => {
        const key = (channel << 7) | noteNumber;
        const prev = active.get(key);
        if (prev == null) return;
        notes.push({
            channel,
            noteNumber,
            velocity: prev.velocity,
            startTick: prev.startTick,
            endTick,
        });
        active.delete(key);
    };

    for (const e of all) {
        if (e instanceof midi.NoteOnEvent) {
            // Same-pitch re-trigger before NoteOff: close the previous note.
            closeNote(e.channel, e.noteNumber, e.tick);
            const key = (e.channel << 7) | e.noteNumber;
            active.set(key, { startTick: e.tick, velocity: e.velocity });
        } else if (e instanceof midi.NoteOffEvent) {
            closeNote(e.channel, e.noteNumber, e.tick);
        }
    }
    // Close stragglers (NoteOn without matching NoteOff) at the song end.
    const lastTick = all[all.length - 1]?.tick ?? 0;
    for (const [key, prev] of active) {
        notes.push({
            channel: key >> 7,
            noteNumber: key & 0x7F,
            velocity: prev.velocity,
            startTick: prev.startTick,
            endTick: lastTick,
        });
    }
    notes.sort((a, b) => a.startTick - b.startTick);
    return notes;
};
