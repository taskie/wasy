import * as midi from "./midi/event.js";
import * as inst from "./midi/instrument.js";
import { generatePatch } from "./synth.js";
import { Monophony } from "./synth/patch.js";

// GM2 / GS bank convention:
//   Bank MSB 0x78 → rhythm part (drum kit) on any channel
//   Bank MSB 0x79 → melody part (normal instrument), overrides ch 9 default
// Otherwise channel 9 is the drum part by GM convention.
export const isDrumChannel = (channel: number, bankMSB: number) => {
	if (bankMSB === 0x78) return true;
	if (bankMSB === 0x79) return false;
	return channel === 9;
};

export class SynthEngine {
	instruments: inst.Instrument<Monophony>[];
	// Per-channel user-gain bus that sits between each Instrument and the
	// master `gain`. Apps can write to `channelGains[i].gain` for mute /
	// solo / per-channel volume without fighting MIDI-driven CC 7 / CC 11
	// (those are still handled inside Instrument and remain authoritative
	// for MIDI playback semantics).
	channelGains: GainNode[];
	gain: GainNode;
	dynamicsCompressor: DynamicsCompressorNode;

	constructor(public audioContext: AudioContext, destination: AudioNode) {
		this.instruments = [];
		this.channelGains = [];
		this.gain = audioContext.createGain();
		this.gain.gain.value = 0.1;
		this.dynamicsCompressor = audioContext.createDynamicsCompressor();
		this.gain.connect(this.dynamicsCompressor);
		this.dynamicsCompressor.connect(destination);
		for (let i = 0; i < 16; ++i) {
			const channelGain = audioContext.createGain();
			channelGain.connect(this.gain);
			this.channelGains[i] = channelGain;
			const instrument = new inst.Instrument<Monophony>(audioContext, channelGain);
			instrument.patch = generatePatch(instrument, 0, isDrumChannel(i, instrument.bankMSB));
			this.instruments[i] = instrument;
			instrument.onExpired((data: inst.ExpiredMessage<Monophony>) => {
				data.data.parentPatch.onExpired(data.data, data.time);
			});
			instrument.onProgramChange((event: midi.ProgramChangeEvent) => {
				instrument.patch = generatePatch(instrument, event.program, isDrumChannel(i, instrument.bankMSB));
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
