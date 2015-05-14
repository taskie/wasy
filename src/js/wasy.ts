import * as midi from "./lib/midi";
import * as timer from "./lib/timer";
import * as player from "./lib/player";
import * as tuning from "./lib/tuning";
import SingleEventEmitter from "./lib/single-event-emitter";
import * as gm from "./gm";

export class Monophony {
	parentPatch: Patch<Monophony>;
	managedNodes: AudioNode[];
	detunableNodes: AudioNode[];
}

export class Patch<T extends Monophony> implements gm.Patch<T> {
	tuning: tuning.Tuning;
	constructor(
		public instrument: gm.Instrument<Monophony>,
		public destination: AudioNode = instrument.destination) {
		this.tuning = new tuning.EqualTemperamentTuning();
	}
	get detune() { return this.instrument.detune; }
	set detune(detune: number) { this.instrument.detune = detune; }
	get audioContext() { return this.instrument.audioContext; }
	receiveEvent(event: midi.Event, time: number) {
		if (event instanceof midi.NoteOnEvent) {
			let monophony = this.onNoteOn(event, time);
			if (monophony != null) {
				if (monophony.parentPatch == null) monophony.parentPatch = this;
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
				this.detune = event.value / 8192 * 200;
				oscillator.detune.setValueAtTime(this.detune, time);
			}
		}
	}
}

export class SimpleOscillatorMonophony extends Monophony {
	oscillator: OscillatorNode;
	gain: GainNode;
}

