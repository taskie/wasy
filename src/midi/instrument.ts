import * as midi from "./event.js";
import { createSignal, type Signal } from "../signal.js";
import { cancelAndHold, scheduleLinearRamp } from "../synth/audio-param.js";

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

// Anti-zipper ramp time for CC 7 / CC 11 / CC 10 (volume / expression /
// panpot). 8 ms is short enough to feel instantaneous for performance use
// yet long enough to remove the sample-boundary click that comes from a
// stepwise `setValueAtTime` write.
const SMOOTHING_TIME = 0.008;

export class Instrument<T> {
    patch!: Patch<T>;
    notePool: NotePool<T>;
    private _expiredEmitter: Signal<ExpiredMessage<T>>;
    private _programChangeEmitter: Signal<midi.ProgramChangeEvent>;

    source: AudioNode;
    _panner: StereoPannerNode;
    // Channel-wide lowpass filter. Sits between `_panner` and `_gain` and
    // is driven by CC 71 (Resonance / Q) and CC 74 (Brightness / cutoff).
    // Default is effectively bypass (cutoff at 12 kHz, Q=1) — patches
    // without their own filter can still respond to brightness changes.
    _filter: BiquadFilterNode;
    _gain: GainNode;
    // Per-channel send gains for CC 91 (Reverb) and CC 93 (Chorus). Default
    // to 0 (dry only). SynthEngine taps the channelGain output into these
    // and routes their output into the engine-level effect buses.
    _reverbSend: GainNode;
    _chorusSend: GainNode;
    // Channel-wide detune bus. Emits the current total detune offset (in
    // cents, = pitchBend + fineTune + coarseTune * 100) as a DC value;
    // each note's oscillator / filter `.detune` AudioParam connects in,
    // so writes to `_detuneOffset.offset` propagate to every in-flight
    // note instantly without iterating the NotePool.
    private _detuneOffset: ConstantSourceNode;
    // Vibrato LFO (CC 1 — Modulation Wheel). 5 Hz sine, depth controlled
    // by `_modDepth.gain` in cents. Output of `_modDepth` is connected to
    // each note's detune param alongside `_detuneOffset`, so the channel
    // detune bus carries DC (pitch bend + tune) + AC (vibrato) summed.
    private _modLfo: OscillatorNode;
    private _modDepth: GainNode;

    // Initialized via resetAllControl() called from the constructor.
    volume!: number; //  7
    panpot!: number; // 10
    expression!: number; // 11
    pitchBend!: number;
    pitchBendRange!: number;

    bankMSB!: number; //  0
    bankLSB!: number; // 32

    // Channel-wide tuning (RPN 1 / RPN 2). Values are in cents.
    fineTune!: number; // RPN 1: ±100 cents  (14-bit, center 0x2000)
    coarseTune!: number; // RPN 2: ±64 semitones × 100 cents (7-bit MSB, center 0x40)

    // CC 1 — Modulation Wheel. Drives vibrato depth as a fraction of
    // `modDepthRangeCents` (combined with CC 77; see `_vibratoFraction`).
    modulationValue!: number;
    // CC 76 — Vibrato Rate (GM2 sound controller). 64 = base 5 Hz LFO;
    // each ±64 steps is ∓ / ± one octave of LFO rate.
    vibratoRate!: number;
    // CC 77 — Vibrato Depth (GM2 sound controller). 64 = no added depth;
    // combines additively with the Mod Wheel (see `_vibratoFraction`).
    vibratoDepth!: number;
    // RPN 5 — Modulation Depth Range, in cents. GM2 default 50 (= 0.5
    // semitone). The full-depth vibrato amplitude the Mod Wheel / CC 77
    // map onto.
    modDepthRangeCents!: number;
    // CC 74 — Brightness / Filter Cutoff. 0..127, 64 = neutral.
    // Mapped exponentially around 12 kHz so 0 ≈ 750 Hz, 127 ≈ 16 kHz.
    filterCutoff!: number;
    // CC 71 — Filter Resonance. 0..127, 64 = neutral.
    // Mapped to BiquadFilter Q in [0.5, 12] (logarithmic around 1).
    filterResonance!: number;
    // CC 91 — Reverb Send. 0..127, default 40 (the GM2-specified default).
    reverbSendValue!: number;
    // CC 93 — Chorus Send. 0..127, default 0 (dry only).
    chorusSendValue!: number;

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

