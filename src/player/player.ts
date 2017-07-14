import * as midi from "./midi";
import * as smf from "./smf";

export class Player {
	public song: smf.Song;
	public cursors: number[];
	constructor(buffer: ArrayBuffer) {
		this.song = new smf.Song(buffer);
		this.song.load();
		this.cursors = new Array(this.numberOfTracks);
		for (var i = 0; i < this.cursors.length; ++i) this.cursors[i] = 0;
	}
	get resolution() { return this.song.header.resolution; }
	get numberOfTracks() { return this.song.header.numberOfTracks; }
	public read(tick: number) {
		let newEventsStore: midi.Event[][] = [];
		for (let i = 0; i < 16; ++i) {
			newEventsStore[i] = [];
		}
		this.song.tracks.forEach((track, trackNumber) => {
			for (var i = this.cursors[trackNumber]; i < track.events.length; ++i) {
				let event = track.events[i];
				if (event.tick > tick) break;
				if (event instanceof midi.ChannelEvent) {
					newEventsStore[event.channel].push(event);
				} else {
					for (let events of newEventsStore) {
						events.push(event);
					}
				}
				this.cursors[trackNumber] = i + 1;
			}
		});
		return newEventsStore;
	}
}