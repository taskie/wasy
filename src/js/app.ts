import * as wasy from "./wasy";
import * as midiIn from "./midi-in";
import * as midi from "./lib/midi";

class KeyboardView {
	static blackKey = "010100101010";
	static W = 640 / 128;
	static H = 480 / 16 / 2;
	keyboardMap: boolean[][];
	constructor(public canvasContext: CanvasRenderingContext2D) {
		let w = KeyboardView.W;
		let h = KeyboardView.H;
		this.keyboardMap = [];
		for (let i = 0; i < 16; ++i) {
			this.keyboardMap[i] = []
			for (let j = 0; j < 128; ++j) {
				this.keyboardMap[i][j] = false
			}
		}
		this.draw();
	}
	timedEventListener(e: wasy.TimedEvent) {
		let me = e.midiEvent
		let w = KeyboardView.W;
		let h = KeyboardView.H;
		if (me instanceof midi.ChannelEvent) {
			if (me instanceof midi.NoteOnEvent) {
				this.keyboardMap[me.channel][me.noteNumber] = true;
			} else if (me instanceof midi.NoteOffEvent) {
				this.keyboardMap[me.channel][me.noteNumber] = false;
			}
		}
	}
	draw() {
		this.canvasContext.fillStyle = "#002b36";
		this.canvasContext.fillRect(0, 0, 640, 240);
		const w = KeyboardView.W;
		const h = KeyboardView.H;
		for (let i = 0; i < 16; ++i) {
			for (let j = 0; j < 128; ++j) {
				if (this.keyboardMap[i][j]) {
					this.canvasContext.fillStyle = "#dc322f";
					this.canvasContext.fillRect(j * w, i * h + 1, w, h - 2);
				} else {
					if (KeyboardView.blackKey[j % 12] === "1") {

					} else {
						this.canvasContext.fillStyle = "#073642";
						this.canvasContext.fillRect(j * w, i * h + 1, w, h - 2);
					}
				}
			}
		}
	}
}

class AnalyserView {
	array: Uint8Array;
	public _analyser: AnalyserNode;
	constructor(public canvasContext: CanvasRenderingContext2D) {
		this.array = null;
		this.draw();
	}
	set analyser(analyser: AnalyserNode) {
		this.array = new Uint8Array(analyser.frequencyBinCount | 0);
		this._analyser = analyser;
	}
	get analyser() { return this._analyser; }
	draw() {
		this.canvasContext.fillStyle = "#002b36";
		this.canvasContext.fillRect(0, 240, 640, 240);
		if (this.analyser == null) return;
		
		// freq
		this.analyser.getByteFrequencyData(this.array);
		this.canvasContext.beginPath();
		for (let i = 0; i < 640; ++i) {
			let value = this.array[i / 640 * this.array.length | 0] / 255;
			if (i == 0) {
				this.canvasContext.moveTo(0, 480 - 240 * value);
			} else {
				this.canvasContext.lineTo(i, 480 - 240 * value);
			}
		}
		this.canvasContext.lineTo(640, 480);
		this.canvasContext.lineTo(0, 480);
		this.canvasContext.closePath();
		this.canvasContext.fillStyle = "#073642";
		this.canvasContext.fill();
		
		// wave
		this.analyser.getByteTimeDomainData(this.array);
		this.canvasContext.beginPath();
		for (let i = 0; i < 640; ++i) {
			let value = this.array[i / 640 * this.array.length | 0] / 255;
			if (i == 0) {
				this.canvasContext.moveTo(0, 480 - 240 * value);
			} else {
				this.canvasContext.lineTo(i, 480 - 240 * value);
			}
		}
		this.canvasContext.strokeStyle = "#dc322f";
		this.canvasContext.stroke();
	}
}

interface Song {
	name: string
	artist: string
	file: string
}

class Application {
	audioContext: AudioContext;
	canvasContext: CanvasRenderingContext2D;
	userFile: ArrayBuffer;
	wasy: wasy.Wasy;
	keyboardView: KeyboardView;
	analyserView: AnalyserView;
	analyser: AnalyserNode;
	timerId: any;
	songs: Song[];
	songDirectory: string;

	midiIns: midiIn.MIDIIn[];

	start() {
		document.addEventListener("DOMContentLoaded", this.run.bind(this));
	}

