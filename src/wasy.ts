import * as midi from "./midi/event.js";
import * as timer from "./player/timer.js";
import { createSignal, type Signal } from "./signal.js";
import * as inst from "./midi/instrument.js";
import { generatePatch } from "./synth.js";
import { Monophony } from "./synth/patch.js";

export interface TimedEvent {
	timeStamp: timer.TimeStamp;
	midiEvent: midi.Event;
}

export class Wasy {
	timer: timer.Timer;
	instruments: inst.Instrument<Monophony>[];
	gain: GainNode;
	dynamicsCompressor: DynamicsCompressorNode;
	playerWorker?: Worker;
	paused: boolean;
	private _emitter: Signal<TimedEvent>;

	constructor(public audioContext: AudioContext, destination: AudioNode, buffer?: ArrayBuffer) {
		if (buffer != null) {
			this.playerWorker = new Worker(
				new URL("./player/player-worker.js", import.meta.url),
				{ type: "module" },
			);
			const initMessage = { type: "init", buffer };
			this.playerWorker.postMessage(initMessage, [initMessage.buffer]);
			this.playerWorker.postMessage({ type: "resolution" });
			this.playerWorker.addEventListener("message", this.playerWorkerMessageListener.bind(this));
		}
		this.timer = new timer.Timer(this.audioContext);
		this.timer.onTiming(this.timingListener.bind(this));
		this.instruments = [];
		this.gain = this.audioContext.createGain();
		this.gain.gain.value = 0.1;
		this.dynamicsCompressor = this.audioContext.createDynamicsCompressor();
		this.gain.connect(this.dynamicsCompressor);
		this.dynamicsCompressor.connect(destination);
		for (let i = 0; i < 16; ++i) {
			const instrument = new inst.Instrument<Monophony>(this.audioContext, this.gain);
			instrument.patch = generatePatch(instrument, 0, i === 9);
			this.instruments[i] = instrument;
			instrument.onExpired((data: inst.ExpiredMessage<Monophony>) => {
				data.data.parentPatch.onExpired(data.data, data.time);
			});
			instrument.onProgramChange((event: midi.ProgramChangeEvent) => {
				instrument.patch = generatePatch(instrument, event.program, i === 9);
			});
		}
		this.paused = false;
		this._emitter = createSignal<TimedEvent>();
	}

	play() {
		this.timer.start();
	}

	pause() {
		if (this.paused) return;
		this.timer.invalidate();
		for (const instrument of this.instruments) {
			instrument.pause();
		}
		this.paused = true;
	}

	resume() {
		if (!this.paused) return;
		this.timer.resume();
		this.paused = false;
	}

	destroy() {
		this.timer.invalidate();
		if (this.playerWorker != null) {
			this.playerWorker.terminate();
			this.playerWorker = undefined;
		}
		this._emitter.offAll();
		for (const instrument of this.instruments) {
			instrument.destroy();
		}
	}

	playerWorkerMessageListener(event: MessageEvent) {
		switch (event.data.type) {
			case "resolution":
				this.timer.resolution = event.data.resolution;
				break;
			case "read":
				if (this.paused) break;
				const newEventsStore: midi.Event[][] = event.data.newEventsStore;
				const timeStamp: timer.TimeStamp = event.data.timeStamp;
				Object.setPrototypeOf(timeStamp, timer.TimeStamp.prototype);
				newEventsStore.forEach((newEvents, channelNumber) => {
					for (const newEvent of newEvents) {
						const midiEvent = midi.Event.create(newEvent.dataView, newEvent.tick, newEvent.status);
						this._emitter.emit({ timeStamp, midiEvent });
						const time = timeStamp.accurateTime(midiEvent.tick);
						this.instruments[channelNumber].receiveEvent(midiEvent, time);
						if (channelNumber === 0) {
							if (midiEvent instanceof midi.TempoMetaEvent) {
								this.timer.secondsPerBeat = midiEvent.secondsPerBeat;
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
