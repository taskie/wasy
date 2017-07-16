import * as midi from "../midi/event";
import * as dvu from "../binary/data-view-util";
import Signal from "../signal";

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
		if (!(<any> navigator).requestMIDIAccess) { return; }
		(<any> navigator).requestMIDIAccess().then((midiAccess: any) => {
			const it = midiAccess.inputs.values();
			for (let input = it.next(); !input.done; input = it.next()) {
				console.log(input.value);
				input.value.onmidimessage = (event: any) => {
					const dataView = new DataView(event.data.buffer);
					const status = dataView.getUint8(0);
					const subDataView = dvu.dataViewGetSubDataView(dataView, 1);
					const midiEvent = midi.Event.create(subDataView, 0, status);
					this.emit(midiEvent);
				};
			}
		}, (reason: any) => {
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
				const ints = elems.slice(1).map(x => parseInt(x, 16));
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