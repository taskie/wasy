import * as smf from "./smf";
import { EventEmitter } from "events";

new EventEmitter();

export class Timer extends EventEmitter {
	tick: number;
	secondsPerBeat: number;
	timerId: any;
	get ticksPerSecond() { return this.resolution / this.secondsPerBeat; }
	get beatsPerMinute() { return 60 / this.secondsPerBeat; }
	set beatsPerMinute(bpm: number) { this.secondsPerBeat = 60 / bpm; }
	constructor(public durationInSeconds: number, public resolution: number, channel: Channel) {
		super();
		this.beatsPerMinute = 120;
		channel.on("meta", (event: smf.MetaEvent) => {
			this.processMetaEvent(event);
		});
	}
	processMetaEvent(event: smf.MetaEvent) {
		if (event instanceof smf.TempoMetaEvent) {
			this.secondsPerBeat = event.secondsPerBeat;
		}
	}
	start() {
		this.tick = 0; 
		this.emit("start", this.tick, this);
		this.timing();
	}
	timing() {
		let oldTick = this.tick;
		this.tick += this.ticksPerSecond * this.durationInSeconds;
		this.emit("timing", this.tick, oldTick, this);
		this.timerId = setTimeout(() => { this.timing(); }, this.durationInSeconds * 1000);
	}
	pause() {
		this.emit("pause", this.tick, this);
		clearTimeout(this.timerId)
	}
	restart() {
		this.emit("start", this.tick, this);
		this.timing();
	}
}

export class Channel extends EventEmitter {
	static NoteOff = "noteoff";
	static NoteOn = "noteon";
	static PolyphonicKeyPressure = "polyphonic";
	static ControlChange = "control";
	static ProgramChange = "program";
	static ChannelPressure = "channel";
	static PitchBend = "pitch";
	static SystemExclusive = "sysex";
	static MetaEvent = "meta";	
	
	static eventDictionary = {
		0x80: "noteoff",
		0x90: "noteon",
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
		if (event instanceof smf.NoteOnEvent && event.velocity === 0) {
			this.emit(Channel.NoteOff, event);
		} else if (event.status === 0xFF) {
			this.emit(Channel.MetaEvent, event);
		} else {
			this.emit(Channel.eventDictionary[eventType], event);
		}
		this.emit("all", event);
	}
}

export class Player {
	public song: smf.Song;
	public timer: Timer;
	public channels: Channel[];
	public cursors: number[];
	constructor(buffer: ArrayBuffer) {
		this.song = new smf.Song(buffer);
		this.song.load();
		this.channels = new Array(16);
		for (var i = 0; i < this.channels.length; ++i) this.channels[i] = new Channel(i);
		this.cursors = new Array(this.numberOfTracks);
		for (var i = 0; i < this.cursors.length; ++i) this.cursors[i] = 0;
		this.timer = new Timer(0.1, this.resolution, this.channels[0]);
	}
	get resolution() { return this.song.header.resolution; }
	get numberOfTracks() { return this.song.header.numberOfTracks; }
	public play() {
		this.timer.on("timing", (tick: number) => {	
			this.read(tick);
		});
		this.timer.start();
	}
	public pause() {
		this.timer.pause();
	}
	public read(tick: number) {
		this.song.tracks.forEach((track, trackNumber) => {
			for (var i = this.cursors[trackNumber]; i < track.events.length; ++i) {
				let event = track.events[i];
				if (event.tick > tick) break;
				if ((event.status & 0xF0) === 0xF0) {
					this.channels.forEach(channel => {
						channel.emitMidiEvent(event);
					});
				} else {
					let channelNumber = event.status & 0x0F;
					this.channels[channelNumber].emitMidiEvent(event);
				}
				this.cursors[trackNumber] = i + 1;
			}
		});
	}
}