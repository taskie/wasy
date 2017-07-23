import Signal from "../signal";
export declare class TimeStamp {
    tick: number;
    oldTick: number;
    currentTime: number;
    delayInSeconds: number;
    ticksPerSecond: number;
    accurateTime(tick: number): number;
}
export declare class Timer {
    audioContext: AudioContext;
    resolution: number;
    durationInSeconds: number;
    tick: number;
    oldTick: number;
    currentTime: number;
    delayInSeconds: number;
    secondsPerBeat: number;
    timerId: any;
    _emitter: Signal<TimeStamp>;
    ticksPerSecond: number;
    beatsPerMinute: number;
    constructor(audioContext: AudioContext, resolution?: number, durationInSeconds?: number);
    start(): void;
    onTiming(listener: (timeStamp: TimeStamp) => void): void;
    offTiming(listener: (timeStamp: TimeStamp) => void): void;
    timing(): void;
    createTimeStamp(): TimeStamp;
    invalidate(): void;
    resume(): void;
}
