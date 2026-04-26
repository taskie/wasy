import * as midi from "./midi/event.js";
import * as smf from "./smf.js";

export class Player {
	public song: smf.Song;
	public cursors: number[];
	constructor(buffer: ArrayBuffer) {
		this.song = smf.parseSong(buffer);
		this.cursors = Array.from({ length: this.numberOfTracks }, () => 0);
	}
	get resolution() { return this.song.header.resolution; }
	get numberOfTracks() { return this.song.header.numberOfTracks; }
	public read(tick: number) {
		const newEventsStore: midi.Event[][] = [];
		for (let i = 0; i < 16; ++i) {
			newEventsStore[i] = [];
		}
		this.song.tracks.forEach((track, trackNumber) => {
			for (let i = this.cursors[trackNumber]; i < track.events.length; ++i) {
				const event = track.events[i];
				if (event.tick > tick) break;
				if (event instanceof midi.ChannelEvent) {
					newEventsStore[event.channel].push(event);
				} else {
					for (const events of newEventsStore) {
						events.push(event);
					}
				}
				this.cursors[trackNumber] = i + 1;
			}
		});
		return newEventsStore;
	}
}
