import * as midi from "./midi/event";
import * as timer from "./player/timer";
import * as player from "./player";
import * as tuning from "./player/tuning";
import Signal from "../signal";
import * as gm from "./midi/gm";
import * as inst from "./midi/instrument";
import { Monophony, Patch } from "./synth/patch";

export class SimpleOscillatorMonophony extends Monophony {
	oscillator: OscillatorNode;
	gain: GainNode;
}

export class SimpleOscillatorPatch extends Patch<SimpleOscillatorMonophony>
{
	constructor(
		instrument: inst.Instrument<Monophony>,
		public oscillatorType: OscillatorType = "square",
		destination?: AudioNode,
	) {
		super(instrument, destination);
	}
	onNoteOn(event: midi.NoteOnEvent, time: number): SimpleOscillatorMonophony {
		// initialize
		let monophony = new SimpleOscillatorMonophony();
		let oscillator = this.audioContext.createOscillator();
		let gain = this.audioContext.createGain();
		monophony.oscillator = oscillator;
		monophony.gain = gain;
		monophony.managedNodes = [oscillator, gain];
		monophony.detunableNodes = [oscillator];
		
		// settings
		oscillator.type = this.oscillatorType;
		oscillator.frequency.value = this.tuning.frequency(event.noteNumber);
		oscillator.detune.value = this.detune;
		gain.gain.value = event.velocity / 127;
		
		// connect
		oscillator.connect(gain);
		gain.connect(this.destination);

		// start
		oscillator.start(time);

		return monophony;
	}
	onNoteOff(monophony: SimpleOscillatorMonophony, time: number) {
		monophony.oscillator.stop(time);
		monophony.gain.gain.cancelScheduledValues(time);
		monophony.gain.gain.setValueAtTime(0, time);
	}
	onExpired(monophony: SimpleOscillatorMonophony, time: number) {
		this.onNoteOff(monophony, time);
	}
}

export class NoiseMonophony extends Monophony {
	managedNodes: AudioNode[];
	source: AudioBufferSourceNode;
	filter: BiquadFilterNode;
	gain: GainNode;
}

export class NoisePatch extends Patch<NoiseMonophony> {
	static noiseBuffer: AudioBuffer;
	constructor(instrument: inst.Instrument<Monophony>, destination?: AudioNode) {
		super(instrument, destination);
		if (NoisePatch.noiseBuffer == null) {
			var frame = 44100 * 2;
			let buf = this.audioContext.createBuffer(2, frame, this.audioContext.sampleRate);
			let data0 = buf.getChannelData(0);
			let data1 = buf.getChannelData(1);
			for (var i = 0; i < data0.length; ++i) {
				data0[i] = (Math.random() * 2 - 1);
				data1[i] = (Math.random() * 2 - 1);
			}
			NoisePatch.noiseBuffer = buf;
		}
	}
	onNoteOn(event: midi.NoteOnEvent, time: number): NoiseMonophony {
		// initialize
		let monophony = new NoiseMonophony();
		let source = this.audioContext.createBufferSource();
		let filter = this.audioContext.createBiquadFilter();
		let gain = this.audioContext.createGain();
		monophony.source = source;
		monophony.filter = filter;
		monophony.gain = gain;
		monophony.managedNodes = [source, filter, gain];
		monophony.detunableNodes = [filter];
		
		// settings
		source.buffer = NoisePatch.noiseBuffer;
		source.loop = true;
		filter.type = "bandpass";
		filter.frequency.value = this.tuning.frequency(event.noteNumber + 24);
		filter.detune.value = this.detune;
		filter.Q.value = 1;
		gain.gain.value = event.velocity / 127;
		
		// connect
		source.connect(filter);
		filter.connect(gain);
		gain.connect(this.destination);
		
		// start
		source.start(time);

		return monophony;
	}
	onNoteOff(monophony: NoiseMonophony, time: number) {
		monophony.source.stop(time);
		monophony.gain.gain.cancelScheduledValues(time);
		monophony.gain.gain.setValueAtTime(0, time);
	}
	onExpired(monophony: NoiseMonophony, time: number) {
		this.onNoteOff(monophony, time);
	}
}

export class GainedNoisePatch extends NoisePatch {
	constructor(
		instrument: inst.Instrument<Monophony>,
		public valueAtBegin: number,
		public valueAtEnd: number,
		public duration: number,
		public fixedFrequency?: number,
		destination?: AudioNode) {
		super(instrument, destination);
	}

