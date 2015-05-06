import * as xiff from "./xiff";

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

function dataViewGetUintVariable(dataView: DataView, byteOffset: number) {
	var value = 0;
	var pos = 0;
	while (true) {
		let byte = dataView.getUint8(byteOffset + pos);
		++pos;
		let msb = byte & 0b10000000;
		let val = byte & 0b01111111;
		value = (value << 7) + val;
		if (!msb) break;
	}
	return { value, byteLength: pos };
}

export class Event {
	constructor(public dataView: DataView, public tick: number, public status: number) { }
	toWebMidiLinkString() {
		let data = [this.status];
		for (var i = 0; i < this.dataView.byteLength; ++i) {
			data.push(this.dataView.getUint8(i));
		}
		return "midi," + data.map((x) => x.toString(16)).join(",");
	}
}

export class EventBuilder {
	constructor(public dataView: DataView) { }
	build(tick: number, status: number, byteOffset: number): Event {
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
					let {byteLength, value} = dataViewGetUintVariable(this.dataView, byteOffset + 1);
					length = 1 + byteLength + value;
				} else {
					let {byteLength, value} = dataViewGetUintVariable(this.dataView, byteOffset);
					length = byteLength + value;
				}
				break;
		}
		let dataView = new DataView(this.dataView.buffer, this.dataView.byteOffset + byteOffset, length);
		return new Event(dataView, tick, status);
	}
}

export class Track {
	public events: Event[];
	constructor(public dataView: DataView) { }
	load() {
		var pos = 0;
		var tick = 0;
		var status = 0x00;
		var eventBuilder = new EventBuilder(this.dataView);
		this.events = [];
		while (pos < this.dataView.byteLength) {
			{
				let {byteLength, value} = dataViewGetUintVariable(this.dataView, pos);
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
		let smf = xiff.load(this.buffer, xiff.SMF);
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