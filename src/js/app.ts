import * as player from "./player";
import * as smf from "./smf";
import * as wasy from "./wasy";
import { EventEmitter } from "events";

export var midiPlayer: player.Player;
export var audioContext: AudioContext;
export var canvasContext: CanvasRenderingContext2D;
export let tuning = new wasy.EqualTemperamentTuning();
export var accurateTimer = { tick: 0, oldTick: 0, currentTime: 0 };

class Instrument implements wasy.IAudioGraphGenerator {
    gain: GainNode;
	panner: PannerNode;
	oscillatorType: string;
	detuneValue: number;
	constructor(public audioContext: AudioContext, public player: player.Player) {
		this.panner = this.audioContext.createPanner();
		this.panner.setPosition(0, 0, 1);
		this.panner.connect(this.audioContext.destination);
		this.gain = this.audioContext.createGain();
		this.gain.gain.value = 0.1;
		this.gain.connect(this.panner);
		this.oscillatorType = "square";
		this.detuneValue = 0;
	}
	set panpot(panpot: number) {
		var value = (panpot - 64) * Math.PI / (64 * 2);
		this.panner.setPosition(Math.sin(value), 0, -Math.cos(value));
	}
	set volume(volume: number) {
		this.gain.gain.value = volume / 127 * 0.1;
	}
	generateAudioGraph() {
		let audioGraph = new wasy.AudioGraph();
		audioGraph.on("noteon", (e: smf.NoteOnEvent) => {
			let gain = this.audioContext.createGain();
			gain.connect(this.gain);
			let oscillator = this.audioContext.createOscillator();
			oscillator.type = this.oscillatorType;
			oscillator.frequency.value = tuning.frequency(e.noteNumber);
			let d = (e.tick - accurateTimer.oldTick) / this.player.timer.ticksPerSecond;
			let now = accurateTimer.currentTime + 0.5 + d;
			oscillator.connect(gain);
			oscillator.start(now);
			oscillator.detune.setValueAtTime(this.detuneValue, now);
			gain.gain.setValueAtTime(e.velocity / 127, now);
			gain.gain.linearRampToValueAtTime(0, now + 1);
			audioGraph.data = { gain, oscillator };
		});
		audioGraph.on("noteoff", (e: smf.NoteOffEvent) => {
			let {gain, oscillator} = audioGraph.data;
			let d = (e.tick - accurateTimer.oldTick) / this.player.timer.ticksPerSecond;
			oscillator.stop(accurateTimer.currentTime + 0.5 + d);
		});
		audioGraph.on("destroy", () => {
			let {gain, oscillator} = audioGraph.data;
			oscillator.stop(accurateTimer.currentTime + 0.5);
			setTimeout(() => {
				gain.disconnect();
				oscillator.disconnect();
			}, 1000);
		});
		return audioGraph;
	}
}