export class SimpleOscillatorPatch extends Patch<SimpleOscillatorMonophony>
{
	constructor(
		instrument: gm.Instrument<Monophony>,
		public oscillatorType: string = "square",
		destination: AudioNode = instrument.destination) {
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
	constructor(instrument: gm.Instrument<Monophony>, destination: AudioNode = instrument.destination) {
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
		instrument: gm.Instrument<Monophony>,
		public valueAtBegin: number,
		public valueAtEnd: number,
		public duration: number,
		public fixedFrequency?: number,
		destination: AudioNode = instrument.destination) {
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
		instrument: gm.Instrument<Monophony>,
		public valueAtBegin: number,
		public valueAtEnd: number,
		public duration: number,
		oscillatorType?: string,
		destination: AudioNode = instrument.destination) {
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
		instrument: gm.Instrument<Monophony>,
		duration: number,
		public fixedFrequency?: number,
		oscillatorType?: string,
		destination: AudioNode = instrument.destination) {
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
		instrument: gm.Instrument<Monophony>,
		destination?: AudioNode) {
		let is = instrument;
		let ds = destination;
		super(is, ds);
		ds = this.destination;
		// gain
		let ga = this.audioContext.createGain();
		this.gain = ga;
		this.gain.gain.value = 3;
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
			35: new OneShotOscillatorPatch(is, 0.3, 150, "sine", ga), // Bass Drum 2
			36: new OneShotOscillatorPatch(is, 0.3, 180, "square", ga), // Bass Drum 1
			37: new OneShotNoisePatch(is, 1, 0, 0.2, 1800, ga), // Side Stick
			38: new OneShotNoisePatch(is, 1, 0, 0.3, 1200, ga), // Snare Drum 1
			39: new OneShotNoisePatch(is, 1, 0, 0.4, 2000, ga), // Hand Clap
			40: new OneShotNoisePatch(is, 1, 0, 0.5, 1500, ga), // Snare Drum 2
			41: new OneShotOscillatorPatch(is, 0.3, 300, "sine", rp), // Low Tom 2
			42: new OneShotNoisePatch(is, 1, 0, 0.1, 4000, lp), // Closed Hi-hat
			43: new OneShotOscillatorPatch(is, 0.3, 350, "sine", rp), // Low Tom 1
			44: new OneShotNoisePatch(is, 1, 0, 0.1, 3500, lp), // Pedal Hi-hat
			45: new OneShotOscillatorPatch(is, 0.3, 400, "sine", rp), // Mid Tom 2
			46: new OneShotNoisePatch(is, 1, 0, 0.3, 4000, lp), // Open Hi-hat
			47: new OneShotOscillatorPatch(is, 0.3, 450, "sine", rp), // Mid Tom 1
			48: new OneShotOscillatorPatch(is, 0.3, 500, "sine", rp), // High Tom 2
			49: new OneShotNoisePatch(is, 1, 0, 1.5, 6000, ga), // Crash Cymbal 1
			50: new OneShotOscillatorPatch(is, 0.3, 550, "sine", rp), // High Tom 1
			51: new OneShotNoisePatch(is, 1, 0, 1, 7000, ga), // Ride Cymbal 1
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
	generate(instrument: gm.Instrument<Monophony>, program: number, isDrum = false): Patch<Monophony> {
		const simpleMap = {
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

export interface TimedEvent {
	timeStamp: timer.TimeStamp;
	midiEvent: midi.Event;
}

export class Wasy {
	timer: timer.Timer;
	instruments: gm.Instrument<Monophony>[];
	gain: GainNode;
	dynamicsCompressor: DynamicsCompressorNode;
	playerWorker: Worker;
	patchGenerator: PatchGenerator;
	private _emitter: SingleEventEmitter<TimedEvent>;

	constructor(public audioContext: AudioContext, destination: AudioNode, buffer?: ArrayBuffer) {
		if (buffer != null) {
			this.playerWorker = new Worker("./player-worker.js");
			let initMessage = { type: "init", buffer };
			this.playerWorker.postMessage(initMessage, [initMessage.buffer]);
			this.playerWorker.postMessage({ type: "resolution" });
			this.playerWorker.addEventListener("message", this.playerWorkerMessageListener.bind(this));
		}
		this.timer = new timer.Timer(this.audioContext);
		this.timer.onTiming(this.timingListener.bind(this));
		this.patchGenerator = new PatchGenerator();
		this.instruments = [];
		this.gain = this.audioContext.createGain();
		this.gain.gain.value = 0.1;
		this.dynamicsCompressor = this.audioContext.createDynamicsCompressor();
		this.gain.connect(this.dynamicsCompressor);
		this.dynamicsCompressor.connect(destination);
		for (let i = 0; i < 16; ++i) {
			let instrument = new gm.Instrument<Monophony>(this.audioContext, this.gain);
			instrument.patch = this.patchGenerator.generate(instrument, 0, i === 9);
			this.instruments[i] = instrument;
			instrument.onExpired((data: gm.ExpiredMessage<Monophony>) => {
				data.data.parentPatch.onExpired(<any> data.data, data.time);
			});
			instrument.onProgramChange((event: midi.ProgramChangeEvent) => {
				instrument.patch = this.patchGenerator.generate(instrument, event.program, i === 9);
			});
		}
		this._emitter = new SingleEventEmitter<TimedEvent>();
	}

	play() {
		this.timer.start();
	}

	destroy() {
		this.timer.pause();
		this.playerWorker = null;
		this._emitter.offAll();
		for (let instrument of this.instruments) {
			instrument.destroy();
		}
	}

	playerWorkerMessageListener(event: MessageEvent) {
		switch (event.data.type) {
			case "resolution":
				this.timer.resolution = event.data.resolution;
				break;
			case "read":
				let newEventsStore: midi.Event[][] = event.data.newEventsStore;
				let timeStamp: timer.TimeStamp = event.data.timeStamp;
				(<any> timeStamp).__proto__ = timer.TimeStamp.prototype;
				newEventsStore.forEach((newEvents, channelNumber) => {
					for (let newEvent of newEvents) {
						let event = midi.Event.create(newEvent.dataView, newEvent.tick, newEvent.status);
						this._emitter.emit({ timeStamp, midiEvent: event })
						let time = timeStamp.accurateTime(event.tick);
						this.instruments[channelNumber].receiveEvent(event, time);
						if (channelNumber === 0) {
							if (event instanceof midi.TempoMetaEvent) {
								this.timer.secondsPerBeat = event.secondsPerBeat;
							}
						}
					}
				});
				break;
			default:
				break;
		}
	}

	receiveExternalMidiEvent(event: midi.Event) {
		const time = this.audioContext.currentTime;
		if (event instanceof midi.ChannelEvent) {
			this.instruments[event.channel].receiveEvent(event, time);
		} else {
			for (const instrument of this.instruments) {
				instrument.receiveEvent(event, time);
			}
		}
		const timeStamp = this.timer.createTimeStamp();
		timeStamp.currentTime = time;
		this._emitter.emit({ timeStamp, midiEvent: event });
	}

	onTimedEvent(listener: (event: TimedEvent) => void) {
		this._emitter.on(listener);
	}

	offTimedEvent(listener: (event: TimedEvent) => void) {
		this._emitter.off(listener);
	}

	timingListener(timeStamp: timer.TimeStamp) {
		if (this.playerWorker != null) {
			this.playerWorker.postMessage({ type: "read", timeStamp });
		}
	}
}