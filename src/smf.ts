import * as xiff from "./xiff.js";
import * as dvu from "./binary/data-view-util.js";
import * as midi from "./midi/event.js";

export class Header {
	format!: number;
	numberOfTracks!: number;
	resolution!: number;
	constructor(public dataView: DataView) { }
	load() {
		let pos = 0;
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
		let length = 0;
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
				if (status === 0xFF) {
					const { byteLength, value } = dvu.dataViewGetUintVariable(this.dataView, byteOffset + 1);
					length = 1 + byteLength + value;
				} else {
					const { byteLength, value } = dvu.dataViewGetUintVariable(this.dataView, byteOffset);
					length = byteLength + value;
				}
				break;
		}
		const dataView = new DataView(this.dataView.buffer, this.dataView.byteOffset + byteOffset, length);
		return midi.Event.create(dataView, tick, status);
	}
}

export class Track {
	public events!: midi.Event[];
	constructor(public dataView: DataView) { }
	load() {
		let pos = 0;
		let tick = 0;
		let status = 0x00;
		const eventBuilder = new EventBuilder(this.dataView);
		this.events = [];
		while (pos < this.dataView.byteLength) {
			{
				const { byteLength, value } = dvu.dataViewGetUintVariable(this.dataView, pos);
				pos += byteLength;
				tick += value;
			}
			{
				const byte = this.dataView.getUint8(pos);
				const msb = byte & 0b10000000;
				if (msb) {
					status = byte;
					++pos;
				}
				const event = eventBuilder.build(tick, status, pos);
				pos += event.dataView.byteLength;
				this.events.push(event);
			}
		}
	}
}

export class Song {
	public header!: Header;
	public tracks!: Track[];

	constructor(public buffer: ArrayBuffer) {

	}

	load() {
		const smf = xiff.load(this.buffer, xiff.configs.smf);
		this.tracks = [];
		smf.children.forEach((chunk) => {
			switch (chunk.name) {
				case "MThd":
					this.header = new Header(chunk.dataView);
					this.header.load();
					break;
				case "MTrk":
					const track = new Track(chunk.dataView);
					track.load();
					this.tracks.push(track);
					break;
				default:
					break;
			}
		});
		if (this.header != null && this.header.format === 2) {
			console.warn("wasy: SMF Format 2 is not supported; tracks will be played as if Format 1.");
		}
	}
}
