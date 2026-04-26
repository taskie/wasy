import Signal from "../signal.js";
export class TimeStamp {
    tick;
    oldTick;
    currentTime;
    delayInSeconds;
    ticksPerSecond;
    accurateTime(tick) {
        const diff = (tick - this.oldTick) / this.ticksPerSecond;
        return this.currentTime + this.delayInSeconds + diff;
    }
}
export class Timer {
    audioContext;
    resolution;
    durationInSeconds;
    tick;
    oldTick;
    currentTime;
    delayInSeconds;
    secondsPerBeat;
    timerId = null;
    _emitter;
    get ticksPerSecond() { return this.resolution / this.secondsPerBeat; }
    set ticksPerSecond(tps) { this.secondsPerBeat = this.resolution / tps; }
    get beatsPerMinute() { return 60 / this.secondsPerBeat; }
    set beatsPerMinute(bpm) { this.secondsPerBeat = 60 / bpm; }
    constructor(audioContext, resolution = 480, durationInSeconds = 0.2) {
        this.audioContext = audioContext;
        this.resolution = resolution;
        this.durationInSeconds = durationInSeconds;
        this.beatsPerMinute = 120;
        this.delayInSeconds = 0.2;
        this._emitter = new Signal();
    }
    start() {
        this.currentTime = this.audioContext.currentTime;
        this.oldTick = 0;
        this.tick = 0;
        this.invalidate();
        this.timerId = setInterval(this.timing.bind(this), this.durationInSeconds * 1000);
    }
    onTiming(listener) {
        this._emitter.on(listener);
    }
    offTiming(listener) {
        this._emitter.off(listener);
    }
    timing() {
        this.oldTick = this.tick;
        this.tick += this.ticksPerSecond * this.durationInSeconds;
        this.currentTime = this.audioContext.currentTime;
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
        this.invalidate();
        this.timerId = setInterval(this.timing.bind(this), this.durationInSeconds * 1000);
    }
}
//# sourceMappingURL=timer.js.map