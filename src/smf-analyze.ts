import * as midi from "./midi/event.js";
import type * as smf from "./smf.js";

// A NoteOn / NoteOff pair closed into a single time interval. `endTick` is
// the tick of the matching NoteOff (or the last event tick of the song if
// the NoteOff was missing). Notes from all tracks are merged so SMFs that
// split a single channel across multiple tracks still pair correctly.
export interface Note {
    channel: number;
    noteNumber: number;
    velocity: number;
    startTick: number;
    endTick: number;
}

// Human-readable text meta-events extracted from the SMF, plus the track
// indices the names came from. Track 0's first SequenceTrackName is treated
// as the song title (RP-019); later tracks' SequenceTrackNames belong to
// their own track. CopyrightNotice / Marker / Lyric / generic Text can
// appear on any track.
export interface SongMetadata {
    title?: string;
    copyright: string[];
    text: string[];
    trackNames: { trackIndex: number; name: string }[];
    instrumentNames: { trackIndex: number; name: string }[];
    markers: { tick: number; text: string }[];
    lyrics: { tick: number; text: string }[];
}

// SMF tempo change. `microsecondsPerQuarter` is the raw FF 51 03 payload
// (24-bit big-endian µs per quarter note, 500000 = 120 BPM). Provided as the
// canonical numeric form so consumers can derive seconds-per-beat / BPM
// without re-decoding the meta event.
export interface TempoChange {
    tick: number;
    microsecondsPerQuarter: number;
}

// SMF time-signature change. `denominator` is the actual note value (4 = quarter,
// 8 = eighth, ...), already decoded from the FF 58 04 power-of-2 byte.
export interface TimeSignatureChange {
    tick: number;
    numerator: number;
    denominator: number;
}

// Bundled analysis posted back from the player worker once the SMF is
// parsed. Lets a UI consumer (piano-roll, mixer, metadata pane) skip the
// duplicate `smf.parseSong()` on the main thread.
export interface SongInfo {
    format: number;
    numberOfTracks: number;
    resolution: number;
    durationTicks: number;
    notes: Note[];
    metadata: SongMetadata;
    tempoMap: TempoChange[];
    timeSignatureMap: TimeSignatureChange[];
}

// SMF default tempo: 120 BPM = 500000 µs / quarter note. Used when a song
// has no TempoMetaEvent before the queried tick.
export const DEFAULT_MICROSECONDS_PER_QUARTER = 500000;
// SMF default time signature: 4/4. Used when a song has no
// TimeSignatureMetaEvent before the queried tick.
export const DEFAULT_TIME_SIGNATURE: { numerator: number; denominator: number } = {
    numerator: 4,
    denominator: 4,
};

// Last event tick across all tracks. SMF tracks are independent timelines
// terminated by an EndOfTrack meta event, so the song ends at whichever
// track's final tick is largest.
export const computeDurationTicks = (song: smf.Song): number => {
    let max = 0;
    for (const track of song.tracks) {
        const last = track.events[track.events.length - 1];
        if (last != null && last.tick > max) max = last.tick;
    }
    return max;
};

// Pair NoteOn / NoteOff into closed [startTick, endTick] notes. Events are
// merged across tracks and sorted by tick; a NoteOn for an already-active
// (channel, noteNumber) closes the previous note at the new NoteOn's tick
// (some SMFs re-trigger a held note rather than emitting NoteOff first).
// Stragglers (NoteOn without matching NoteOff) are closed at the song's
// last event tick.
export const collectNotes = (song: smf.Song): Note[] => {
    const all: midi.Event[] = [];
    for (const track of song.tracks) {
        for (const e of track.events) all.push(e);
    }
    all.sort((a, b) => a.tick - b.tick);

    const notes: Note[] = [];
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
            closeNote(e.channel, e.noteNumber, e.tick);
            const key = (e.channel << 7) | e.noteNumber;
            active.set(key, { startTick: e.tick, velocity: e.velocity });
        } else if (e instanceof midi.NoteOffEvent) {
            closeNote(e.channel, e.noteNumber, e.tick);
        }
    }
    const lastTick = all[all.length - 1]?.tick ?? 0;
    for (const [key, prev] of active) {
        notes.push({
            channel: key >> 7,
            noteNumber: key & 0x7f,
            velocity: prev.velocity,
            startTick: prev.startTick,
            endTick: lastTick,
        });
    }
    notes.sort((a, b) => a.startTick - b.startTick);
    return notes;
};

// Pull human-readable text meta events into a single SongMetadata record.
// Walks each track in order, decoding `MetaEvent.text()` (which auto-detects
// UTF-8 vs Shift_JIS — Japanese SMFs are commonly Shift_JIS).
export const extractMetadata = (song: smf.Song): SongMetadata => {
    const meta: SongMetadata = {
        copyright: [],
        text: [],
        trackNames: [],
        instrumentNames: [],
        markers: [],
        lyrics: [],
    };
    song.tracks.forEach((track, trackIndex) => {
        let trackNameSeen = false;
        for (const e of track.events) {
            if (e instanceof midi.SequenceTrackNameMetaEvent) {
                const name = e.text();
                if (!trackNameSeen) {
                    if (trackIndex === 0 && meta.title == null) {
                        meta.title = name;
                    } else {
                        meta.trackNames.push({ trackIndex, name });
                    }
                    trackNameSeen = true;
                }
            } else if (e instanceof midi.CopyrightMetaEvent) {
                meta.copyright.push(e.text());
            } else if (e instanceof midi.TextMetaEvent) {
                meta.text.push(e.text());
            } else if (e instanceof midi.InstrumentNameMetaEvent) {
                meta.instrumentNames.push({ trackIndex, name: e.text() });
            } else if (e instanceof midi.MarkerMetaEvent) {
                meta.markers.push({ tick: e.tick, text: e.text() });
            } else if (e instanceof midi.LyricMetaEvent) {
                meta.lyrics.push({ tick: e.tick, text: e.text() });
            }
        }
    });
    return meta;
};

