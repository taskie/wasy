import * as midi from "../midi/event.js";
import * as dvu from "../binary/data-view-util.js";
import Signal from "../signal.js";

export class MIDIIn {
	private _emitter: Signal<midi.Event>;
	constructor() {
		this._emitter = new Signal();
	}
	on(listener: (event: midi.Event) => void) {
		this._emitter.on(listener);
	}
	off(listener: (event: midi.Event) => void) {
		this._emitter.off(listener);
	}
	offAll() {
		this._emitter.offAll();
	}
	emit(event: midi.Event) {
		this._emitter.emit(event);
	}
}

export class WebMIDIIn extends MIDIIn {
	constructor() {
		super();
		if (typeof navigator.requestMIDIAccess !== "function") { return; }
		navigator.requestMIDIAccess().then((midiAccess) => {
			for (const input of midiAccess.inputs.values()) {
				console.log(input);
				input.onmidimessage = (event) => {
					if (!event.data) return;
					const dataView = new DataView(event.data.buffer);
					const status = dataView.getUint8(0);
					const subDataView = dvu.dataViewGetSubDataView(dataView, 1);
					const midiEvent = midi.Event.create(subDataView, 0, status);
					this.emit(midiEvent);
				};
			}
		}, (reason) => {
			console.log(reason);
		});
	}
}

export class WebMidiLinkIn extends MIDIIn {
	constructor() {
		super();
		window.addEventListener("message", (event) => {
			const elems: string[] = event.data.split(",");
			if (elems[0] === "midi") {
				const ints = elems.slice(1).map((x) => parseInt(x, 16));
				const bytes = new Uint8Array(ints);
				const dataView = new DataView(bytes.buffer);
				const status = dataView.getUint8(0);
				const subDataView = dvu.dataViewGetSubDataView(dataView, 1);
				const midiEvent = midi.Event.create(subDataView, 0, status);
				this.emit(midiEvent);
			}
		}, false);
	}
}
