import * as dvu from "../binary/data-view-util.js";

export class Event {
	constructor(public dataView: DataView, public tick: number, public status: number) { }
	toWebMidiLinkString() {
		const data = [this.status];
		for (let i = 0; i < this.dataView.byteLength; ++i) {
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
		const statusType = status & 0xF0;
		if (status === 0xFF) {
			return MetaEvent.create(dataView, tick, status);
		} else if (statusType === 0x90 && dataView.getUint8(1) === 0) {
			return new NoteOffEvent(dataView, tick, 0x80 | (status & 0x0F));
		} else {
			const EventClass: typeof Event = this.statusEventMap[statusType];
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
	override get statusType() { return this.status; }
}

export class SystemExclusiveEvent extends FxEvent { }

export class MetaEvent extends FxEvent {
	static typeIndexEventMap: { [n: number]: typeof MetaEvent };
	static override create(dataView: DataView, tick: number, status: number): MetaEvent {
		if (!this.typeIndexEventMap) {
			this.typeIndexEventMap = {
				0x01: TextMetaEvent,
				0x02: CopyrightMetaEvent,
				0x03: SequenceTrackNameMetaEvent,
				0x04: InstrumentNameMetaEvent,
				0x05: LyricMetaEvent,
				0x06: MarkerMetaEvent,
				0x07: CuePointMetaEvent,
				0x51: TempoMetaEvent,
				0x58: TimeSignatureMetaEvent,
			};
		}
		const typeIndex = dataView.getUint8(0);
		if (typeIndex in this.typeIndexEventMap) {
			const EventClass = this.typeIndexEventMap[typeIndex];
			return new EventClass(dataView, tick, status);
		} else {
			return new MetaEvent(dataView, tick, status);
		}
	}
	get typeIndex() { return this.dataView.getUint8(0); }
	get data() {
		const { value, byteLength } = dvu.dataViewGetUintVariable(this.dataView, 1);
		return dvu.dataViewGetSubDataView(this.dataView, 1 + byteLength, value);
	}
	// Decode meta-event payload as text. SMF predates UTF-8 and the spec
	// leaves the encoding unspecified — Japanese SMFs are commonly Shift_JIS.
	// When `encoding` is omitted we try strict UTF-8 first and fall back to
	// Shift_JIS on invalid bytes. Callers that know the encoding can pass
	// it explicitly to skip the probe.
	text(encoding?: string): string {
		const data = this.data;
		const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
		if (encoding != null) {
			return new TextDecoder(encoding, { fatal: false }).decode(bytes);
		}
		try {
			return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
		} catch {
			return new TextDecoder("shift_jis", { fatal: false }).decode(bytes);
		}
	}
}

// Standard text meta events (typeIndex 0x01-0x07). All share `MetaEvent.text()`
// — distinct subclasses exist so consumers can branch on `instanceof` instead
// of comparing `typeIndex` numbers.
export class TextMetaEvent extends MetaEvent { }
export class CopyrightMetaEvent extends MetaEvent { }
export class SequenceTrackNameMetaEvent extends MetaEvent { }
export class InstrumentNameMetaEvent extends MetaEvent { }
export class LyricMetaEvent extends MetaEvent { }
export class MarkerMetaEvent extends MetaEvent { }
export class CuePointMetaEvent extends MetaEvent { }

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

// FF 58 04 nn dd cc bb. `dd` is a power-of-2 exponent (2 = quarter, 3 = eighth);
// `denominator` exposes the actual note value (4, 8, 16, ...) so consumers
// don't have to remember the exponent encoding.
export class TimeSignatureMetaEvent extends MetaEvent {
	get numerator() {
		return this.data.getUint8(0);
	}
	get denominator() {
		return 1 << this.data.getUint8(1);
	}
	get clocksPerClick() {
		return this.data.getUint8(2);
	}
	get thirtySecondNotesPerQuarter() {
		return this.data.getUint8(3);
	}
}
