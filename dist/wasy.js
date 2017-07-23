"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const midi = require("./midi/event");
const timer = require("./player/timer");
const signal_1 = require("./signal");
const inst = require("./midi/instrument");
const synth_1 = require("./synth");
class Wasy {
    constructor(audioContext, destination, buffer) {
        this.audioContext = audioContext;
        if (buffer != null) {
            this.playerWorker = new Worker("./player-worker.js");
            let initMessage = { type: "init", buffer };
            this.playerWorker.postMessage(initMessage, [initMessage.buffer]);
            this.playerWorker.postMessage({ type: "resolution" });
            this.playerWorker.addEventListener("message", this.playerWorkerMessageListener.bind(this));
        }
        this.timer = new timer.Timer(this.audioContext);
        this.timer.onTiming(this.timingListener.bind(this));
        this.patchGenerator = new synth_1.PatchGenerator();
        this.instruments = [];
        this.gain = this.audioContext.createGain();
        this.gain.gain.value = 0.1;
        this.dynamicsCompressor = this.audioContext.createDynamicsCompressor();
        this.gain.connect(this.dynamicsCompressor);
        this.dynamicsCompressor.connect(destination);
        for (let i = 0; i < 16; ++i) {
            let instrument = new inst.Instrument(this.audioContext, this.gain);
            instrument.patch = this.patchGenerator.generate(instrument, 0, i === 9);
            this.instruments[i] = instrument;
            instrument.onExpired((data) => {
                data.data.parentPatch.onExpired(data.data, data.time);
            });
            instrument.onProgramChange((event) => {
                instrument.patch = this.patchGenerator.generate(instrument, event.program, i === 9);
            });
        }
        this.paused = false;
        this._emitter = new signal_1.default();
    }
    play() {
        this.timer.start();
    }
    pause() {
        if (this.paused)
            return;
        this.timer.invalidate();
        for (let instrument of this.instruments) {
            instrument.pause();
        }
        this.paused = true;
    }
    resume() {
        if (!this.paused)
            return;
        this.timer.resume();
        this.paused = false;
    }
    destroy() {
        this.timer.invalidate();
        this.playerWorker = null;
        this._emitter.offAll();
        for (let instrument of this.instruments) {
            instrument.destroy();
        }
    }
    playerWorkerMessageListener(event) {
        switch (event.data.type) {
            case "resolution":
                this.timer.resolution = event.data.resolution;
                break;
            case "read":
                if (this.paused)
                    break;
                let newEventsStore = event.data.newEventsStore;
                let timeStamp = event.data.timeStamp;
                timeStamp.__proto__ = timer.TimeStamp.prototype;
                newEventsStore.forEach((newEvents, channelNumber) => {
                    for (let newEvent of newEvents) {
                        let event = midi.Event.create(newEvent.dataView, newEvent.tick, newEvent.status);
                        this._emitter.emit({ timeStamp, midiEvent: event });
                        let time = timeStamp.accurateTime(event.tick);
                        this.instruments[channelNumber].receiveEvent(event, time);
                        if (channelNumber === 0) {
                            if (event instanceof midi.TempoMetaEvent) {
                                this.timer.secondsPerBeat = event.secondsPerBeat;
                            }
                        }
                    }
                });
                break;
            default:
                break;
        }
    }
    receiveExternalMidiEvent(event) {
        const time = this.audioContext.currentTime;
        if (event instanceof midi.ChannelEvent) {
            this.instruments[event.channel].receiveEvent(event, time);
        }
        else {
            for (const instrument of this.instruments) {
                instrument.receiveEvent(event, time);
            }
        }
        const timeStamp = this.timer.createTimeStamp();
        timeStamp.currentTime = time;
        this._emitter.emit({ timeStamp, midiEvent: event });
    }
    onTimedEvent(listener) {
        this._emitter.on(listener);
    }
    offTimedEvent(listener) {
        this._emitter.off(listener);
    }
    timingListener(timeStamp) {
        if (this.playerWorker != null) {
            this.playerWorker.postMessage({ type: "read", timeStamp });
        }
    }
}
exports.Wasy = Wasy;
//# sourceMappingURL=wasy.js.map