class UntunedInstrument implements wasy.IAudioGraphGenerator {
    gain: GainNode;
	static noiseBuffers: { [noteNumber: number]: AudioBuffer };
	constructor(public audioContext: AudioContext, public player: player.Player) {
		this.gain = this.audioContext.createGain();
		this.gain.gain.value = 0.5;
		this.gain.connect(this.audioContext.destination);
	}
	generateAudioGraph() {
		let audioGraph = new wasy.AudioGraph();
		if (UntunedInstrument.noiseBuffers == null) {
			UntunedInstrument.noiseBuffers = {};
			const noiseNoteNumberFrameMap = {
				37: 10000, 38: 20000, 39: 15000, 40: 25000,
				42: 5000, 44: 3000, 46: 10000,
				49: 80000, 51: 40000, 69: 2000
			}
			for (var noteNumber in noiseNoteNumberFrameMap) {
				var frame = noiseNoteNumberFrameMap[noteNumber];
				let buf = this.audioContext.createBuffer(2, frame, this.audioContext.sampleRate);
				let data0 = buf.getChannelData(0);
				let data1 = buf.getChannelData(1);
				for (var i = 0; i < data0.length; ++i) {
					data0[i] = (Math.random() * 2 - 1) * (1 - i / frame);
					data1[i] = (Math.random() * 2 - 1) * (1 - i / frame);
				}
				UntunedInstrument.noiseBuffers[noteNumber] = buf;
			}
		}
		audioGraph.on("noteon", (e: smf.NoteOnEvent) => {
			var gain = this.audioContext.createGain();
			gain.gain.value = 0.4;
			gain.connect(this.gain);
			if (e.noteNumber in UntunedInstrument.noiseBuffers) {
				var filter = this.audioContext.createBiquadFilter();
				filter.type = "bandpass";
				if (42 <= e.noteNumber && e.noteNumber <= 51) {
					filter.frequency.value = tuning.frequency(e.noteNumber + 70);
				} else {
					filter.frequency.value = tuning.frequency(e.noteNumber + 50);
				}
				filter.Q.value = 1;
				filter.connect(gain);
				var source = this.audioContext.createBufferSource();
				source.buffer = UntunedInstrument.noiseBuffers[e.noteNumber];
				source.connect(filter);
				let d = (e.tick - accurateTimer.oldTick) / this.player.timer.ticksPerSecond;
				source.start(accurateTimer.currentTime + 0.5 + d);
				audioGraph.data = { gain, filter, source };
			} else {
				let gain = this.audioContext.createGain();
				gain.connect(this.gain);
				let oscillator = this.audioContext.createOscillator();
				oscillator.type = "square";
				oscillator.detune.value = Math.random() * 10 - 5;
				let d = (e.tick - accurateTimer.oldTick) / this.player.timer.ticksPerSecond;
				let now = accurateTimer.currentTime + 0.5 + d;
				gain.gain.setValueAtTime(e.velocity / 127 * 0.15, now);
				gain.gain.linearRampToValueAtTime(0, now + 0.3);
				oscillator.frequency.setValueAtTime(tuning.frequency(e.noteNumber + 24), now);
				oscillator.frequency.linearRampToValueAtTime(50, now + 0.2);
				oscillator.connect(gain);
				oscillator.start(now);
				oscillator.stop(now + 0.2);
				audioGraph.data = { gain, oscillator };
			}
		});
		audioGraph.on("noteoff", (e: smf.NoteOffEvent) => {

		});
		audioGraph.on("destroy", () => {
			setTimeout(() => {
				for (var key in audioGraph.data) {
					audioGraph.data[key].disconnect();
				}
			}, 1000);
			if (audioGraph.data["source"]) audioGraph.data["source"].stop(accurateTimer.currentTime + 0.5);
			if (audioGraph.data["oscillator"]) audioGraph.data["oscillator"].stop(accurateTimer.currentTime + 0.5);
		});
		return audioGraph;
	}
}