	run() {
		this.audioContext = this.getAudioContext();

		let canvas = <HTMLCanvasElement> document.querySelector("canvas#keyboardCanvas");
		this.canvasContext = <CanvasRenderingContext2D> canvas.getContext("2d");
		this.keyboardView = new KeyboardView(this.canvasContext);
		this.analyserView = new AnalyserView(this.canvasContext);

		this.midiIns = [];
		this.midiIns.push(new midiIn.WebMIDIIn());
		this.midiIns.push(new midiIn.WebMidiLinkIn());
		for (const midiIn of this.midiIns) {
			midiIn.on((e) => this.midiEventListener(e));
		}

		let fileButton = <HTMLInputElement> document.querySelector("input#fileButton");
		fileButton.addEventListener("change", this.fileChangeListener.bind(this));
		let playButton = <HTMLInputElement> document.querySelector("input#playButton");
		playButton.addEventListener("click", this.playListener.bind(this));
		let fileSelector = <HTMLInputElement> document.querySelector("select#fileSelector");

		let lastComponent = location.href.split("/").pop();
		if (lastComponent[0] === "?") {
			this.songDirectory = `./midi/${encodeURIComponent(lastComponent.slice(1)) }/`;
		} else {
			this.songDirectory = "./midi/";
		}
		let jsonPath = this.songDirectory + "songs.json";
		let xhr = new XMLHttpRequest();
		xhr.open("GET", jsonPath, true);
		xhr.onload = (e) => {
			let json = xhr.responseText;
			this.songs = JSON.parse(json);
			for (let song of this.songs) {
				let option = document.createElement("option");
				option.innerHTML = `${song.name} （${song.artist}）`;
				fileSelector.appendChild(option);
			}
		}
		xhr.send();
		this.playWithBuffer();
	}

	fileChangeListener(e: Event) {
		let files = (<HTMLInputElement> e.target).files;
		let file = files[0];
		if (file == null) return;
		let fileReader = new FileReader();
		fileReader.onload = (e) => {
			this.userFile = (<any> e.target).result;
		};
		fileReader.readAsArrayBuffer(file);
	}

	playListener(e: Event) {
		this.keyboardView = new KeyboardView(this.canvasContext);
		this.analyserView = new AnalyserView(this.canvasContext);

		let midiSource = <HTMLInputElement> document.querySelector("input[name=midiSource]:checked");
		if (midiSource.value == "userFile") {
			if (this.userFile) {
				this.playWithBuffer(this.userFile);
			}
		} else {
			let fileSelector = <HTMLSelectElement> document.querySelector("select#fileSelector");
			let song = this.songs[fileSelector.selectedIndex];
			let xhr = new XMLHttpRequest();
			xhr.open("GET", this.songDirectory + song.file, true);
			xhr.responseType = "arraybuffer";
			xhr.onload = (e) => {
				if (xhr.response != null) {
					this.playWithBuffer(xhr.response);
				}
			}
			xhr.send();
		}
	}
	
	midiEventListener(e: midi.Event) {
		this.wasy.receiveExternalMidiEvent(e);
	}

	playWithBuffer(buffer?: ArrayBuffer) {
		if (this.wasy != null) {
			this.wasy.destroy();
			this.wasy = null;
		}
		if (this.timerId != null) {
			clearInterval(this.timerId);
		}
		
		if (this.analyser) this.analyser.disconnect();
		this.analyser = this.audioContext.createAnalyser();
		this.analyser.connect(this.audioContext.destination);
		this.analyserView.analyser = this.analyser;
		this.analyser.smoothingTimeConstant = 0;

		this.wasy = new wasy.Wasy(this.audioContext, this.analyser, buffer);
		this.wasy.play();
		this.wasy.onTimedEvent(this.keyboardView.timedEventListener.bind(this.keyboardView));
		this.timerId = setInterval(() => {
			this.analyserView.draw();
			this.keyboardView.draw()
		}, 1000 / 60);
	}

	getAudioContext() {
		let audioContext: AudioContext;
		let webkitAudioContext = (<any> window).webkitAudioContext;
		if (typeof AudioContext !== "undefined") {
			audioContext = new AudioContext();
		} else if (typeof webkitAudioContext !== "undefined") {
			audioContext = new webkitAudioContext();
		}
		return audioContext;
	}
}

let app = new Application();
app.start();