import * as midi from "../midi/event";
export declare class MIDIIn {
    private _emitter;
    constructor();
    on(listener: (event: midi.Event) => void): void;
    off(listener: (event: midi.Event) => void): void;
    offAll(): void;
    emit(event: midi.Event): void;
}
export declare class WebMIDIIn extends MIDIIn {
    constructor();
}
export declare class WebMidiLinkIn extends MIDIIn {
    constructor();
}
