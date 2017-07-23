"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const midi = require("../midi/event");
const dvu = require("../binary/data-view-util");
const signal_1 = require("../signal");
class MIDIIn {
    constructor() {
        this._emitter = new signal_1.default();
    }
    on(listener) {
        this._emitter.on(listener);
    }
    off(listener) {
        this._emitter.off(listener);
    }
    offAll() {
        this._emitter.offAll();
    }
    emit(event) {
        this._emitter.emit(event);
    }
}
exports.MIDIIn = MIDIIn;
class WebMIDIIn extends MIDIIn {
    constructor() {
        super();
        if (!navigator.requestMIDIAccess) {
            return;
        }
        navigator.requestMIDIAccess().then((midiAccess) => {
            const it = midiAccess.inputs.values();
            for (let input = it.next(); !input.done; input = it.next()) {
                console.log(input.value);
                input.value.onmidimessage = (event) => {
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
exports.WebMIDIIn = WebMIDIIn;
class WebMidiLinkIn extends MIDIIn {
    constructor() {
        super();
        window.addEventListener("message", (event) => {
            const elems = event.data.split(",");
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
exports.WebMidiLinkIn = WebMidiLinkIn;
//# sourceMappingURL=midi-in.js.map