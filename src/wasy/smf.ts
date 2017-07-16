import * as xiff from "../xiff";
import * as dvu from "../binary/data-view-util";
import * as midi from "./midi/event";

export class Header {
	format: number;
	numberOfTracks: number;
	resolution: number;
	constructor(public dataView: DataView) { }
	load() {
		var pos = 0;
		this.format = this.dataView.getUint16(pos, false);
		pos += 2;
		this.numberOfTracks = this.dataView.getUint16(pos, false);
		pos += 2;
		this.resolution = this.dataView.getUint16(pos, false);
	}
}

export class EventBuilder {
	constructor(public dataView: DataView) { }
	build(tick: number, status: number, byteOffset: number): midi.Event {
		var length = 0;
		switch (status & 0b11110000) {
			case 0x80:
			case 0x90:
			case 0xA0:
			case 0xE0:
				length = 2;
				break;
			case 0xB0:
				length = 2;  // FIXME: OMNI OFF / MONO
				break;
			case 0xC0:
			case 0xD0:
				length = 1;
				break;
			case 0xF0:
				if (status == 0xFF) {
					let {byteLength, value} = dvu.dataViewGetUintVariable(this.dataView, byteOffset + 1);
					length = 1 + byteLength + value;
				} else {
					let {byteLength, value} = dvu.dataViewGetUintVariable(this.dataView, byteOffset);
					length = byteLength + value;
				}
				break;
		}
		let dataView = new DataView(this.dataView.buffer, this.dataView.byteOffset + byteOffset, length);
		return midi.Event.create(dataView, tick, status);
	}
}

export class Track {
	public events: midi.Event[];
	constructor(public dataView: DataView) { }
	load() {
		var pos = 0;
		var tick = 0;
		var status = 0x00;
		var eventBuilder = new EventBuilder(this.dataView);
		this.events = [];
		while (pos < this.dataView.byteLength) {
			{
				let {byteLength, value} = dvu.dataViewGetUintVariable(this.dataView, pos);
				pos += byteLength;
				tick += value;
			}
			{
				let byte = this.dataView.getUint8(pos);
				let msb = byte & 0b10000000;
				if (msb) {
					status = byte;
					++pos;
				}
				let event = eventBuilder.build(tick, status, pos);
				pos += event.dataView.byteLength;
				this.events.push(event);
			}
		}
	}
}

export class Song {
	public header: Header;
	public tracks: Track[];

	constructor(public buffer: ArrayBuffer) {

	}

	load() {
		let smf = xiff.load(this.buffer, xiff.configs.smf);
		this.tracks = [];
		smf.children.forEach((chunk) => {
			switch (chunk.name) {
				case "MThd":
					this.header = new Header(chunk.dataView);
					this.header.load();
					break;
				case "MTrk":
					let track = new Track(chunk.dataView);
					track.load();
					this.tracks.push(track);
					break;
				default:
					break;
			}
		});
	}
}