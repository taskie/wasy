import * as midi from "./midi/event";
import * as inst from "./midi/instrument";
import { Monophony, Patch } from "./synth/patch";
export declare class SimpleOscillatorMonophony extends Monophony {
    oscillator: OscillatorNode;
    gain: GainNode;
}
export declare class SimpleOscillatorPatch extends Patch<SimpleOscillatorMonophony> {
    oscillatorType: OscillatorType;
    constructor(instrument: inst.Instrument<Monophony>, oscillatorType?: OscillatorType, destination?: AudioNode);
    onNoteOn(event: midi.NoteOnEvent, time: number): SimpleOscillatorMonophony;
    onNoteOff(monophony: SimpleOscillatorMonophony, time: number): void;
    onExpired(monophony: SimpleOscillatorMonophony, time: number): void;
}
export declare class NoiseMonophony extends Monophony {
    managedNodes: AudioNode[];
    source: AudioBufferSourceNode;
    filter: BiquadFilterNode;
    gain: GainNode;
}
export declare class NoisePatch extends Patch<NoiseMonophony> {
    static noiseBuffer: AudioBuffer;
    constructor(instrument: inst.Instrument<Monophony>, destination?: AudioNode);
    onNoteOn(event: midi.NoteOnEvent, time: number): NoiseMonophony;
    onNoteOff(monophony: NoiseMonophony, time: number): void;
    onExpired(monophony: NoiseMonophony, time: number): void;
}
export declare class GainedNoisePatch extends NoisePatch {
    valueAtBegin: number;
    valueAtEnd: number;
    duration: number;
    fixedFrequency: number;
    constructor(instrument: inst.Instrument<Monophony>, valueAtBegin: number, valueAtEnd: number, duration: number, fixedFrequency?: number, destination?: AudioNode);
    onNoteOn(event: midi.NoteOnEvent, time: number): NoiseMonophony;
}
export declare class OneShotNoisePatch extends GainedNoisePatch {
    onNoteOff(monophony: NoiseMonophony, time: number): void;
    onExpired(monophony: NoiseMonophony, time: number): void;
}
export declare class GainedOscillatorPatch extends SimpleOscillatorPatch {
    valueAtBegin: number;
    valueAtEnd: number;
    duration: number;
    constructor(instrument: inst.Instrument<Monophony>, valueAtBegin: number, valueAtEnd: number, duration: number, oscillatorType?: OscillatorType, destination?: AudioNode);
    onNoteOn(event: midi.NoteOnEvent, time: number): SimpleOscillatorMonophony;
}
export declare class OneShotOscillatorPatch extends GainedOscillatorPatch {
    fixedFrequency: number;
    constructor(instrument: inst.Instrument<Monophony>, duration: number, fixedFrequency?: number, oscillatorType?: OscillatorType, destination?: AudioNode);
    onNoteOn(event: midi.NoteOnEvent, time: number): SimpleOscillatorMonophony;
    onNoteOff(monophony: SimpleOscillatorMonophony, time: number): void;
    onExpired(monophony: SimpleOscillatorMonophony, time: number): void;
}
export declare class DrumKitPatch extends Patch<Monophony> {
    patchMap: {
        [n: number]: Patch<Monophony>;
    };
    leftPanpot: PannerNode;
    rightPanpot: PannerNode;
    gain: GainNode;
    constructor(instrument: inst.Instrument<Monophony>, destination?: AudioNode);
    onNoteOn(event: midi.NoteOnEvent, time: number): Monophony;
    onNoteOff(monophony: NoiseMonophony, time: number): void;
    onExpired(monophony: NoiseMonophony, time: number): void;
}
export declare class PatchGenerator {
    generate(instrument: inst.Instrument<Monophony>, program: number, isDrum?: boolean): Patch<Monophony>;
}
