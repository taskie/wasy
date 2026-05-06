import * as midi from "../midi/event.js";
import * as dvu from "../binary/data-view-util.js";
import { createSignal, type Signal } from "../signal.js";

export type MidiInput = Signal<midi.Event>;

export const createWebMidiInput = (): MidiInput => {
    const emitter = createSignal<midi.Event>();
    if (typeof navigator.requestMIDIAccess !== "function") return emitter;
    navigator.requestMIDIAccess().then(
        (midiAccess) => {
            for (const input of midiAccess.inputs.values()) {
                input.onmidimessage = (event) => {
                    if (!event.data) return;
                    const dataView = new DataView(event.data.buffer);
                    const status = dataView.getUint8(0);
                    const subDataView = dvu.dataViewGetSubDataView(dataView, 1);
                    const midiEvent = midi.Event.create(subDataView, 0, status);
                    emitter.emit(midiEvent);
                };
            }
        },
        (reason) => {
            console.warn("wasy: requestMIDIAccess rejected:", reason);
        },
    );
    return emitter;
};

export const createWebMidiLinkInput = (): MidiInput => {
    const emitter = createSignal<midi.Event>();
    window.addEventListener(
        "message",
        (event) => {
            const data = event.data;
            if (typeof data !== "string") {
                return;
            }
            const elems: string[] = data.split(",");
            if (elems[0] !== "midi") {
                return;
            }
            const ints = elems.slice(1).map((x) => parseInt(x, 16));
            const bytes = new Uint8Array(ints);
            const dataView = new DataView(bytes.buffer);
            const status = dataView.getUint8(0);
            const subDataView = dvu.dataViewGetSubDataView(dataView, 1);
            const midiEvent = midi.Event.create(subDataView, 0, status);
            emitter.emit(midiEvent);
        },
        false,
    );
    return emitter;
};