    constructor(
        public audioContext: AudioContext,
        public destination: AudioNode,
    ) {
        this.notePool = new NotePool<T>();
        this.notePool.onExpired(this._expiredListener.bind(this));
        this._expiredEmitter = createSignal<ExpiredMessage<T>>();
        this._programChangeEmitter = createSignal<midi.ProgramChangeEvent>();

        this._panner = this.audioContext.createStereoPanner();
        // Lowpass at 12 kHz / Q=1 is a near-bypass for normal program audio
        // but lets CC 74 (cutoff) / CC 71 (resonance) sweep into audible
        // range. One filter per channel keeps the cost flat regardless of
        // polyphony.
        this._filter = this.audioContext.createBiquadFilter();
        this._filter.type = "lowpass";
        this._filter.frequency.value = 12000;
        this._filter.Q.value = 1;
        this._gain = this.audioContext.createGain();
        this.source = this._panner;
        this._panner.connect(this._filter);
        this._filter.connect(this._gain);
        this._gain.connect(destination);

        // Send taps are only consumers — SynthEngine connects channelGain
        // into these on construction and routes their output into the
        // engine-level effect buses. We just expose them and own the gain.
        this._reverbSend = this.audioContext.createGain();
        // GM2 default Reverb Send Level is 40 (chorus stays 0); keep the
        // node in sync with the `reverbSendValue = 40` state default.
        this._reverbSend.gain.value = 40 / 127;
        this._chorusSend = this.audioContext.createGain();
        this._chorusSend.gain.value = 0;

        // ConstantSourceNode emits a DC `offset` value to whatever it's
        // connected to. We connect `offset` to each note's detunable param
        // (oscillator.detune / filter.detune) on NoteOn; updating
        // `_detuneOffset.offset` then changes pitch on all in-flight notes.
        // Output is param-only; no audio path to the speakers.
        this._detuneOffset = this.audioContext.createConstantSource();
        this._detuneOffset.offset.value = 0;
        this._detuneOffset.start();

        // Vibrato LFO: 5 Hz sine → modDepth (cents). Each note's detune
        // param connects from `_modDepth` alongside `_detuneOffset`, so the
        // channel detune bus carries DC (pitch bend + tune) + AC (vibrato).
        this._modLfo = this.audioContext.createOscillator();
        this._modLfo.type = "sine";
        this._modLfo.frequency.value = 5;
        this._modDepth = this.audioContext.createGain();
        this._modDepth.gain.value = 0;
        this._modLfo.connect(this._modDepth);
        this._modLfo.start();

        this.resetAllControl();
        // Align the gain node with the GM default state (volume 100 /
        // expression 127) so a channel that never receives CC 7 / CC 11
        // plays at the spec-default level rather than the node's raw 1.0.
        this._gain.gain.value = this._channelGain();
    }

    get detuneOffset(): ConstantSourceNode {
        return this._detuneOffset;
    }
    // Output of the modulation LFO scaled by `_modDepth.gain` (cents).
    // Patches connect this into each note's detune param on NoteOn.
    get modulation(): AudioNode {
        return this._modDepth;
    }
    // Wet send taps — SynthEngine routes channelGain into these and their
    // output into the engine-level Reverb / Chorus inputs.
    get reverbSend(): GainNode {
        return this._reverbSend;
    }
    get chorusSend(): GainNode {
        return this._chorusSend;
    }

    // Reset all controllers to GM defaults AND ramp the corresponding
    // audio params back to those defaults. This is the form that matches
    // the audible behavior of CC 121 (Reset All Controllers) and GS / XG
    // Reset SysEx — `resetAllControl()` alone only updates the state
    // fields, leaving previously-set audio params unchanged.
    applyReset(time: number) {
        // Dispatch pedal-held NoteOffs before wiping state — clearing the
        // deferred map without dispatching would leave those notes stuck
        // on (they would never receive their NoteOff).
        this.setSustain(0, time);
        this.resetAllControl();
        this._updateDetuneOffset(time);
        this.setVolume(this.volume, time);
        this.setExpression(this.expression, time);
        this.setPanpot(this.panpot, time);
        this.setModulation(this.modulationValue, time);
        this.setVibratoRate(this.vibratoRate, time);
        this.setFilterCutoff(this.filterCutoff, time);
        this.setFilterResonance(this.filterResonance, time);
        this.setReverbSend(this.reverbSendValue, time);
        this.setChorusSend(this.chorusSendValue, time);
    }