	onNoteOn(event: midi.NoteOnEvent, time: number): NoiseMonophony {
		let monophony = super.onNoteOn(event, time);
		let filter = monophony.filter;
		let gain = monophony.gain;
		if (this.fixedFrequency != null) {
			filter.frequency.value = this.fixedFrequency;
		} else {
			filter.frequency.value = this.tuning.frequency(event.noteNumber + 24);
		}
		let baseGain = gain.gain.value;
		gain.gain.setValueAtTime(this.valueAtBegin * baseGain, time);
		gain.gain.linearRampToValueAtTime(this.valueAtEnd * baseGain, time + this.duration);
		return monophony;
	}
}

export class OneShotNoisePatch extends GainedNoisePatch {
	onNoteOff(monophony: NoiseMonophony, time: number) {

	}

	onExpired(monophony: NoiseMonophony, time: number) {
		super.onExpired(monophony, time);
		monophony.source.stop(time);
		monophony.gain.gain.cancelScheduledValues(time);
		monophony.gain.gain.setValueAtTime(0, time);
	}
}

export class GainedOscillatorPatch extends SimpleOscillatorPatch {
	constructor(
		instrument: inst.Instrument<Monophony>,
		public valueAtBegin: number,
		public valueAtEnd: number,
		public duration: number,
		oscillatorType?: OscillatorType,
		destination?: AudioNode) {
		super(instrument, oscillatorType, destination);
	}

	onNoteOn(event: midi.NoteOnEvent, time: number): SimpleOscillatorMonophony {
		let monophony = super.onNoteOn(event, time);
		let gain = monophony.gain;
		let baseGain = gain.gain.value;
		gain.gain.setValueAtTime(this.valueAtBegin * baseGain, time);
		gain.gain.linearRampToValueAtTime(this.valueAtEnd * baseGain, time + this.duration);
		return monophony;
	}
}

export class OneShotOscillatorPatch extends GainedOscillatorPatch {
	constructor(
		instrument: inst.Instrument<Monophony>,
		duration: number,
		public fixedFrequency?: number,
		oscillatorType?: OscillatorType,
		destination?: AudioNode) {
		super(instrument, 1, 0, duration, oscillatorType, destination);
	}

	onNoteOn(event: midi.NoteOnEvent, time: number): SimpleOscillatorMonophony {
		let monophony = super.onNoteOn(event, time);
		let oscillator = monophony.oscillator;
		let frequency: number;
		if (this.fixedFrequency != null) {
			frequency = this.fixedFrequency;
		} else {
			frequency = this.tuning.frequency(event.noteNumber + 24);
		}
		oscillator.frequency.setValueAtTime(frequency, time);
		oscillator.frequency.linearRampToValueAtTime(0, time + this.duration);
		return monophony;
	}

	onNoteOff(monophony: SimpleOscillatorMonophony, time: number) {

	}

	onExpired(monophony: SimpleOscillatorMonophony, time: number) {
		super.onExpired(monophony, time);
		monophony.oscillator.stop(time);
		monophony.gain.gain.cancelScheduledValues(time);
		monophony.gain.gain.setValueAtTime(0, time);
	}
}

export class DrumKitPatch extends Patch<Monophony> {
	patchMap: { [n: number]: Patch<Monophony> };
	leftPanpot: PannerNode;
	rightPanpot: PannerNode;
	gain: GainNode;

