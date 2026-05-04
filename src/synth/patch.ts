import * as midi from "../midi/event.js";
import * as tuning from "../player/tuning.js";
import * as inst from "../midi/instrument.js";

export class Monophony {
    parentPatch!: Patch<Monophony>;
    managedNodes!: AudioNode[];
    detunableNodes!: AudioNode[];
}

export abstract class Patch<T extends Monophony> implements inst.Patch<T> {
    tuning: tuning.Tuning;

    // ADSR envelope (in seconds; sustainLevel is 0..1 multiplier on peak).
    // Defaults model a sustained tone with click-killing endpoints:
    //   - attackTime  = 5 ms  (short enough to feel instantaneous, long
    //                          enough to avoid the sample-boundary click
    //                          that `gain.value = peak` produces)
    //   - decayTime   = 0     (no decay → sustain at peak)
    //   - sustainLevel = 1
    //   - releaseTime = 50 ms (perceptible but quick fade — replaces the
    //                          old `setValueAtTime(0, time)` instant cut
    //                          that produced clicks at NoteOff and made
    //                          Sustain Pedal releases sound abrupt)
    // Subclasses override these on construction. Percussive one-shots
    // keep their own ramp envelope and simply leave NoteOff as a no-op.
    attackTime = 0.005;
    decayTime = 0;
    sustainLevel = 1;
    releaseTime = 0.05;

    constructor(
        public instrument: inst.Instrument<Monophony>,
        public destination: AudioNode = instrument.source,
    ) {
        this.tuning = new tuning.EqualTemperamentTuning();
    }

    get detune() {
        return this.instrument.detune;
    }
    set detune(detune: number) {
        this.instrument.detune = detune;
    }
    get audioContext() {
        return this.instrument.audioContext;
    }

    // Schedule attack → decay → sustain on `gainParam`. Starts at `time`
    // (not `currentTime`), so callers that schedule with the player's
    // 200 ms lookahead get the envelope aligned to the audio time of the
    // note. Always returns having scheduled at least one event at `time`,
    // so a subsequent `applyRelease(time')` (with `time' > time`) sees
    // a defined value to hold.
    protected applyAttack(gainParam: AudioParam, peakGain: number, time: number) {
        gainParam.cancelScheduledValues(time);
        if (this.attackTime > 0) {
            gainParam.setValueAtTime(0, time);
            gainParam.linearRampToValueAtTime(peakGain, time + this.attackTime);
        } else {
            gainParam.setValueAtTime(peakGain, time);
        }
        if (this.decayTime > 0 && this.sustainLevel < 1) {
            gainParam.linearRampToValueAtTime(
                peakGain * this.sustainLevel,
                time + this.attackTime + this.decayTime,
            );
        }
    }

    // Schedule release: ramp from whatever value is on the param at audio
    // time `time` down to 0 over `releaseTime`. We use `cancelAndHoldAtTime`
    // so the start of the ramp is the envelope's value at `time` (which
    // may be mid-attack or mid-decay) — not `gainParam.value`, which
    // reflects the value at `currentTime` and would diverge from `time`
    // when the player schedules NoteOff with the ~200 ms lookahead.
    protected applyRelease(gainParam: AudioParam, time: number) {
        if (typeof gainParam.cancelAndHoldAtTime === "function") {
            gainParam.cancelAndHoldAtTime(time);
        } else {
            gainParam.cancelScheduledValues(time);
            gainParam.setValueAtTime(gainParam.value, time);
        }
        gainParam.linearRampToValueAtTime(0, time + this.releaseTime);
    }

    // Wire the channel-wide detune offset (current pitch bend + fine + coarse
    // tune in cents) into each detunable node's `.detune` AudioParam, then
    // disconnect again when the source ends. Subclasses call this from
    // onNoteOn after populating `monophony.detunableNodes`. Updates to
    // `Instrument._detuneOffset.offset` flow through this connection so all
    // in-flight notes track pitch bend / RPN tuning changes — replacing the
    // old per-note `setValueAtTime` snapshot at NoteOn time.
    protected attachChannelDetune(monophony: T, source: AudioScheduledSourceNode) {
        const detuneOffset = this.instrument.detuneOffset;
        const modulation = this.instrument.modulation;
        const params: AudioParam[] = [];
        for (const node of monophony.detunableNodes) {
            const param = (node as { detune?: AudioParam }).detune;
            if (param != null) {
                detuneOffset.connect(param);
                modulation.connect(param);
                params.push(param);
            }
        }
        if (params.length === 0) return;
        source.addEventListener("ended", () => {
            for (const param of params) {
                try {
                    detuneOffset.disconnect(param);
                } catch {
                    // already disconnected (e.g., Instrument.destroy ran)
                }
                try {
                    modulation.disconnect(param);
                } catch {
                    // already disconnected
                }
            }
        });
    }

    receiveEvent(event: midi.Event, time: number) {
        // PitchBend is intercepted by Instrument and applied to the
        // channel-wide ConstantSourceNode (`_detuneOffset`); it never
        // reaches the patch.
        if (event instanceof midi.NoteOnEvent) {
            const monophony = this.onNoteOn(event, time);
            if (monophony.parentPatch == null) {
                monophony.parentPatch = this;
            }
            this.instrument.registerNote(event.noteNumber, monophony, time);
        } else if (event instanceof midi.NoteOffEvent) {
            const monophony = this.instrument.findNote(event.noteNumber);
            if (monophony != null) {
                this.onNoteOff(monophony as T, time);
            }
        }
    }

    abstract onNoteOn(event: midi.NoteOnEvent, time: number): T;

    onNoteOff(_data: T, _time: number) {}

    onExpired(monophony: T, _time: number) {
        setTimeout(() => {
            for (const node of monophony.managedNodes) {
                node.disconnect();
            }
        }, 1000);
    }
}
