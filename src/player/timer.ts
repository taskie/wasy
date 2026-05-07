import { createSignal, type Signal } from "../signal.js";

export class TimeStamp {
    tick!: number;
    oldTick!: number;
    currentTime!: number;
    delayInSeconds!: number;
    ticksPerSecond!: number;

    accurateTime(tick: number) {
        const diff = (tick - this.oldTick) / this.ticksPerSecond;
        return this.currentTime + this.delayInSeconds + diff;
    }
}

export class Timer {
    tick = 0;
    oldTick = 0;
    currentTime = 0;
    delayInSeconds: number;
    secondsPerBeat!: number;
    speedFactor = 1;

    timerId: ReturnType<typeof setInterval> | null = null;
    _emitter: Signal<TimeStamp>;

    get ticksPerSecond() {
        return (this.resolution / this.secondsPerBeat) * this.speedFactor;
    }
    set ticksPerSecond(tps: number) {
        this.secondsPerBeat = (this.resolution * this.speedFactor) / tps;
    }

    get beatsPerMinute() {
        return 60 / this.secondsPerBeat;
    }
    set beatsPerMinute(bpm: number) {
        this.secondsPerBeat = 60 / bpm;
    }

    constructor(
        public audioContext: AudioContext,
        public resolution: number = 480,
        public durationInSeconds: number = 0.025,
    ) {
        this.beatsPerMinute = 120;
        this.delayInSeconds = 0.2;
        this._emitter = createSignal<TimeStamp>();
    }

    start() {
        this.currentTime = this.audioContext.currentTime;
        this.oldTick = 0;
        this.tick = 0;
        this._scheduleInterval();
    }

    onTiming(listener: (timeStamp: TimeStamp) => void) {
        this._emitter.on(listener);
    }

    offTiming(listener: (timeStamp: TimeStamp) => void) {
        this._emitter.off(listener);
    }

    timing() {
        const now = this.audioContext.currentTime;
        const elapsed = now - this.currentTime;
        this.oldTick = this.tick;
        // Advance tick by the actual elapsed audio time, not an assumed
        // `durationInSeconds`. This anchors musical time to the audio
        // clock so setInterval jitter doesn't slow the music down.
        this.tick += this.ticksPerSecond * elapsed;
        this.currentTime = now;
        this._emitter.emit(this.createTimeStamp());
    }

    createTimeStamp() {
        const timeStamp = new TimeStamp();
        timeStamp.tick = this.tick;
        timeStamp.oldTick = this.oldTick;
        timeStamp.currentTime = this.currentTime;
        timeStamp.delayInSeconds = this.delayInSeconds;
        timeStamp.ticksPerSecond = this.ticksPerSecond;
        return timeStamp;
    }

    invalidate() {
        if (this.timerId != null) {
            clearInterval(this.timerId);
        }
        this.timerId = null;
    }

    resume() {
        // Reset the anchor to "now" so the first post-resume fire doesn't
        // see the entire pause duration as elapsed audio time.
        this.currentTime = this.audioContext.currentTime;
        this._scheduleInterval();
    }

    private _scheduleInterval() {
        this.invalidate();
        this.timerId = setInterval(this.timing.bind(this), this.durationInSeconds * 1000);
    }
}
