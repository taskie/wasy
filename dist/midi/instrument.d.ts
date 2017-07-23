import * as midi from "./event";
import Signal from "../signal";
export interface ExpiredMessage<T> {
    data: T;
    time: number;
}
export declare class NotePool<T> {
    polyphony: number;
    _noteStore: {
        [noteNumber: number]: T;
    };
    _noteNumberQueue: number[];
    _expiredEmitter: Signal<ExpiredMessage<T>>;
    constructor(polyphony?: number);
    onExpired(listener: (message: ExpiredMessage<T>) => void): void;
    offExpired(listener: (message: ExpiredMessage<T>) => void): void;
    register(noteNumber: number, data: T, time: number): void;
    unregister(noteNumber: number, time: number): void;
    unregisterAll(time?: number): void;
    find(noteNumber: number): T;
    readonly noteStore: {
        [noteNumber: number]: T;
    };
    readonly noteNumberQueue: number[];
}
export interface Patch<T> {
    receiveEvent(event: midi.Event, time: number): void;
}
export declare class Instrument<T> {
    audioContext: AudioContext;
    destination: AudioNode;
    patch: Patch<T>;
    notePool: NotePool<T>;
    private _expiredEmitter;
    private _programChangeEmitter;
    source: AudioNode;
    _panner: PannerNode;
    _gain: GainNode;
    volume: number;
    panpot: number;
    expression: number;
    pitchBend: number;
    pitchBendRange: number;
    dataEntry: number;
    rpn: number;
    constructor(audioContext: AudioContext, destination: AudioNode);
    resetAllControl(): void;
    destroy(): void;
    pause(): void;
    setPanpot(panpot: number): void;
    setVolume(volume: number, time: number): void;
    setExpression(expression: number, time: number): void;
    detune: number;
    registerNote(noteNumber: number, data: T, time: number): void;
    findNote(noteNumber: number): T;
    expireNote(noteNumber: number, time: number): void;
    readonly noteStore: {
        [noteNumber: number]: T;
    };
    onExpired(listener: (data: ExpiredMessage<T>) => void): void;
    offExpired(listener: (data: ExpiredMessage<T>) => void): void;
    private _expiredListener(message);
    onProgramChange(listener: (event: midi.ProgramChangeEvent) => void): void;
    offProgramChange(listener: (event: midi.ProgramChangeEvent) => void): void;
    receiveEvent(event: midi.Event, time: number): void;
    receiveRPN(rpn: number, data: number, time: number): void;
}
