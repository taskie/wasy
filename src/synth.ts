import * as midi from "./midi/event.js";
import * as inst from "./midi/instrument.js";
import { Monophony, Patch } from "./synth/patch.js";

// Squared velocity → gain mapping. The MIDI spec leaves the curve
// implementation-defined, but DLS Level 1 / GM convention (and most
// hardware GM modules) use roughly `(v/127)^2`. Linear `v/127` makes
// soft notes louder than expected and the dynamic range feel
// compressed; squaring gives a more natural piano-like response.
const velocityToGain = (velocity: number) => {
	const x = velocity / 127;
	return x * x;
};

export class SimpleOscillatorMonophony extends Monophony {
	oscillator!: OscillatorNode;
	gain!: GainNode;
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
	override onNoteOn(event: midi.NoteOnEvent, time: number): SimpleOscillatorMonophony {
		// initialize
		const monophony = new SimpleOscillatorMonophony();
		const oscillator = this.audioContext.createOscillator();
		const gain = this.audioContext.createGain();
		monophony.oscillator = oscillator;
		monophony.gain = gain;
		monophony.managedNodes = [oscillator, gain];
		monophony.detunableNodes = [oscillator];

		// settings
		oscillator.type = this.oscillatorType;
		oscillator.frequency.value = this.tuning.frequency(event.noteNumber);
		// Detune is driven by the channel-wide ConstantSourceNode; the
		// oscillator's own detune base stays at 0 and the connection sums
		// in pitch bend / fine / coarse tune as a single AudioParam input.
		oscillator.detune.value = 0;
		// Gain starts at 0; applyAttack schedules the AD(S) envelope at `time`.
		gain.gain.value = 0;

		// connect
		oscillator.connect(gain);
		gain.connect(this.destination);
		this.attachChannelDetune(monophony, oscillator);

		// start
		this.applyAttack(gain.gain, velocityToGain(event.velocity), time);
		oscillator.start(time);

		return monophony;
	}
	override onNoteOff(monophony: SimpleOscillatorMonophony, time: number) {
		this.applyRelease(monophony.gain.gain, time);
		// Stop the oscillator after the release tail finishes; cutting
		// at `time` would defeat the ramp.
		monophony.oscillator.stop(time + this.releaseTime);
	}
	override onExpired(monophony: SimpleOscillatorMonophony, time: number) {
		this.onNoteOff(monophony, time);
	}
}

export class NoiseMonophony extends Monophony {
	source!: AudioBufferSourceNode;
	filter!: BiquadFilterNode;
	gain!: GainNode;
}

const noiseBufferCache = new WeakMap<BaseAudioContext, AudioBuffer>();

