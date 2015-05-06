import * as smf from "./smf";
import { EventEmitter } from "events";

console.log("loaded: ", EventEmitter);

export class Timer extends EventEmitter {
	tickEventListeners: ((tick: number) => void)[];
	constructor(resolution: number) {
		super();
	}
}

export class Channel extends EventEmitter {
	static NoteOn = "noteon";
	static NoteOff = "noteoff";
	static PolyphonicKeyPressure = "polyphonic";
	static ControlChange = "control";
	static ProgramChange = "program";
	static ChannelPressure = "channel";
	static PitchBend = "pitch";
	static SystemExclusive = "sysex";
	static MetaEvent = "meta";	
	
	static eventDictionary = {
		0x80: "noteon",
		0x90: "noteoff",
		0xA0: "polyphonic",
		0xB0: "control",
		0xC0: "program",
		0xD0: "channel",
		0xE0: "pitch",
		0xF0: "sysex",
	};
	
	constructor(public channelNumber: number) {
		super();
	}
	
	emitMidiEvent(event: smf.Event) {
		let eventType = event.status & 0xF0;
		if (eventType === 0x80 && !event.dataView.getUint8(1)) {
			this.emit(Channel.NoteOff);
		} else if (event.status === 0xFF) {
			this.emit(Channel.MetaEvent);
		} else {
			this.emit(Channel.eventDictionary[eventType]);
		}
	}
}

export class Player {
	public song: smf.Song;
	public timer: Timer;
	public channels: Channel[];
	public cursors: number[];
	public tick: number;
	constructor(buffer: ArrayBuffer) {
		this.song = new smf.Song(buffer);
		this.song.load();
		this.channels = new Array(16).fill(0).map((x, i) => new Channel(i));
		this.cursors = new Array(this.numberOfTracks).fill(0);
	}
	get resolution() { return this.song.header.resolution; }
	get numberOfTracks() { return this.song.header.numberOfTracks; }
	public play() {
		this.tick = 0;
		let measureTicks = this.resolution;
		this.song.tracks.forEach((track, trackNumber) => {
			for (var i = this.cursors[trackNumber]; i < track.events.length; ++i) {
				let event = track.events[i];
				if (event.tick > this.tick + measureTicks) break;
				this.cursors[trackNumber] = i;
				if ((event.status & 0xF0) === 0xF0) {
					this.channels.forEach(channel => {
						channel.emitMidiEvent(event);
					});
				} else {
					let channelNumber = event.status & 0x0F;
					this.channels[channelNumber].emitMidiEvent(event);
				}
			}
		});
		this.tick += measureTicks;
	}
}