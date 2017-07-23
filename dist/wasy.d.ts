import * as midi from "./midi/event";
import * as timer from "./player/timer";
import * as inst from "./midi/instrument";
import { PatchGenerator } from "./synth";
import { Monophony } from "./synth/patch";
export interface TimedEvent {
    timeStamp: timer.TimeStamp;
    midiEvent: midi.Event;
}
export declare class Wasy {
    audioContext: AudioContext;
    timer: timer.Timer;
    instruments: inst.Instrument<Monophony>[];
    gain: GainNode;
    dynamicsCompressor: DynamicsCompressorNode;
    playerWorker: Worker;
    patchGenerator: PatchGenerator;
    paused: boolean;
    private _emitter;
    constructor(audioContext: AudioContext, destination: AudioNode, buffer?: ArrayBuffer);
    play(): void;
    pause(): void;
    resume(): void;
    destroy(): void;
    playerWorkerMessageListener(event: MessageEvent): void;
    receiveExternalMidiEvent(event: midi.Event): void;
    onTimedEvent(listener: (event: TimedEvent) => void): void;
    offTimedEvent(listener: (event: TimedEvent) => void): void;
    timingListener(timeStamp: timer.TimeStamp): void;
}