export class NoisePatch extends Patch<NoiseMonophony> {
	noiseBuffer: AudioBuffer;
	constructor(instrument: inst.Instrument<Monophony>, destination?: AudioNode) {
		super(instrument, destination);
		const ctx = this.audioContext;
		let buf = noiseBufferCache.get(ctx);
		if (buf == null) {
			const frame = ctx.sampleRate * 2;
			buf = ctx.createBuffer(2, frame, ctx.sampleRate);
			const data0 = buf.getChannelData(0);
			const data1 = buf.getChannelData(1);
			for (let i = 0; i < data0.length; ++i) {
				data0[i] = (Math.random() * 2 - 1);
				data1[i] = (Math.random() * 2 - 1);
			}
			noiseBufferCache.set(ctx, buf);
		}
		this.noiseBuffer = buf;
	}
	override onNoteOn(event: midi.NoteOnEvent, time: number): NoiseMonophony {
		// initialize
		const monophony = new NoiseMonophony();
		const source = this.audioContext.createBufferSource();
		const filter = this.audioContext.createBiquadFilter();
		const gain = this.audioContext.createGain();
		monophony.source = source;
		monophony.filter = filter;
		monophony.gain = gain;
		monophony.managedNodes = [source, filter, gain];
		monophony.detunableNodes = [filter];

		// settings
		source.buffer = this.noiseBuffer;
		source.loop = true;
		filter.type = "bandpass";
		filter.frequency.value = this.tuning.frequency(event.noteNumber + 24);
		// Detune is driven by the channel-wide ConstantSourceNode (see
		// attachChannelDetune); filter.detune base stays at 0.
		filter.detune.value = 0;
		filter.Q.value = 1;
		// Gain starts at 0; applyAttack schedules the AD(S) envelope at `time`.
		gain.gain.value = 0;

		// connect
		source.connect(filter);
		filter.connect(gain);
		gain.connect(this.destination);
		this.attachChannelDetune(monophony, source);

		// start
		this.applyAttack(gain.gain, velocityToGain(event.velocity), time);
		source.start(time);

		return monophony;
	}
	override onNoteOff(monophony: NoiseMonophony, time: number) {
		this.applyRelease(monophony.gain.gain, time);
		monophony.source.stop(time + this.releaseTime);
	}
	override onExpired(monophony: NoiseMonophony, time: number) {
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

	override onNoteOn(event: midi.NoteOnEvent, time: number): NoiseMonophony {
		const monophony = super.onNoteOn(event, time);
		const filter = monophony.filter;
		const gain = monophony.gain;
		if (this.fixedFrequency != null) {
			filter.frequency.value = this.fixedFrequency;
		} else {
			filter.frequency.value = this.tuning.frequency(event.noteNumber + 24);
		}
		// Recompute baseGain from velocity rather than reading gain.gain.value:
		// the parent's applyAttack schedules events at audio `time`, so the
		// param's live `.value` (at currentTime) is still 0 here.
		const baseGain = velocityToGain(event.velocity);
		gain.gain.cancelScheduledValues(time);
		gain.gain.setValueAtTime(this.valueAtBegin * baseGain, time);
		gain.gain.linearRampToValueAtTime(this.valueAtEnd * baseGain, time + this.duration);
		return monophony;
	}
}

export class OneShotNoisePatch extends GainedNoisePatch {
	override onNoteOff(_monophony: NoiseMonophony, _time: number) {

	}

