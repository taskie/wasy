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
		public destination: AudioNode = instrument.source) {
		this.tuning = new tuning.EqualTemperamentTuning();
	}

	get detune() { return this.instrument.detune; }
	set detune(detune: number) { this.instrument.detune = detune; }
	get audioContext() { return this.instrument.audioContext; }

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

	receiveEvent(event: midi.Event, time: number) {
		if (event instanceof midi.NoteOnEvent) {
			const monophony = this.onNoteOn(event, time);
			if (monophony.parentPatch == null) { monophony.parentPatch = this; }
			this.instrument.registerNote(event.noteNumber, monophony, time);
		} else if (event instanceof midi.NoteOffEvent) {
			const monophony = this.instrument.findNote(event.noteNumber);
			if (monophony != null) {
				this.onNoteOff(monophony as T, time);
			}
		} else if (event instanceof midi.PitchBendEvent) {
			for (const key in this.instrument.noteStore) {
				const monophony = this.instrument.noteStore[key];
				if (monophony != null && monophony.parentPatch === this) {
					this.onPitchBend(event, monophony as T, time);
				}
			}
		}
	}

	abstract onNoteOn(event: midi.NoteOnEvent, time: number): T;

	onNoteOff(_data: T, _time: number) {

	}

	onExpired(monophony: T, _time: number) {
		setTimeout(() => {
			for (const node of monophony.managedNodes) {
				node.disconnect();
			}
		}, 1000);
	}

	onPitchBend(event: midi.PitchBendEvent, monophony: T, time: number) {
		if (monophony.detunableNodes == null) return;
		this.instrument.pitchBend = event.value;
		const detune = this.detune;
		for (const node of monophony.detunableNodes) {
			const oscillator = node as OscillatorNode;
			oscillator.detune.setValueAtTime(detune, time);
		}
	}
}
