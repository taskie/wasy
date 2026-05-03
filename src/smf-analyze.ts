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
}

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
			noteNumber: key & 0x7F,
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

export const buildSongInfo = (song: smf.Song): SongInfo => ({
	format: song.header.format,
	numberOfTracks: song.header.numberOfTracks,
	resolution: song.header.resolution,
	durationTicks: computeDurationTicks(song),
	notes: collectNotes(song),
	metadata: extractMetadata(song),
});
