import * as dvu from "../../binary/data-view-util";

export class Event {
	constructor(public dataView: DataView, public tick: number, public status: number) { }
	toWebMidiLinkString() {
		let data = [this.status];
		for (var i = 0; i < this.dataView.byteLength; ++i) {
			data.push(this.dataView.getUint8(i));
		}
		return "midi," + data.map((x) => x.toString(16)).join(",");
	}
	static statusEventMap: { [n: number]: typeof Event };
	static create(dataView: DataView, tick: number, status: number): Event {
		if (!this.statusEventMap) {
			this.statusEventMap = {
				0x80: NoteOffEvent,
				0x90: NoteOnEvent,
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
		} else if (status === 0x90 && dataView.getUint8(1) === 0) {
			return new NoteOffEvent(dataView, tick, 0x80);	
		} else {
			let EventClass: typeof Event = this.statusEventMap[statusType];
			return new EventClass(dataView, tick, status);
		}
	}
	get statusType() { return this.status & 0xF0; }
}

export class ChannelEvent extends Event {
	get channel() { return this.status & 0x0F; }
}

export class NoteOffEvent extends ChannelEvent {
	get noteNumber() { return this.dataView.getUint8(0); }
	get velocity() { return this.dataView.getUint8(1); }
}

export class NoteOnEvent extends ChannelEvent {
	get noteNumber() { return this.dataView.getUint8(0); }
	get velocity() { return this.dataView.getUint8(1); }
}

export class PolyphonicKeyPressureEvent extends ChannelEvent { }
export class ControlChangeEvent extends ChannelEvent {
	get controller() { return this.dataView.getUint8(0); }
	get value() { return this.dataView.getUint8(1); }
}
export class ProgramChangeEvent extends ChannelEvent {
	get program() { return this.dataView.getUint8(0); }
}
export class ChannelPressureEvent extends ChannelEvent { }
export class PitchBendEvent extends ChannelEvent {
	get value() {
		return this.dataView.getUint8(0) + (this.dataView.getUint8(1) << 7) - 8192;
	}
}

export class FxEvent extends Event {
	get statusType() { return this.status; }
}

export class SystemExclusiveEvent extends FxEvent { }

export class MetaEvent extends FxEvent {
	static typeIndexEventMap: { [n: number]: typeof MetaEvent };
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
		let {value, byteLength} = dvu.dataViewGetUintVariable(this.dataView, 1);
		return dvu.dataViewGetSubDataView(this.dataView, 1 + byteLength, value);
	}
}

export class TempoMetaEvent extends MetaEvent {
	get rawTempo() {
		return dvu.dataViewGetUint(this.data, 0, false);
	}
	get secondsPerBeat() {
		return this.rawTempo * 10e-7;	// ?
	}
	get beatsPerMinute() {
		return 60 / this.secondsPerBeat;
	}
}