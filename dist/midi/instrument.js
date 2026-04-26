import * as midi from "./event.js";
import Signal from "../signal.js";
export class NotePool {
    polyphony;
    _noteStore;
    _noteNumberQueue;
    _expiredEmitter;
    constructor(polyphony = 16) {
        this.polyphony = polyphony;
        this._noteStore = {};
        this._noteNumberQueue = [];
        this._expiredEmitter = new Signal();
    }
    onExpired(listener) {
        this._expiredEmitter.on(listener);
    }
    offExpired(listener) {
        this._expiredEmitter.off(listener);
    }
    register(noteNumber, data, time) {
        // check store
        {
            const oldData = this._noteStore[noteNumber];
            if (oldData != null) {
                this._expiredEmitter.emit({ data: oldData, time });
                const oldIndex = this._noteNumberQueue.indexOf(noteNumber);
                if (oldIndex !== -1) {
                    this._noteNumberQueue.splice(oldIndex, 1);
                }
            }
            this._noteStore[noteNumber] = data;
        }
        // check queue
        {
            this._noteNumberQueue.push(noteNumber);
            while (this._noteNumberQueue.length > this.polyphony) {
                const oldNoteNumber = this._noteNumberQueue.shift();
                const oldData = this._noteStore[oldNoteNumber];
                if (oldData != null) {
                    this._expiredEmitter.emit({ data: oldData, time });
                }
                delete this._noteStore[oldNoteNumber];
            }
        }
    }
    unregister(noteNumber, time) {
        const oldData = this._noteStore[noteNumber];
        if (oldData != null) {
            this._expiredEmitter.emit({ data: oldData, time });
            const oldIndex = this._noteNumberQueue.indexOf(noteNumber);
            if (oldIndex !== -1) {
                this._noteNumberQueue.splice(oldIndex, 1);
            }
        }
    }
    unregisterAll(time = 0) {
        for (const noteNumber of this._noteNumberQueue) {
            const data = this._noteStore[noteNumber];
            if (data != null) {
                this._expiredEmitter.emit({ data, time });
            }
        }
        this._noteStore = {};
        this._noteNumberQueue = [];
    }
    find(noteNumber) {
        return this._noteStore[noteNumber];
    }
    get noteStore() {
        return this._noteStore;
    }
    get noteNumberQueue() {
        return this._noteNumberQueue;
    }
}
export class Instrument {
    audioContext;
    destination;
    patch;
    notePool;
    _expiredEmitter;
    _programChangeEmitter;
    source;
    _panner;
    _gain;
    volume; //  7
    panpot; // 10
    expression; // 11
    pitchBend;
    pitchBendRange;
    dataEntry;
    rpn;
    constructor(audioContext, destination) {
        this.audioContext = audioContext;
        this.destination = destination;
        this.notePool = new NotePool();
        this.notePool.onExpired(this._expiredListener.bind(this));
        this._expiredEmitter = new Signal();
        this._programChangeEmitter = new Signal();
        this._panner = this.audioContext.createPanner();
        this._gain = this.audioContext.createGain();
        this.source = this._panner;
        this._panner.connect(this._gain);
        this._gain.connect(destination);
        this.resetAllControl();
    }
    resetAllControl() {
        this.volume = 100;
        this.panpot = 64;
        this.expression = 127;
        this.pitchBend = 0;
        this.pitchBendRange = 2;
        this.dataEntry = 0;
        this.rpn = 0;
    }
    destroy() {
        this.notePool.unregisterAll();
        this._expiredEmitter.offAll();
        this._programChangeEmitter.offAll();
    }
    pause() {
        this.notePool.unregisterAll();
    }
    setPanpot(panpot) {
        this.panpot = panpot;
        const value = (panpot - 64) * Math.PI / (64 * 2);
        this._panner.positionX.value = Math.sin(value);
        this._panner.positionY.value = 0;
        this._panner.positionZ.value = -Math.cos(value);
    }
    setVolume(volume, time) {
        this.volume = volume;
        this._gain.gain.cancelScheduledValues(time);
        this._gain.gain.setValueAtTime(volume / 127 * this.expression / 127, time);
    }
    setExpression(expression, time) {
        this.expression = expression;
        this._gain.gain.cancelScheduledValues(time);
        this._gain.gain.setValueAtTime(this.volume / 127 * expression / 127, time);
    }
    set detune(detune) { this.pitchBend = detune / 100 / this.pitchBendRange * 8192; }
    get detune() { return this.pitchBend / 8192 * this.pitchBendRange * 100; }
    registerNote(noteNumber, data, time) {
        this.notePool.register(noteNumber, data, time);
    }
    findNote(noteNumber) {
        return this.notePool.find(noteNumber);
    }
    expireNote(noteNumber, time) {
        this.notePool.unregister(noteNumber, time);
    }
    get noteStore() {
        return this.notePool.noteStore;
    }
    onExpired(listener) {
        this._expiredEmitter.on(listener);
    }
    offExpired(listener) {
        this._expiredEmitter.off(listener);
    }
    _expiredListener(message) {
        this._expiredEmitter.emit(message);
    }
    onProgramChange(listener) {
        this._programChangeEmitter.on(listener);
    }
    offProgramChange(listener) {
        this._programChangeEmitter.off(listener);
    }
    receiveEvent(event, time) {
        if (event instanceof midi.ControlChangeEvent) {
            switch (event.controller) {
                case 7: // Volume
                    this.setVolume(event.value, time);
                    break;
                case 10: // Panpot
                    this.setPanpot(event.value);
                    break;
                case 11: // Expression
                    this.setExpression(event.value, time);
                    break;
                case 6: // DataEntryMSB
                    this.dataEntry &= 0b11111110000000;
                    this.dataEntry |= event.value;
                    this.receiveRPN(this.rpn, this.dataEntry, time);
                    break;
                case 38: // DataEntryLSB
                    this.dataEntry &= 0b00000001111111;
                    this.dataEntry |= event.value << 7;
                    break;
                case 100: // RPN LSB
                    this.rpn &= 0b11111110000000;
                    this.rpn |= event.value;
                    break;
                case 101: // RPN MSB
                    this.rpn &= 0b00000001111111;
                    this.rpn |= event.value << 7;
                    break;
                case 120: // AllSoundOff
                    this.notePool.unregisterAll();
                    break;
                case 121: // ResetAllControl
                    this.resetAllControl();
                    break;
                default:
                    if (this.patch) {
                        this.patch.receiveEvent(event, time);
                    }
                    break;
            }
        }
        else if (event instanceof midi.ProgramChangeEvent) {
            this._programChangeEmitter.emit(event);
        }
        else {
            if (this.patch) {
                this.patch.receiveEvent(event, time);
            }
        }
    }
    receiveRPN(rpn, data, time) {
        switch (rpn) {
            case 0: // pitch bend range
                this.pitchBendRange = data;
                break;
            default:
                break;
        }
    }
}
//# sourceMappingURL=instrument.js.map