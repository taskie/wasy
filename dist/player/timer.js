"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const signal_1 = require("../signal");
class TimeStamp {
    accurateTime(tick) {
        let diff = (tick - this.oldTick) / this.ticksPerSecond;
        return this.currentTime + this.delayInSeconds + diff;
    }
}
exports.TimeStamp = TimeStamp;
class Timer {
    constructor(audioContext, resolution = 480, durationInSeconds = 0.2) {
        this.audioContext = audioContext;
        this.resolution = resolution;
        this.durationInSeconds = durationInSeconds;
        this.beatsPerMinute = 120;
        this.delayInSeconds = 0.2;
        this._emitter = new signal_1.default();
    }
    get ticksPerSecond() { return this.resolution / this.secondsPerBeat; }
    set ticksPerSecond(tps) { this.secondsPerBeat = this.resolution / tps; }
    get beatsPerMinute() { return 60 / this.secondsPerBeat; }
    set beatsPerMinute(bpm) { this.secondsPerBeat = 60 / bpm; }
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
        let timeStamp = new TimeStamp();
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
exports.Timer = Timer;
//# sourceMappingURL=timer.js.map