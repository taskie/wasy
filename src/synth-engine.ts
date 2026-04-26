import * as midi from "./midi/event.js";
import * as inst from "./midi/instrument.js";
import { generatePatch } from "./synth.js";
import { Monophony } from "./synth/patch.js";

export class SynthEngine {
	instruments: inst.Instrument<Monophony>[];
	gain: GainNode;
	dynamicsCompressor: DynamicsCompressorNode;

	constructor(public audioContext: AudioContext, destination: AudioNode) {
		this.instruments = [];
		this.gain = audioContext.createGain();
		this.gain.gain.value = 0.1;
		this.dynamicsCompressor = audioContext.createDynamicsCompressor();
		this.gain.connect(this.dynamicsCompressor);
		this.dynamicsCompressor.connect(destination);
		for (let i = 0; i < 16; ++i) {
			const instrument = new inst.Instrument<Monophony>(audioContext, this.gain);
			instrument.patch = generatePatch(instrument, 0, i === 9);
			this.instruments[i] = instrument;
			instrument.onExpired((data: inst.ExpiredMessage<Monophony>) => {
				data.data.parentPatch.onExpired(data.data, data.time);
			});
			instrument.onProgramChange((event: midi.ProgramChangeEvent) => {
				instrument.patch = generatePatch(instrument, event.program, i === 9);
			});
		}
	}

	receiveEvent(event: midi.Event, time: number) {
		if (event instanceof midi.ChannelEvent) {
			this.instruments[event.channel].receiveEvent(event, time);
		} else {
			for (const instrument of this.instruments) {
				instrument.receiveEvent(event, time);
			}
		}
	}

	pause() {
		for (const instrument of this.instruments) {
			instrument.pause();
		}
	}

	destroy() {
		for (const instrument of this.instruments) {
			instrument.destroy();
		}
	}
}