    // RP-015 "Response to Reset All Controllers" — the scope GM1 / GM2
    // mandate for CC 121. Resets only the performance controllers:
    // modulation, expression, sustain (releasing pedal-held notes at
    // `time`), pitch bend, and the RPN / NRPN parameter *selection*.
    // Volume / panpot / bank select / effect sends / sound controllers
    // and the RPN *values* (pitch bend range, fine / coarse tune) are
    // deliberately left untouched — wiping those is GS / XG System On
    // territory (`applyReset`); doing it on a mid-song CC 121 would
    // audibly destroy the mix.
    applyResetAllControllers(time: number) {
        this.setSustain(0, time);
        this.setModulation(0, time);
        this.setExpression(127, time);
        this.pitchBend = 0;
        this._updateDetuneOffset(time);
        this.dataEntry = 0;
        this.rpn = 0x3fff; // null RPN
        this.nrpn = 0x3fff; // null NRPN
        this._lastParamType = "rpn";
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

        this.modulationValue = 0;
        this.vibratoRate = 64;
        this.vibratoDepth = 64;
        this.modDepthRangeCents = 50;
        this.filterCutoff = 64;
        this.filterResonance = 64;
        // GM2 default Reverb Send Level is 40 (0x28); Chorus stays 0.
        this.reverbSendValue = 40;
        this.chorusSendValue = 0;

        this.sustain = false;
        this._sustainedNoteOffs.clear();

        this.dataEntry = 0;
        this.rpn = 0x3fff; // null RPN
        this.nrpn = 0x3fff; // null NRPN
        this._lastParamType = "rpn";
    }

    destroy() {
        this.notePool.unregisterAll();
        this._sustainedNoteOffs.clear();
        this._expiredEmitter.offAll();
        this._programChangeEmitter.offAll();
        try {
            this._detuneOffset.stop();
        } catch {
            /* already stopped */
        }
        this._detuneOffset.disconnect();
        try {
            this._modLfo.stop();
        } catch {
            /* already stopped */
        }
        this._modLfo.disconnect();
        this._modDepth.disconnect();
        this._filter.disconnect();
        this._reverbSend.disconnect();
        this._chorusSend.disconnect();
    }

    pause() {
        this.notePool.unregisterAll();
        this._sustainedNoteOffs.clear();
    }

    setPanpot(panpot: number, time: number) {
        this.panpot = panpot;
        // MIDI panpot 0-127 → StereoPanner pan -1..+1 (centered at 64).
        this._rampParam(this._panner.pan, (panpot - 64) / 64, time);
    }

    setVolume(volume: number, time: number) {
        this.volume = volume;
        this._rampGain(this._channelGain(), time);
    }

    setExpression(expression: number, time: number) {
        this.expression = expression;
        this._rampGain(this._channelGain(), time);
    }

    // GM2 volume / expression response curve: dB = 40·log10(v/127), i.e.
    // gain = (v/127)² per controller. The previous linear v/127 made CC 7
    // / CC 11 inconsistent with the squared velocity curve (see synth.ts)
    // and compressed the usable dynamic range.
    private _channelGain() {
        const v = this.volume / 127;
        const e = this.expression / 127;
        return v * v * e * e;
    }

    private _rampGain(target: number, time: number) {
        this._rampParam(this._gain.gain, target, time);
    }

    // Push the current total detune (in cents) onto `_detuneOffset.offset`
    // with the same anti-zipper ramp used for volume / panpot. All notes
    // whose detunable params connect from `_detuneOffset` track this in
    // real time — pitch bend and RPN tuning changes no longer need to
    // walk the NotePool.
    private _updateDetuneOffset(time: number) {
        this._rampParam(this._detuneOffset.offset, this.detune, time);
    }

    // `cancelAndHold` anchors the ramp at the param's scheduled value at
    // `time` rather than `param.value` (the value at `currentTime`), so
    // back-to-back CC changes inside the player's lookahead window chain
    // correctly instead of restarting from a stale value.
    private _rampParam(param: AudioParam, target: number, time: number) {
        cancelAndHold(param, time);
        scheduleLinearRamp(param, target, time + SMOOTHING_TIME);
    }

    setModulation(value: number, time: number) {
        this.modulationValue = value;
        this._applyVibratoDepth(time);
    }

    // CC 77 — Vibrato Depth (GM2). Combines with the Mod Wheel; 64 (the
    // GM2 default) adds nothing, so a channel that only ever sees the Mod
    // Wheel behaves exactly as before.
    setVibratoDepth(value: number, time: number) {
        this.vibratoDepth = value;
        this._applyVibratoDepth(time);
    }