	override onExpired(monophony: NoiseMonophony, time: number) {
		super.onExpired(monophony, time);
		// Anchor the in-flight decay ramp at `time` so the gain doesn't
		// snap back up to the held peak value during the player's
		// lookahead window — that would make long-decay percussion
		// (e.g. Crash 1) audibly swell right before the next hit.
		const gainParam = monophony.gain.gain;
		if (typeof gainParam.cancelAndHoldAtTime === "function") {
			gainParam.cancelAndHoldAtTime(time);
		} else {
			gainParam.cancelScheduledValues(time);
			gainParam.setValueAtTime(gainParam.value, time);
		}
		gainParam.linearRampToValueAtTime(0, time + 0.005);
		monophony.source.stop(time + 0.005);
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

	override onNoteOn(event: midi.NoteOnEvent, time: number): SimpleOscillatorMonophony {
		const monophony = super.onNoteOn(event, time);
		const gain = monophony.gain;
		// Recompute baseGain from velocity rather than reading gain.gain.value:
		// the parent's applyAttack schedules events at audio `time`, so the
		// param's live `.value` (at currentTime) is still 0 here.
		const baseGain = velocityToGain(event.velocity);
		gain.gain.cancelScheduledValues(time);
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

	override onNoteOn(event: midi.NoteOnEvent, time: number): SimpleOscillatorMonophony {
		const monophony = super.onNoteOn(event, time);
		const oscillator = monophony.oscillator;
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

	override onNoteOff(_monophony: SimpleOscillatorMonophony, _time: number) {

	}

	override onExpired(monophony: SimpleOscillatorMonophony, time: number) {
		super.onExpired(monophony, time);
		// See OneShotNoisePatch.onExpired for the rationale; same lookahead
		// hazard applies to oscillator-driven one-shot drums.
		const gainParam = monophony.gain.gain;
		if (typeof gainParam.cancelAndHoldAtTime === "function") {
			gainParam.cancelAndHoldAtTime(time);
		} else {
			gainParam.cancelScheduledValues(time);
			gainParam.setValueAtTime(gainParam.value, time);
		}
		gainParam.linearRampToValueAtTime(0, time + 0.005);
		monophony.oscillator.stop(time + 0.005);
	}
}

export class DrumKitPatch extends Patch<Monophony> {
	patchMap: { [n: number]: Patch<Monophony> };
	leftPanpot: StereoPannerNode;
	rightPanpot: StereoPannerNode;
	gain: GainNode;

	constructor(
		instrument: inst.Instrument<Monophony>,
		destination?: AudioNode,
	) {
		const is = instrument;
		super(is, destination);
		const ds = this.destination;
		// gain
		const ga = this.audioContext.createGain();
		this.gain = ga;
		this.gain.gain.value = 2;
		ga.connect(ds);
		// panners (StereoPanner; pan -1..+1, MIDI panpot 32 → -0.5, 96 → +0.5)
		const lp = this.audioContext.createStereoPanner();
		this.leftPanpot = lp;
		lp.pan.value = (32 - 64) / 64;
		lp.connect(ga);
		const rp = this.audioContext.createStereoPanner();
		this.rightPanpot = rp;
		rp.pan.value = (96 - 64) / 64;
		rp.connect(ga);
		// assign
		this.patchMap = {
			0: new OneShotNoisePatch(is, 1, 0, 0.05, undefined, ga), // default
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

	override onNoteOn(event: midi.NoteOnEvent, time: number): Monophony {
		let index = event.noteNumber;
		if (!(index in this.patchMap)) {
			index = 0;
		}
		const patch = this.patchMap[index];
		const hiHats = [42, 44, 46];
		if (hiHats.indexOf(index) !== -1) {
			for (const hiHat of hiHats) {
				if (hiHat === index) continue;
				this.instrument.expireNote(hiHat, time);
			}
		}
		const monophony = patch.onNoteOn(event, time);
		monophony.parentPatch = patch;
		return monophony;
	}

	override onNoteOff(monophony: Monophony, time: number) {
		monophony.parentPatch.onNoteOff(monophony, time);
	}

	override onExpired(monophony: Monophony, time: number) {
		monophony.parentPatch.onExpired(monophony, time);
	}
}

const oscillatorTypeMap: ReadonlyMap<number, OscillatorType> = new Map([
	[0x00, "sine"],
	[0x01, "triangle"],
	[0x02, "triangle"],
	[0x03, "triangle"],
	[0x04, "triangle"],
	[0x05, "triangle"],

	[0x10, "sine"],
	[0x11, "sine"],
	[0x12, "sine"],
	[0x13, "sine"],
	[0x14, "triangle"],

	[0x1D, "sawtooth"],
	[0x1E, "sawtooth"],

	[0x30, "triangle"],
	[0x31, "triangle"],
	[0x32, "triangle"],
	[0x33, "triangle"],

	[0x51, "sawtooth"],
]);

// Per-category fallback (8 programs per GM category, 16 categories).
// Used when `oscillatorTypeMap` has no entry for the program.
const categoryDefaults: ReadonlyArray<OscillatorType> = [
	"triangle", // 0x00 Piano
	"sine",     // 0x08 Chromatic Percussion
	"sine",     // 0x10 Organ
	"sawtooth", // 0x18 Guitar
	"triangle", // 0x20 Bass
	"sawtooth", // 0x28 Strings
	"sawtooth", // 0x30 Ensemble
	"sawtooth", // 0x38 Brass
	"square",   // 0x40 Reed
	"triangle", // 0x48 Pipe
	"sawtooth", // 0x50 Synth Lead
	"triangle", // 0x58 Synth Pad
	"sawtooth", // 0x60 Synth Effects
	"square",   // 0x68 Ethnic
	"square",   // 0x70 Percussive
	"sine",     // 0x78 SFX
];

export const generatePatch = (
	instrument: inst.Instrument<Monophony>,
	program: number,
	isDrum = false,
): Patch<Monophony> => {
	if (isDrum) {
		return new DrumKitPatch(instrument);
	}
	if (program === 0x77) {
		return new GainedNoisePatch(instrument, 0, 1, 1);
	}
	if (program === 0x7E) {
		return new NoisePatch(instrument);
	}
	const oscillatorType = oscillatorTypeMap.get(program) ?? categoryDefaults[program >> 3];
	if (program <= 0x05) {
		return new GainedOscillatorPatch(instrument, 1.2, 0.1, 0.7, oscillatorType);
	}
	return new SimpleOscillatorPatch(instrument, oscillatorType);
};