document.addEventListener("DOMContentLoaded", (e) => {
	let webkitAudioContext = (<any> window).webkitAudioContext;
	if (typeof webkitAudioContext !== "undefined") audioContext = new webkitAudioContext();
	if (typeof AudioContext !== "undefined") audioContext = new AudioContext();
	let canvas = <HTMLCanvasElement> document.querySelector("canvas#keyboardCanvas");
	canvasContext = <CanvasRenderingContext2D> canvas.getContext("2d");

	const w = 640 / 128;
	const h = 480 / 16;
    const blackKey = "010100101010";
	canvasContext.fillStyle = "#eeeeee";
	canvasContext.fillRect(0, 0, 640, 480);
	for (var i = 0; i < 16; ++i) {
		for (var j = 0; j < 128; ++j) {
			if (blackKey[j % 12] == "1") {
				canvasContext.fillStyle = "#aaaaaa";
			} else {
				canvasContext.fillStyle = "#cccccc";
			}
			canvasContext.fillRect(w * j + 1, h * i + 1, w - 2, h - 2);
		}
	}

	let fileButton = <HTMLInputElement> document.querySelector("input#fileButton");
	var userFile: ArrayBuffer;
	fileButton.addEventListener("change", (e: Event) => {
		let files = (<HTMLInputElement> e.target).files;
		let file = files[0];
		if (file == null) return;
		let fileReader = new FileReader();
		fileReader.onload = (e) => {
			userFile = (<any> e.target).result;
		};
		fileReader.readAsArrayBuffer(file);
	});

	let playButton = <HTMLInputElement> document.querySelector("input#playButton");
	let requesting: XMLHttpRequest;
	let pools: wasy.AudioGraphPool[];
    playButton.addEventListener("click", (e) => {
		pools = [];
		if (midiPlayer != null) {
			if (playButton.value == "pause") {
				midiPlayer.pause();
				pools.forEach(pool => pool.unregistAll());
				playButton.value = "play";
			} else {
				midiPlayer.restart();
				playButton.value = "pause";
			}
			return;
		}
		let playBuffer = (buffer: ArrayBuffer) => {
			midiPlayer = new player.Player(buffer);
			midiPlayer.channels.forEach((channel, channelNumber) => {
				// visualizer
				channel.on("noteon", (e: smf.NoteOnEvent) => {
					canvasContext.fillStyle = "#dd2222";
					canvasContext.fillRect(w * e.noteNumber + 1, h * channelNumber + 1, w - 2, h - 2);
				});
				channel.on("noteoff", (e: smf.NoteOffEvent | smf.NoteOnEvent) => {
					if (blackKey[e.noteNumber % 12] == "1") {
						canvasContext.fillStyle = "#aaaaaa";
					} else {
						canvasContext.fillStyle = "#cccccc";
					}
					canvasContext.fillRect(w * e.noteNumber + 1, h * channelNumber + 1, w - 2, h - 2);
				});
				// audio
				var inst: wasy.IAudioGraphGenerator;
				if (channelNumber === 9) {
					inst = new UntunedInstrument(audioContext, midiPlayer);
				} else {
					inst = new Instrument(audioContext, midiPlayer);
				}
				let pool = new wasy.AudioGraphPool(16, inst);
				pools.push(pool);
				channel.on("noteon", (e: smf.NoteOnEvent) => {
					pool.noteOn(e);
				});
				channel.on("noteoff", (e: smf.NoteOffEvent) => {
					pool.noteOff(e);
				});
				channel.on("pitch", (e: smf.PitchBendEvent) => {
					let map = pool.noteNumberGraphMap;
					for (var key in map) {
						let audioGraph = map[key];
						if (audioGraph.data && audioGraph.data["oscillator"]) {
							let oscillator: OscillatorNode = audioGraph.data["oscillator"];
							let d = (e.tick - accurateTimer.oldTick) / midiPlayer.timer.ticksPerSecond;
							let now = accurateTimer.currentTime + d;
							oscillator.detune.setValueAtTime(e.value / 8192 * 200, now);
						}
					}
					if (inst instanceof Instrument) {
						inst.detuneValue = e.value / 8192 * 200;
					}
				});
				const programMap = {
					0: "sine",
					1: "triangle",
					2: "triangle",
					3: "triangle",
					4: "triangle",
					5: "triangle",
					17: "sine",
					18: "sine",
					19: "sine",
					20: "sine",
					21: "triangle",
					30: "sawtooth",
					31: "sawtooth",
					49: "triangle",
					50: "triangle",
					51: "triangle",
					52: "triangle",
					82: "sawtooth",
				};
				channel.on("program", (e: smf.ProgramChangeEvent) => {
					if (inst instanceof Instrument) {
						if (e.program in programMap) {
							inst.oscillatorType = programMap[e.program];
						} else {
							inst.oscillatorType = "square";
						}
					}
				});
				channel.on("control", (e: smf.ControlChangeEvent) => {
					if (inst instanceof Instrument) {
						if (e.controller === 7) {
							inst.volume = e.value;
						} else if (e.controller === 10) {
							inst.panpot = e.value;
						}
					}
				});
			});
			midiPlayer.timer.on("timing", (tick, oldTick) => {
				accurateTimer.tick = tick;
				accurateTimer.oldTick = oldTick;
				accurateTimer.currentTime = audioContext.currentTime;
			});
			midiPlayer.play();
		}
		if (userFile != null) {
			playBuffer(userFile);
		} else {
			playButton.disabled = true;
			let req = new XMLHttpRequest();
			requesting = req;
			req.open("GET", "./midi/test.mid", true);
			req.responseType = "arraybuffer";
			req.onload = (e) => {
				playButton.value = "pause";
				playButton.disabled = false;
				requesting = null;
				console.log(e);
				var buffer = req.response;
				if (buffer) {
					playBuffer(buffer);
				}
			};
			req.send(null);
		}
	});
});