import * as midi from "./midi/event.js";
import * as timer from "./player/timer.js";
import { createSignal, type Signal } from "./signal.js";

export interface TimedEvent {
	timeStamp: timer.TimeStamp;
	midiEvent: midi.Event;
}

export class SmfPlayer {
	timer: timer.Timer;
	playerWorker?: Worker;
	paused: boolean;
	private _emitter: Signal<TimedEvent>;
	// Resolves when the worker has finished parsing the SMF and replied to
	// `resolution`. `read` postings are gated on this so the queue does not
	// fill up during worker init and flush back with stale timeStamps —
	// which manifested as "drums fire immediately" at playback start.
	private _readyPromise: Promise<void> = Promise.resolve();
	private _resolveReady: (() => void) | null = null;
	private _workerReady = false;

	constructor(public audioContext: AudioContext, buffer?: ArrayBuffer) {
		this.timer = new timer.Timer(audioContext);
		this.timer.onTiming(this._timingListener.bind(this));
		this.paused = false;
		this._emitter = createSignal<TimedEvent>();
		if (buffer != null) {
			this._initPlayerWorker(buffer);
		}
	}

	get ready(): Promise<void> {
		return this._readyPromise;
	}

	play() {
		this.timer.start();
	}

	pause() {
		if (this.paused) return;
		this.timer.invalidate();
		this.paused = true;
	}

	resume() {
		if (!this.paused) return;
		this.timer.resume();
		this.paused = false;
	}

	seek(tick: number) {
		if (this.playerWorker == null) return;
		const wasPaused = this.paused;
		this.timer.invalidate();
		this.paused = true;
		this.timer.tick = tick;
		this.timer.oldTick = tick;
		this.timer.currentTime = this.audioContext.currentTime;
		this.playerWorker.postMessage({ type: "seek", tick });
		if (!wasPaused) {
			this.paused = false;
			this.timer.resume();
		}
	}

	load(buffer: ArrayBuffer): Promise<void> {
		this.unload();
		this._initPlayerWorker(buffer);
		return this._readyPromise;
	}

	unload() {
		this.timer.invalidate();
		this.timer.tick = 0;
		this.timer.oldTick = 0;
		if (this.playerWorker != null) {
			this.playerWorker.terminate();
			this.playerWorker = undefined;
		}
		this.paused = false;
		this._workerReady = false;
		// Settle any pending ready Promise so awaiters don't hang. Callers
		// that re-load will get a fresh Promise from the next `load()`.
		if (this._resolveReady != null) {
			this._resolveReady();
			this._resolveReady = null;
		}
	}

	destroy() {
		this.unload();
		this._emitter.offAll();
	}

	onTimedEvent(listener: (event: TimedEvent) => void) {
		this._emitter.on(listener);
	}

	offTimedEvent(listener: (event: TimedEvent) => void) {
		this._emitter.off(listener);
	}

	createTimeStamp() {
		return this.timer.createTimeStamp();
	}

	private _initPlayerWorker(buffer: ArrayBuffer) {
		this.playerWorker = new Worker(
			new URL("./player/player-worker.js", import.meta.url),
			{ type: "module" },
		);
		this._workerReady = false;
		this._readyPromise = new Promise<void>((resolve) => {
			this._resolveReady = resolve;
		});
		const initMessage = { type: "init", buffer };
		this.playerWorker.postMessage(initMessage, [initMessage.buffer]);
		this.playerWorker.postMessage({ type: "resolution" });
		this.playerWorker.addEventListener("message", this._playerWorkerMessageListener.bind(this));
	}

	private _playerWorkerMessageListener(event: MessageEvent) {
		switch (event.data.type) {
			case "resolution":
				this.timer.resolution = event.data.resolution;
				this._workerReady = true;
				if (this._resolveReady != null) {
					this._resolveReady();
					this._resolveReady = null;
				}
				break;
			case "read": {
				if (this.paused) break;
				const newEventsStore: midi.Event[][] = event.data.newEventsStore;
				const timeStamp: timer.TimeStamp = event.data.timeStamp;
				Object.setPrototypeOf(timeStamp, timer.TimeStamp.prototype);
				newEventsStore.forEach((newEvents, channelNumber) => {
					for (const newEvent of newEvents) {
						const midiEvent = midi.Event.create(newEvent.dataView, newEvent.tick, newEvent.status);
						const isChannelEvent = midiEvent instanceof midi.ChannelEvent;
						// Channel events: emit from their own bucket.
						// Non-channel events are duplicated across all 16 buckets by the worker;
						// emit them once via the channel-0 bucket so listeners (and the synth engine)
						// see exactly one TimedEvent per source MIDI event.
						if (isChannelEvent || channelNumber === 0) {
							this._emitter.emit({ timeStamp, midiEvent });
						}
						if (channelNumber === 0 && midiEvent instanceof midi.TempoMetaEvent) {
							this.timer.secondsPerBeat = midiEvent.secondsPerBeat;
						}
					}
				});
				break;
			}
			case "seek": {
				const newEventsStore: midi.Event[][] = event.data.newEventsStore;
				const tick: number = event.data.tick;
				const timeStamp = this.timer.createTimeStamp();
				timeStamp.currentTime = this.audioContext.currentTime;
				timeStamp.tick = tick;
				timeStamp.oldTick = tick;
				newEventsStore.forEach((newEvents, channelNumber) => {
					for (const newEvent of newEvents) {
						const midiEvent = midi.Event.create(newEvent.dataView, newEvent.tick, newEvent.status);
						// Skip note events: we don't want to retrigger notes that were
						// active before the seek target. State events (ProgramChange,
						// ControlChange, PitchBend, Tempo, etc.) are replayed so the
						// synth state matches what it would have been at `tick`.
						if (midiEvent instanceof midi.NoteOnEvent || midiEvent instanceof midi.NoteOffEvent) {
							continue;
						}
						const isChannelEvent = midiEvent instanceof midi.ChannelEvent;
						if (isChannelEvent || channelNumber === 0) {
							this._emitter.emit({ timeStamp, midiEvent });
						}
						if (channelNumber === 0 && midiEvent instanceof midi.TempoMetaEvent) {
							this.timer.secondsPerBeat = midiEvent.secondsPerBeat;
						}
					}
				});
				break;
			}
			default:
				break;
		}
	}

	private _timingListener(timeStamp: timer.TimeStamp) {
		// Skip while the worker is still parsing — postings would queue up
		// and flush back with a stale `timeStamp.currentTime`, scheduling
		// every backlog event at a past audio time.
		if (this.playerWorker != null && this._workerReady) {
			this.playerWorker.postMessage({ type: "read", timeStamp });
		}
	}
}
