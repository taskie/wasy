import * as midi from "../midi/event.js";
import * as tuning from "../player/tuning.js";
import * as inst from "../midi/instrument.js";

export class Monophony {
	parentPatch: Patch<Monophony>;
	managedNodes: AudioNode[];
	detunableNodes: AudioNode[];
}

export class Patch<T extends Monophony> implements inst.Patch<T> {
	tuning: tuning.Tuning;

	constructor(
		public instrument: inst.Instrument<Monophony>,
		public destination: AudioNode = instrument.source) {
		this.tuning = new tuning.EqualTemperamentTuning();
	}

	get detune() { return this.instrument.detune; }
	set detune(detune: number) { this.instrument.detune = detune; }
	get audioContext() { return this.instrument.audioContext; }

	receiveEvent(event: midi.Event, time: number) {
		if (event instanceof midi.NoteOnEvent) {
			const monophony = this.onNoteOn(event, time);
			if (monophony != null) {
				if (monophony.parentPatch == null) { monophony.parentPatch = this; }
				this.instrument.registerNote(event.noteNumber, monophony, time);
			}
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

	onNoteOn(_event: midi.NoteOnEvent, _time: number): T | null {
		return null;
	}

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
		if (monophony.detunableNodes != null) {
			for (const node of monophony.detunableNodes) {
				const oscillator = node as OscillatorNode;
				this.instrument.pitchBend = event.value;
				oscillator.detune.setValueAtTime(this.detune, time);
			}
		}
	}
}
