import * as midi from "../midi/event";
import * as tuning from "../player/tuning";
import * as inst from "../midi/instrument";
export declare class Monophony {
    parentPatch: Patch<Monophony>;
    managedNodes: AudioNode[];
    detunableNodes: AudioNode[];
}
export declare class Patch<T extends Monophony> implements inst.Patch<T> {
    instrument: inst.Instrument<Monophony>;
    destination: AudioNode;
    tuning: tuning.Tuning;
    constructor(instrument: inst.Instrument<Monophony>, destination?: AudioNode);
    detune: number;
    readonly audioContext: AudioContext;
    receiveEvent(event: midi.Event, time: number): void;
    onNoteOn(event: midi.NoteOnEvent, time: number): T;
    onNoteOff(data: T, time: number): void;
    onExpired(monophony: T, time: number): void;
    onPitchBend(event: midi.PitchBendEvent, monophony: T, time: number): void;
}