    // CC 76 — Vibrato Rate (GM2). 64 = base 5 Hz; ±64 steps = ∓ / ± one
    // octave of LFO rate (0 → 2.5 Hz, 127 → ~9.9 Hz).
    setVibratoRate(value: number, time: number) {
        this.vibratoRate = value;
        this._rampParam(this._modLfo.frequency, 5 * Math.pow(2, (value - 64) / 64), time);
    }

    // Combined vibrato amount in [0, 1]: the Mod Wheel fraction plus CC 77's
    // signed offset (centered at its default 64), clamped. Both controllers
    // can drive vibrato on their own; either at full and the other at
    // default reaches (near) the full `modDepthRangeCents` amplitude.
    private _vibratoFraction(): number {
        const wheel = this.modulationValue / 127;
        const depth = (this.vibratoDepth - 64) / 64;
        return Math.min(1, Math.max(0, wheel + depth));
    }

    private _applyVibratoDepth(time: number) {
        this._rampParam(
            this._modDepth.gain,
            this.modDepthRangeCents * this._vibratoFraction(),
            time,
        );
    }

    setFilterCutoff(value: number, time: number) {
        this.filterCutoff = value;
        // 0..127 → 750..16000 Hz (exponential, ~4.4 octaves). 64 maps to
        // ~5.4 kHz — slightly darker than the 12 kHz default so a CC 74=64
        // write produces a perceptible reset rather than a no-op.
        const target = 750 * Math.pow(16000 / 750, value / 127);
        this._rampParam(this._filter.frequency, target, time);
    }

    setFilterResonance(value: number, time: number) {
        this.filterResonance = value;
        // 0..127 → 0.5..12 (logarithmic, 64 ≈ 1). High Q gets metallic so
        // we cap the upper end conservatively.
        const target = 0.5 * Math.pow(24, value / 127);
        this._rampParam(this._filter.Q, target, time);
    }

    setReverbSend(value: number, time: number) {
        this.reverbSendValue = value;
        this._rampParam(this._reverbSend.gain, value / 127, time);
    }

    setChorusSend(value: number, time: number) {
        this.chorusSendValue = value;
        this._rampParam(this._chorusSend.gain, value / 127, time);
    }