	constructor(
		instrument: inst.Instrument<Monophony>,
		destination?: AudioNode,
	) {
		let is = instrument;
		let ds = destination;
		super(is, ds);
		ds = this.destination;
		// gain
		let ga = this.audioContext.createGain();
		this.gain = ga;
		this.gain.gain.value = 2;
		ga.connect(ds);
		// panner
		let lp = this.audioContext.createPanner();
		this.leftPanpot = lp;
		let lpValue = (32 - 64) * Math.PI / (64 * 2);
		lp.setPosition(Math.sin(lpValue), 0, -Math.cos(lpValue));
		lp.connect(ga);
		let rp = this.audioContext.createPanner();
		this.rightPanpot = rp;
		let rpValue = (96 - 64) * Math.PI / (64 * 2);
		rp.setPosition(Math.sin(rpValue), 0, -Math.cos(rpValue));
		rp.connect(ga);
		// assign
		this.patchMap = {
			0: new OneShotNoisePatch(is, 1, 0, 0.05, null, ga), // default
			35: new OneShotOscillatorPatch(is, 0.2, 140, "sine", ga), // Bass Drum 2
			36: new OneShotOscillatorPatch(is, 0.2, 150, "square", ga), // Bass Drum 1
			37: new OneShotNoisePatch(is, 1, 0, 0.1, 2000, ga), // Side Stick
			38: new OneShotNoisePatch(is, 1, 0, 0.3, 1000, ga), // Snare Drum 1
			39: new OneShotNoisePatch(is, 1, 0, 0.4, 3000, ga), // Hand Clap
			40: new OneShotNoisePatch(is, 1, 0, 0.5, 1500, ga), // Snare Drum 2
			41: new OneShotOscillatorPatch(is, 0.3, 200, "sine", rp), // Low Tom 2
			42: new OneShotNoisePatch(is, 1, 0, 0.1, 6000, lp), // Closed Hi-hat
			43: new OneShotOscillatorPatch(is, 0.3, 250, "sine", rp), // Low Tom 1
			44: new OneShotNoisePatch(is, 1, 0, 0.1, 5000, lp), // Pedal Hi-hat
			45: new OneShotOscillatorPatch(is, 0.3, 350, "sine", rp), // Mid Tom 2
			46: new OneShotNoisePatch(is, 1, 0, 0.3, 6000, lp), // Open Hi-hat
			47: new OneShotOscillatorPatch(is, 0.3, 400, "sine", rp), // Mid Tom 1
			48: new OneShotOscillatorPatch(is, 0.3, 500, "sine", rp), // High Tom 2
			49: new OneShotNoisePatch(is, 1, 0, 1.5, 8000, ga), // Crash Cymbal 1
			50: new OneShotOscillatorPatch(is, 0.3, 550, "sine", rp), // High Tom 1
			51: new OneShotNoisePatch(is, 1, 0, 0.5, 16000, ga), // Ride Cymbal 1
		};
	}

	onNoteOn(event: midi.NoteOnEvent, time: number): Monophony {
		let index = event.noteNumber;
		if (!(index in this.patchMap)) {
			index = 0;
		}
		const patch = this.patchMap[index];
		const hiHats = [42, 44, 46];
		if (hiHats.indexOf(index) != -1) {
			for (const hiHat of hiHats) {
				if (hiHat === index) continue;
				this.instrument.expireNote(hiHat, time);
			}
		}
		const monophony = patch.onNoteOn(event, time);
		monophony.parentPatch = patch;
		return monophony;
	}

	onNoteOff(monophony: NoiseMonophony, time: number) {
		monophony.parentPatch.onNoteOff(monophony, time);
	}

	onExpired(monophony: NoiseMonophony, time: number) {
		monophony.parentPatch.onExpired(monophony, time);
	}
}

export class PatchGenerator {
	generate(instrument: inst.Instrument<Monophony>, program: number, isDrum = false): Patch<Monophony> {
		const simpleMap: { [key: number]: OscillatorType } = {
			0x00: "sine",
			0x01: "triangle",
			0x02: "triangle",
			0x03: "triangle",
			0x04: "triangle",
			0x05: "triangle",

			0x10: "sine",
			0x11: "sine",
			0x12: "sine",
			0x13: "sine",
			0x14: "triangle",

			0x1D: "sawtooth",
			0x1E: "sawtooth",

			0x30: "triangle",
			0x31: "triangle",
			0x32: "triangle",
			0x33: "triangle",

			0x51: "sawtooth",
		}
		if (isDrum) {
			return new DrumKitPatch(instrument);
		} else {
			if (program === 0x77) {
				return new GainedNoisePatch(instrument, 0, 1, 1);
			} else if (program === 0x7E) {
				return new NoisePatch(instrument);
			} else if (program in simpleMap) {
				let oscillatorType = simpleMap[program];
				if (program <= 0x05) {
					return new GainedOscillatorPatch(instrument, 1.2, 0.1, 0.7, oscillatorType);
				} else {
					return new SimpleOscillatorPatch(instrument, oscillatorType);
				}
			} else {
				return new SimpleOscillatorPatch(instrument, "square");
			}
		}
	}
}
