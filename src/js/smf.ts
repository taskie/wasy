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

function dataViewGetSubDataView(dataView: DataView, byteOffset: number, byteLength?: number) {
	if (typeof byteLength === "undefined") byteLength = dataView.byteLength - byteOffset;
	return new DataView(dataView.buffer, dataView.byteOffset + byteOffset, byteLength);
}

function dataViewGetUint(dataView: DataView, byteOffset: number, isLittleEndian: boolean, byteLength?: number) {
	var value = 0;
	if (typeof byteLength === "undefined") byteLength = dataView.byteLength - byteOffset;
	if (isLittleEndian) {
		for (var i = byteLength - 1; i >= 0; --i) {
			value = (value << 8) + dataView.getUint8(byteOffset + i);
		}
	} else {
		for (var i = 0; i < byteLength; ++i) {
			value = (value << 8) + dataView.getUint8(byteOffset + i);
		}
	}
	return value;
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
	static statusEventMap: { [n: number]: typeof Event};
	static create(dataView: DataView, tick: number, status: number): Event {
		if (!this.statusEventMap) {
			this.statusEventMap = {
				0x80: NoteOnEvent,
				0x90: NoteOffEvent,
				0xA0: PolyphonicKeyPressureEvent,
				0xB0: ControlChangeEvent,
				0xC0: ProgramChangeEvent,
				0xD0: ChannelPressureEvent,
				0xE0: PitchBendEvent,
				0xF0: SystemExclusiveEvent,
				0xFF: MetaEvent,
			};
		}
		let statusType = status & 0xF0;
		if (status === 0xFF) {
			return MetaEvent.create(dataView, tick, status);
		} else {
			let EventClass: typeof Event = this.statusEventMap[statusType];
			return new EventClass(dataView, tick, status);
		}
	}
}

export class NoteOffEvent extends Event {
	get noteNumber() { return this.dataView.getUint8(0); }
	get velocity() { return this.dataView.getUint8(1); }
}

export class NoteOnEvent extends Event {
	get noteNumber() { return this.dataView.getUint8(0); }
	get velocity() { return this.dataView.getUint8(1); }
}

export class PolyphonicKeyPressureEvent extends Event { }
export class ControlChangeEvent extends Event {
	get controller() { return this.dataView.getUint8(0); }
	get value() { return this.dataView.getUint8(1); }
}
export class ProgramChangeEvent extends Event {
	get program() { return this.dataView.getUint8(0); }	
}
export class ChannelPressureEvent extends Event { }
export class PitchBendEvent extends Event { }
export class SystemExclusiveEvent extends Event { }

export class MetaEvent extends Event {
	static typeIndexEventMap: { [n: number]: typeof MetaEvent};
	static create(dataView: DataView, tick: number, status: number): MetaEvent {
		if (!this.typeIndexEventMap) {
			this.typeIndexEventMap = {
				0x51: TempoMetaEvent
			}
		}
		let typeIndex = dataView.getUint8(0);
		if (typeIndex in this.typeIndexEventMap) {
			let EventClass = this.typeIndexEventMap[typeIndex];
			return new EventClass(dataView, tick, status);
		} else {
			return new MetaEvent(dataView, tick, status);
		}
	}
	get typeIndex() { return this.dataView.getUint8(0); }
	get data() {
		let {value, byteLength} = dataViewGetUintVariable(this.dataView, 1);
		return dataViewGetSubDataView(this.dataView, 1 + byteLength, value);
	}
}

export class TempoMetaEvent extends MetaEvent {
	get rawTempo() {
		return dataViewGetUint(this.data, 0, false);
	}
	get secondsPerBeat() {
		return this.rawTempo * 10e-7;	// ?
	}
	get beatsPerMinute() {
		return 60 / this.secondsPerBeat;
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
		return Event.create(dataView, tick, status);
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