    // Total pitch offset in cents = pitchBend + fineTune + coarseTune × 100.
    // The setter only adjusts pitchBend; fine/coarse tune stay as-is.
    set detune(detune: number) {
        const residual = detune - this.fineTune - this.coarseTune * 100;
        this.pitchBend = (residual / 100 / this.pitchBendRange) * 8192;
    }
    get detune() {
        return (
            (this.pitchBend / 8192) * this.pitchBendRange * 100 +
            this.fineTune +
            this.coarseTune * 100
        );
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
                case 0: // BankSelectMSB
                    this.bankMSB = event.value;
                    break;
                case 32: // BankSelectLSB
                    this.bankLSB = event.value;
                    break;
                case 7: // Volume
                    this.setVolume(event.value, time);
                    break;
                case 10: // Panpot
                    this.setPanpot(event.value, time);
                    break;
                case 11: // Expression
                    this.setExpression(event.value, time);
                    break;
                case 1: // Modulation Wheel
                    this.setModulation(event.value, time);
                    break;
                case 76: // Vibrato Rate (GM2)
                    this.setVibratoRate(event.value, time);
                    break;
                case 77: // Vibrato Depth (GM2)
                    this.setVibratoDepth(event.value, time);
                    break;
                case 71: // Filter Resonance
                    this.setFilterResonance(event.value, time);
                    break;
                case 74: // Brightness / Filter Cutoff
                    this.setFilterCutoff(event.value, time);
                    break;
                case 91: // Reverb Send
                    this.setReverbSend(event.value, time);
                    break;
                case 93: // Chorus Send
                    this.setChorusSend(event.value, time);
                    break;
                case 64: // Sustain (Damper) Pedal
                    this.setSustain(event.value, time);
                    break;
                case 6: // DataEntryMSB
                    this.dataEntry &= 0b00000001111111;
                    this.dataEntry |= event.value << 7;
                    this._dispatchDataEntry(time);
                    break;
                case 38: // DataEntryLSB
                    this.dataEntry &= 0b11111110000000;
                    this.dataEntry |= event.value;
                    this._dispatchDataEntry(time);
                    break;
                case 98: // NRPN LSB
                    this.nrpn &= 0b11111110000000;
                    this.nrpn |= event.value;
                    this._lastParamType = "nrpn";
                    break;
                case 99: // NRPN MSB
                    this.nrpn &= 0b00000001111111;
                    this.nrpn |= event.value << 7;
                    this._lastParamType = "nrpn";
                    break;
                case 100: // RPN LSB
                    this.rpn &= 0b11111110000000;
                    this.rpn |= event.value;
                    this._lastParamType = "rpn";
                    break;
                case 101: // RPN MSB
                    this.rpn &= 0b00000001111111;
                    this.rpn |= event.value << 7;
                    this._lastParamType = "rpn";
                    break;
                case 120: // AllSoundOff
                    // Silence at the event's scheduled audio time, not at
                    // dispatch time (which runs ~200 ms early under the
                    // player's lookahead).
                    this.notePool.unregisterAll(time);
                    this._sustainedNoteOffs.clear();
                    break;
                case 121: // ResetAllControl (RP-015 scope — not a full GM reset)
                    this.applyResetAllControllers(time);
                    break;
                case 122: // Local Control on/off — no-op for a soft synth
                    // (there is no local keyboard to disconnect).
                    break;
                case 123: // AllNotesOff
                // CC 124–127 (Omni Off / Omni On / Mono On / Poly On) each
                // imply an All Notes Off per the GM spec. We honor that;
                // the omni / mono / poly mode itself stays poly (a mono
                // voice allocator is out of scope).
                case 124:
                case 125:
                case 126:
                case 127:
                    this.allNotesOff(time);
                    break;
                default:
                    if (this.patch) {
                        this.patch.receiveEvent(event, time);
                    }
                    break;
            }
        } else if (event instanceof midi.ProgramChangeEvent) {
            this._programChangeEmitter.emit(event);
        } else if (event instanceof midi.PitchBendEvent) {
            this.pitchBend = event.value;
            this._updateDetuneOffset(time);
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

    // CC 123 All Notes Off (and the implied All Notes Off of CC 124–127).
    // Unlike CC 120 (All Sound Off), this keeps the release tail: every
    // sounding note gets a normal NoteOff so its envelope releases. Also
    // lifts the sustain pedal so pedal-held notes are released too.
    allNotesOff(time: number) {
        const patch = this.patch;
        if (patch != null) {
            const numbers = new Set<number>(this.notePool.noteNumberQueue);
            for (const noteOff of this._sustainedNoteOffs.values()) {
                numbers.add(noteOff.noteNumber);
            }
            for (const noteNumber of numbers) {
                // The patch looks the note up by number only; the status
                // byte's channel nibble is irrelevant (the Instrument is
                // already the channel).
                const dv = new DataView(Uint8Array.of(noteNumber, 0x40).buffer);
                patch.receiveEvent(midi.Event.create(dv, 0, 0x80), time);
            }
        }
        this.sustain = false;
        this._sustainedNoteOffs.clear();
    }

    private _dispatchDataEntry(time: number) {
        if (this._lastParamType === "rpn") {
            if (this.rpn === 0x3fff) return;
            this.receiveRPN(this.rpn, this.dataEntry, time);
        } else {
            if (this.nrpn === 0x3fff) return;
            this.receiveNRPN(this.nrpn, this.dataEntry, time);
        }
    }

    receiveRPN(rpn: number, data: number, time: number) {
        switch (rpn) {
            case 0: // pitch bend range: MSB = semitones, LSB = cents
                this.pitchBendRange = ((data >> 7) & 0x7f) + (data & 0x7f) / 100;
                this._updateDetuneOffset(time);
                break;
            case 1: // channel fine tuning: 14-bit, center 0x2000, ±100 cents
                this.fineTune = ((data - 0x2000) / 0x2000) * 100;
                this._updateDetuneOffset(time);
                break;
            case 2: // channel coarse tuning: MSB only, center 0x40, ±64 semitones
                this.coarseTune = ((data >> 7) & 0x7f) - 0x40;
                this._updateDetuneOffset(time);
                break;
            case 5: // modulation depth range: MSB = semitones, LSB = cents/128
                this.modDepthRangeCents = (((data >> 7) & 0x7f) + (data & 0x7f) / 128) * 100;
                this._applyVibratoDepth(time);
                break;
            default:
                break;
        }
    }

    receiveNRPN(_nrpn: number, _data: number, _time: number) {
        // Hook for NRPN handling (GS / XG / vendor-specific). Default no-op.
    }
}
