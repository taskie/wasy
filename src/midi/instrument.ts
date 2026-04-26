import * as midi from "./event.js";
import { createSignal, type Signal } from "../signal.js";

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
        this._expiredEmitter = createSignal<ExpiredMessage<T>>();
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
    patch!: Patch<T>;
    notePool: NotePool<T>;
    private _expiredEmitter: Signal<ExpiredMessage<T>>;
    private _programChangeEmitter: Signal<midi.ProgramChangeEvent>;

    source: AudioNode;
    _panner: StereoPannerNode;
    _gain: GainNode;

    // Initialized via resetAllControl() called from the constructor.
    volume!: number;        //  7
    panpot!: number;        // 10
    expression!: number;    // 11
    pitchBend!: number;
    pitchBendRange!: number;

    bankMSB!: number;       //  0
    bankLSB!: number;       // 32

    // Channel-wide tuning (RPN 1 / RPN 2). Values are in cents.
    fineTune!: number;      // RPN 1: ±100 cents  (14-bit, center 0x2000)
    coarseTune!: number;    // RPN 2: ±64 semitones × 100 cents (7-bit MSB, center 0x40)

    // Sustain pedal (CC 64). While `sustain` is true, incoming NoteOff
    // events are deferred into `_sustainedNoteOffs` and dispatched in a
    // batch when the pedal is released.
    sustain!: boolean;
    private _sustainedNoteOffs: Map<number, midi.NoteOffEvent> = new Map();

    dataEntry!: number;
    rpn!: number;
    nrpn!: number;
    // Tracks whether the most recent parameter-select pair was RPN
    // (CC 100/101) or NRPN (CC 98/99). DataEntry (CC 6/38) is routed
    // to receiveRPN / receiveNRPN accordingly.
    private _lastParamType: "rpn" | "nrpn" = "rpn";

    constructor(public audioContext: AudioContext, public destination: AudioNode) {
        this.notePool = new NotePool<T>();
        this.notePool.onExpired(this._expiredListener.bind(this));
        this._expiredEmitter = createSignal<ExpiredMessage<T>>();
        this._programChangeEmitter = createSignal<midi.ProgramChangeEvent>();

        this._panner = this.audioContext.createStereoPanner();
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

        this.bankMSB = 0;
        this.bankLSB = 0;

        this.fineTune = 0;
        this.coarseTune = 0;

        this.sustain = false;
        this._sustainedNoteOffs.clear();

        this.dataEntry = 0;
        this.rpn = 0x3FFF;   // null RPN
        this.nrpn = 0x3FFF;  // null NRPN
        this._lastParamType = "rpn";
    }

    destroy() {
        this.notePool.unregisterAll();
        this._sustainedNoteOffs.clear();
        this._expiredEmitter.offAll();
        this._programChangeEmitter.offAll();
    }

    pause() {
        this.notePool.unregisterAll();
        this._sustainedNoteOffs.clear();
    }

    setPanpot(panpot: number) {
        this.panpot = panpot;
        // MIDI panpot 0-127 → StereoPanner pan -1..+1 (centered at 64).
        this._panner.pan.value = (panpot - 64) / 64;
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

    // Total pitch offset in cents = pitchBend + fineTune + coarseTune × 100.
    // The setter only adjusts pitchBend; fine/coarse tune stay as-is.
    set detune(detune: number) {
        const residual = detune - this.fineTune - this.coarseTune * 100;
        this.pitchBend = residual / 100 / this.pitchBendRange * 8192;
    }
    get detune() {
        return this.pitchBend / 8192 * this.pitchBendRange * 100
            + this.fineTune
            + this.coarseTune * 100;
    }

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
                case 0:     // BankSelectMSB
                    this.bankMSB = event.value;
                    break;
                case 32:    // BankSelectLSB
                    this.bankLSB = event.value;
                    break;
                case 7:     // Volume
                    this.setVolume(event.value, time);
                    break;
                case 10:    // Panpot
                    this.setPanpot(event.value);
                    break;
                case 11:    // Expression
                    this.setExpression(event.value, time);
                    break;
                case 64:    // Sustain (Damper) Pedal
                    this.setSustain(event.value, time);
                    break;
                case 6:     // DataEntryMSB
                    this.dataEntry &= 0b00000001111111;
                    this.dataEntry |= event.value << 7;
                    this._dispatchDataEntry(time);
                    break;
                case 38:    // DataEntryLSB
                    this.dataEntry &= 0b11111110000000;
                    this.dataEntry |= event.value;
                    this._dispatchDataEntry(time);
                    break;
                case 98:    // NRPN LSB
                    this.nrpn &= 0b11111110000000;
                    this.nrpn |= event.value;
                    this._lastParamType = "nrpn";
                    break;
                case 99:    // NRPN MSB
                    this.nrpn &= 0b00000001111111;
                    this.nrpn |= event.value << 7;
                    this._lastParamType = "nrpn";
                    break;
                case 100:   // RPN LSB
                    this.rpn &= 0b11111110000000;
                    this.rpn |= event.value;
                    this._lastParamType = "rpn";
                    break;
                case 101:   // RPN MSB
                    this.rpn &= 0b00000001111111;
                    this.rpn |= event.value << 7;
                    this._lastParamType = "rpn";
                    break;
                case 120: // AllSoundOff
                    this.notePool.unregisterAll();
                    this._sustainedNoteOffs.clear();
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
        } else if (event instanceof midi.NoteOnEvent) {
            // Re-pressing a note while sustain holds it cancels the
            // pending NoteOff — the new attack supersedes the release.
            this._sustainedNoteOffs.delete(event.noteNumber);
            if (this.patch) {
                this.patch.receiveEvent(event, time);
            }
        } else if (event instanceof midi.NoteOffEvent) {
            if (this.sustain) {
                this._sustainedNoteOffs.set(event.noteNumber, event);
            } else if (this.patch) {
                this.patch.receiveEvent(event, time);
            }
        } else {
            if (this.patch) {
                this.patch.receiveEvent(event, time);
            }
        }
    }

    setSustain(value: number, time: number) {
        const next = value >= 64;
        if (this.sustain === next) return;
        this.sustain = next;
        if (!next) {
            // Pedal released: dispatch every deferred NoteOff at `time`.
            // Using `time` (the CC's audio time) — not the original
            // NoteOff tick — keeps releases monotonic in audio order.
            if (this.patch) {
                for (const noteOff of this._sustainedNoteOffs.values()) {
                    this.patch.receiveEvent(noteOff, time);
                }
            }
            this._sustainedNoteOffs.clear();
        }
    }

    private _dispatchDataEntry(time: number) {
        if (this._lastParamType === "rpn") {
            if (this.rpn === 0x3FFF) return;
            this.receiveRPN(this.rpn, this.dataEntry, time);
        } else {
            if (this.nrpn === 0x3FFF) return;
            this.receiveNRPN(this.nrpn, this.dataEntry, time);
        }
    }

    receiveRPN(rpn: number, data: number, _time: number) {
        switch (rpn) {
            case 0: // pitch bend range: MSB = semitones, LSB = cents
                this.pitchBendRange = ((data >> 7) & 0x7F) + ((data & 0x7F) / 100);
                break;
            case 1: // channel fine tuning: 14-bit, center 0x2000, ±100 cents
                this.fineTune = (data - 0x2000) / 0x2000 * 100;
                break;
            case 2: // channel coarse tuning: MSB only, center 0x40, ±64 semitones
                this.coarseTune = ((data >> 7) & 0x7F) - 0x40;
                break;
            default:
                break;
        }
    }

    receiveNRPN(_nrpn: number, _data: number, _time: number) {
        // Hook for NRPN handling (GS / XG / vendor-specific). Default no-op.
    }
}
