import * as midi from "../midi/event";
import * as tuning from "../player/tuning";
import * as inst from "../midi/instrument";

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
			let monophony = this.onNoteOn(event, time);
			if (monophony != null) {
				if (monophony.parentPatch == null) { monophony.parentPatch = this; }
				this.instrument.registerNote(event.noteNumber, monophony, time);
			}
		} else if (event instanceof midi.NoteOffEvent) {
			let monophony = this.instrument.findNote(event.noteNumber);
			if (monophony != null) {
				this.onNoteOff(<T>monophony, time);
			}
		} else if (event instanceof midi.PitchBendEvent) {
			for (let key in this.instrument.noteStore) {
				let monophony = this.instrument.noteStore[key];
				if (monophony != null && monophony.parentPatch === this) {
					this.onPitchBend(event, <T>monophony, time);
				}
			}
		}
	}
	
	onNoteOn(event: midi.NoteOnEvent, time: number): T {
		return null;
	}
	
	onNoteOff(data: T, time: number) {

	}
	
	onExpired(monophony: T, time: number) {
		setTimeout(() => {
			for (let node of monophony.managedNodes) {
				node.disconnect();
			}
		}, 1000);
	}
	
	onPitchBend(event: midi.PitchBendEvent, monophony: T, time: number) {
		if (monophony.detunableNodes != null) {
			for (let node of monophony.detunableNodes) {
				let oscillator = <OscillatorNode> node;
				this.instrument.pitchBend = event.value;
				oscillator.detune.setValueAtTime(this.detune, time);
			}
		}
	}
}