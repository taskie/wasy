import * as midi from "./event.js";
import Signal from "../signal.js";

export interface ExpiredMessage<T> {
    data: T;
    time: number;
}

export class NotePool<T> {
    _noteStore: { [noteNumber: number]: T | undefined };
    _noteNumberQueue: number[];
    _expiredEmitter: Signal<ExpiredMessage<T>>;

    constructor(public polyphony: number = 16) {
        this._noteStore = {};
        this._noteNumberQueue = [];
        this._expiredEmitter = new Signal<ExpiredMessage<T>>();
    }

    onExpired(listener: (message: ExpiredMessage<T>) => void) {
        this._expiredEmitter.on(listener);
    }

    offExpired(listener: (message: ExpiredMessage<T>) => void) {
        this._expiredEmitter.off(listener);
    }

    register(noteNumber: number, data: T, time: number) {
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
                const oldNoteNumber = this._noteNumberQueue.shift()!;
                const oldData = this._noteStore[oldNoteNumber];
                if (oldData != null) {
                    this._expiredEmitter.emit({ data: oldData, time });
                }
                delete this._noteStore[oldNoteNumber];
            }
        }
    }

    unregister(noteNumber: number, time: number) {
        const oldData = this._noteStore[noteNumber];
        if (oldData != null) {
            this._expiredEmitter.emit({ data: oldData, time });
            const oldIndex = this._noteNumberQueue.indexOf(noteNumber);
            if (oldIndex !== -1) {
                this._noteNumberQueue.splice(oldIndex, 1);
            }
        }
    }

    unregisterAll(time: number = 0) {
        for (const noteNumber of this._noteNumberQueue) {
            const data = this._noteStore[noteNumber];
            if (data != null) {
                this._expiredEmitter.emit({ data, time });
            }
        }
        this._noteStore = {};
        this._noteNumberQueue = [];
    }

    find(noteNumber: number): T | undefined {
        return this._noteStore[noteNumber];
    }

    get noteStore() {
        return this._noteStore;
    }

    get noteNumberQueue(): number[] {
        return this._noteNumberQueue;
    }
}

// The `_T` type parameter is unused inside the interface body but flows
// through `Instrument<T>` to bind the patch's monophony type.
export interface Patch<_T> {
    receiveEvent(event: midi.Event, time: number): void;
}

export class Instrument<T> {
    patch: Patch<T>;
    notePool: NotePool<T>;
    private _expiredEmitter: Signal<ExpiredMessage<T>>;
    private _programChangeEmitter: Signal<midi.ProgramChangeEvent>;

    source: AudioNode;
    _panner: PannerNode;
    _gain: GainNode;

    volume: number;        //  7
    panpot: number;        // 10
    expression: number;    // 11
    pitchBend: number;
    pitchBendRange: number;

    dataEntry: number;
    rpn: number;

    constructor(public audioContext: AudioContext, public destination: AudioNode) {
        this.notePool = new NotePool<T>();
        this.notePool.onExpired(this._expiredListener.bind(this));
        this._expiredEmitter = new Signal<ExpiredMessage<T>>();
        this._programChangeEmitter = new Signal<midi.ProgramChangeEvent>();

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

    setPanpot(panpot: number) {
        this.panpot = panpot;
        const value = (panpot - 64) * Math.PI / (64 * 2);
        this._panner.positionX.value = Math.sin(value);
        this._panner.positionY.value = 0;
        this._panner.positionZ.value = -Math.cos(value);
    }

    setVolume(volume: number, time: number) {
        this.volume = volume;
        this._gain.gain.cancelScheduledValues(time);
        this._gain.gain.setValueAtTime(volume / 127 * this.expression / 127, time);
    }

    setExpression(expression: number, time: number) {
        this.expression = expression;
        this._gain.gain.cancelScheduledValues(time);
        this._gain.gain.setValueAtTime(this.volume / 127 * expression / 127, time);
    }

    set detune(detune: number) { this.pitchBend = detune / 100 / this.pitchBendRange * 8192; }
    get detune() { return this.pitchBend / 8192 * this.pitchBendRange * 100; }

    registerNote(noteNumber: number, data: T, time: number) {
        this.notePool.register(noteNumber, data, time);
    }

    findNote(noteNumber: number) {
        return this.notePool.find(noteNumber);
    }

    expireNote(noteNumber: number, time: number) {
        this.notePool.unregister(noteNumber, time);
    }

    get noteStore() {
        return this.notePool.noteStore;
    }

    onExpired(listener: (data: ExpiredMessage<T>) => void) {
        this._expiredEmitter.on(listener);
    }

    offExpired(listener: (data: ExpiredMessage<T>) => void) {
        this._expiredEmitter.off(listener);
    }

    private _expiredListener(message: ExpiredMessage<T>) {
        this._expiredEmitter.emit(message);
    }

    onProgramChange(listener: (event: midi.ProgramChangeEvent) => void) {
        this._programChangeEmitter.on(listener);
    }

    offProgramChange(listener: (event: midi.ProgramChangeEvent) => void) {
        this._programChangeEmitter.off(listener);
    }

    receiveEvent(event: midi.Event, time: number) {
        if (event instanceof midi.ControlChangeEvent) {
            switch (event.controller) {
                case 7:     // Volume
                    this.setVolume(event.value, time);
                    break;
                case 10:    // Panpot
                    this.setPanpot(event.value);
                    break;
                case 11:    // Expression
                    this.setExpression(event.value, time);
                    break;
                case 6:     // DataEntryMSB
                    this.dataEntry &= 0b11111110000000;
                    this.dataEntry |= event.value;
                    this.receiveRPN(this.rpn, this.dataEntry, time);
                    break;
                case 38:    // DataEntryLSB
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
        } else if (event instanceof midi.ProgramChangeEvent) {
            this._programChangeEmitter.emit(event);
        } else {
            if (this.patch) {
                this.patch.receiveEvent(event, time);
            }
        }
    }

    receiveRPN(rpn: number, data: number, _time: number) {
        switch (rpn) {
            case 0: // pitch bend range
                this.pitchBendRange = data;
                break;
            default:
                break;
        }
    }
}