// Pull every TempoMetaEvent (FF 51) into a tick-sorted list. The SMF spec
// says tempo lives on track 0 in format 1, but some files put it elsewhere —
// we walk every track and merge to be tolerant.
export const extractTempoMap = (song: smf.Song): TempoChange[] => {
    const out: TempoChange[] = [];
    for (const track of song.tracks) {
        for (const e of track.events) {
            if (e instanceof midi.TempoMetaEvent) {
                out.push({ tick: e.tick, microsecondsPerQuarter: e.rawTempo });
            }
        }
    }
    out.sort((a, b) => a.tick - b.tick);
    return out;
};

// Pull every TimeSignatureMetaEvent (FF 58) into a tick-sorted list. Same
// "walk every track" tolerance as `extractTempoMap`.
export const extractTimeSignatureMap = (song: smf.Song): TimeSignatureChange[] => {
    const out: TimeSignatureChange[] = [];
    for (const track of song.tracks) {
        for (const e of track.events) {
            if (e instanceof midi.TimeSignatureMetaEvent) {
                out.push({ tick: e.tick, numerator: e.numerator, denominator: e.denominator });
            }
        }
    }
    out.sort((a, b) => a.tick - b.tick);
    return out;
};

// Convert a SMF tick position into seconds, integrating the tempo map.
// Each segment between tempo changes runs at constant µs/tick, so we sum
// `(segmentTicks * µsPerTick) / 1e6` across segments. The first segment
// (before the earliest tempo change, or the whole song if there are none)
// uses the SMF default 120 BPM.
export const tickToSeconds = (
    tick: number,
    tempoMap: TempoChange[],
    resolution: number,
): number => {
    let seconds = 0;
    let cursor = 0;
    let microsecondsPerQuarter = DEFAULT_MICROSECONDS_PER_QUARTER;
    for (const change of tempoMap) {
        if (change.tick >= tick) break;
        seconds += ((change.tick - cursor) * microsecondsPerQuarter) / (resolution * 1e6);
        cursor = change.tick;
        microsecondsPerQuarter = change.microsecondsPerQuarter;
    }
    seconds += ((tick - cursor) * microsecondsPerQuarter) / (resolution * 1e6);
    return seconds;
};

// Convert a SMF tick position into 1-indexed bar:beat. Bars are counted
// from the song start; on a time-signature change, the new bar starts at
// the change's tick (partial leading bar in the previous TS is treated as
// "1 bar" for counting). `ticksPerBeat = resolution * 4 / denominator`,
// `ticksPerBar = ticksPerBeat * numerator`.
export const tickToBarBeat = (
    tick: number,
    timeSignatureMap: TimeSignatureChange[],
    resolution: number,
): { bar: number; beat: number } => {
    let bar = 1;
    let cursor = 0;
    let numerator = DEFAULT_TIME_SIGNATURE.numerator;
    let denominator = DEFAULT_TIME_SIGNATURE.denominator;
    const segment = (segTick: number, segNum: number, segDen: number) => {
        const ticksPerBeat = (resolution * 4) / segDen;
        const ticksPerBar = ticksPerBeat * segNum;
        const elapsed = segTick - cursor;
        const fullBars = Math.floor(elapsed / ticksPerBar);
        bar += fullBars;
        const tickInBar = elapsed - fullBars * ticksPerBar;
        const beat = Math.floor(tickInBar / ticksPerBeat) + 1;
        return beat;
    };
    for (const change of timeSignatureMap) {
        if (change.tick >= tick) break;
        segment(change.tick, numerator, denominator);
        cursor = change.tick;
        numerator = change.numerator;
        denominator = change.denominator;
    }
    const beat = segment(tick, numerator, denominator);
    return { bar, beat };
};

// Format helper for "mm:ss" (or "h:mm:ss" if ≥ 1 hour). Negative inputs are
// clamped to 0; sub-second fractions are truncated. Pure presentation, lives
// alongside the analysis helpers because the seek UI needs it everywhere
// `tickToSeconds` is rendered.
export const formatTime = (seconds: number): string => {
    const total = Math.max(0, Math.floor(seconds));
    const s = total % 60;
    const m = Math.floor(total / 60) % 60;
    const h = Math.floor(total / 3600);
    const pad = (n: number) => n.toString().padStart(2, "0");
    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
    return `${pad(m)}:${pad(s)}`;
};

export const buildSongInfo = (song: smf.Song): SongInfo => ({
    format: song.header.format,
    numberOfTracks: song.header.numberOfTracks,
    resolution: song.header.resolution,
    durationTicks: computeDurationTicks(song),
    notes: collectNotes(song),
    metadata: extractMetadata(song),
    tempoMap: extractTempoMap(song),
    timeSignatureMap: extractTimeSignatureMap(song),
});
