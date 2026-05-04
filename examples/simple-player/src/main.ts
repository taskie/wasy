import { wasy, midi, midiIn } from "wasy";
import "./style.css";

class KeyboardView {
    static blackKey = "010100101010";
    static W = 640 / 128;
    static H = 480 / 16 / 2;
    keyboardMap: boolean[][];
    constructor(public canvasContext: CanvasRenderingContext2D) {
        this.keyboardMap = [];
        for (let i = 0; i < 16; ++i) {
            this.keyboardMap[i] = [];
            for (let j = 0; j < 128; ++j) {
                this.keyboardMap[i][j] = false;
            }
        }
        this.draw();
    }
    timedEventListener(e: wasy.TimedEvent) {
        const me = e.midiEvent;
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
                } else if (KeyboardView.blackKey[j % 12] !== "1") {
                    this.canvasContext.fillStyle = "#073642";
                    this.canvasContext.fillRect(j * w, i * h + 1, w, h - 2);
                }
            }
        }
    }
}

class AnalyserView {
    private array: Uint8Array<ArrayBuffer> | null = null;
    private _analyser: AnalyserNode | null = null;
    constructor(public canvasContext: CanvasRenderingContext2D) {
        this.draw();
    }
    set analyser(analyser: AnalyserNode) {
        this.array = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount | 0));
        this._analyser = analyser;
    }
    get analyser(): AnalyserNode | null {
        return this._analyser;
    }
    draw() {
        this.canvasContext.fillStyle = "#002b36";
        this.canvasContext.fillRect(0, 240, 640, 240);
        if (this._analyser == null || this.array == null) return;

        // freq
        this._analyser.getByteFrequencyData(this.array);
        this.canvasContext.beginPath();
        for (let i = 0; i < 640; ++i) {
            const value = this.array[((i / 640) * this.array.length) | 0] / 255;
            if (i === 0) {
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
        this._analyser.getByteTimeDomainData(this.array);
        this.canvasContext.beginPath();
        for (let i = 0; i < 640; ++i) {
            const value = this.array[((i / 640) * this.array.length) | 0] / 255;
            if (i === 0) {
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
    name: string;
    artist?: string;
    file: string;
}

class Application {
    private audioContext!: AudioContext;
    private canvasContext!: CanvasRenderingContext2D;
    private userFile: ArrayBuffer | null = null;
    private wasy: wasy.Wasy | null = null;
    private keyboardView!: KeyboardView;
    private analyserView!: AnalyserView;
    private analyser: AnalyserNode | null = null;
    private timerId: ReturnType<typeof setInterval> | null = null;
    private songs: Song[] = [];
    private songDirectory = "./midi/";
    private midiIns: midiIn.MidiInput[] = [];

    start() {
        document.addEventListener("DOMContentLoaded", () => {
            void this.run();
        });
    }

    async run() {
        this.audioContext = new AudioContext();

        const canvas = document.querySelector<HTMLCanvasElement>("canvas#keyboardCanvas")!;
        canvas.ondragover = (e) => e.preventDefault();
        canvas.addEventListener("drop", this.canvasDropListener.bind(this));

        this.canvasContext = canvas.getContext("2d")!;
        this.keyboardView = new KeyboardView(this.canvasContext);
        this.analyserView = new AnalyserView(this.canvasContext);

        this.midiIns.push(midiIn.createWebMidiInput());
        this.midiIns.push(midiIn.createWebMidiLinkInput());
        for (const input of this.midiIns) {
            input.on((e) => this.midiEventListener(e));
        }

        const fileButton = document.querySelector<HTMLInputElement>("input#fileButton")!;
        fileButton.addEventListener("change", this.fileChangeListener.bind(this));
        const playButton = document.querySelector<HTMLInputElement>("input#playButton")!;
        playButton.addEventListener("click", this.playListener.bind(this));
        const pauseButton = document.querySelector<HTMLInputElement>("input#pauseButton")!;
        pauseButton.addEventListener("click", this.pauseListener.bind(this));
        const fileSelector = document.querySelector<HTMLSelectElement>("select#fileSelector")!;
        fileSelector.addEventListener("change", this.fileSelectListener.bind(this));

        const lastComponent = location.href.split("/").pop() ?? "";
        if (lastComponent[0] === "?") {
            this.songDirectory = `./midi/${encodeURIComponent(lastComponent.slice(1))}/`;
        } else {
            this.songDirectory = "./midi/";
        }

        try {
            const res = await fetch(this.songDirectory + "songs.json");
            if (res.ok) {
                this.songs = (await res.json()) as Song[];
                for (const song of this.songs) {
                    const option = document.createElement("option");
                    option.textContent =
                        song.artist != null ? `${song.name} （${song.artist}）` : song.name;
                    fileSelector.appendChild(option);
                }
            }
        } catch (e) {
            console.error("failed to load songs.json", e);
        }

        this.playWithBuffer();
    }

    fileChangeListener(e: Event) {
        const files = (e.target as HTMLInputElement).files;
        if (files == null || files.length === 0) return;
        this.setUserFile(files[0]);
    }

    canvasDropListener(e: DragEvent) {
        e.preventDefault();
        const files = e.dataTransfer?.files;
        if (files == null || files.length === 0) return;
        const fileButton = document.querySelector<HTMLInputElement>("input#fileButton")!;
        fileButton.files = files;
        this.setUserFile(files[0]);
    }

    setUserFile(file: File) {
        const fileReader = new FileReader();
        fileReader.onload = () => {
            const result = fileReader.result;
            if (result instanceof ArrayBuffer) {
                this.userFile = result;
                const userFileRadio =
                    document.querySelector<HTMLInputElement>("input#userFileRadio")!;
                userFileRadio.checked = true;
            }
        };
        fileReader.readAsArrayBuffer(file);
    }

    fileSelectListener(_e: Event) {
        const serverFileRadio = document.querySelector<HTMLInputElement>("input#serverFileRadio")!;
        serverFileRadio.checked = true;
    }

    playListener(_e: Event) {
        this.keyboardView = new KeyboardView(this.canvasContext);
        this.analyserView = new AnalyserView(this.canvasContext);

        const midiSource = document.querySelector<HTMLInputElement>(
            "input[name=midiSource]:checked",
        )!;
        if (midiSource.value === "userFile") {
            if (this.userFile != null) {
                this.playWithBuffer(this.userFile);
            }
        } else {
            const fileSelector = document.querySelector<HTMLSelectElement>("select#fileSelector")!;
            const song = this.songs[fileSelector.selectedIndex];
            if (song == null) return;
            void (async () => {
                const res = await fetch(this.songDirectory + song.file);
                if (res.ok) {
                    const buffer = await res.arrayBuffer();
                    this.playWithBuffer(buffer);
                }
            })();
        }
    }

    pauseListener(e: Event) {
        const button = e.target as HTMLInputElement;
        if (this.wasy == null) return;
        if (this.wasy.paused) {
            this.wasy.resume();
            button.value = "pause";
        } else {
            this.wasy.pause();
            button.value = "resume";
        }
    }

    midiEventListener(e: midi.Event) {
        this.wasy?.receiveExternalMidiEvent(e);
    }

    async playWithBuffer(buffer?: ArrayBuffer) {
        if (this.wasy != null) {
            this.wasy.destroy();
            this.wasy = null;
        }
        if (this.timerId != null) {
            clearInterval(this.timerId);
            this.timerId = null;
        }

        if (this.analyser != null) this.analyser.disconnect();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.connect(this.audioContext.destination);
        this.analyserView.analyser = this.analyser;
        this.analyser.smoothingTimeConstant = 0;

        const w = new wasy.Wasy(this.audioContext, this.analyser, buffer);
        this.wasy = w;
        // Wait for the worker to finish parsing the SMF before starting the
        // timer. Without this, queued `read` postings flush back with a
        // stale `timeStamp.currentTime` and tick-0 events fire immediately.
        await w.ready;
        // playWithBuffer can be called again before this awaits resolves
        // (different file selected). If so, drop this play.
        if (this.wasy !== w) return;
        w.play();
        w.onTimedEvent(this.keyboardView.timedEventListener.bind(this.keyboardView));
        this.timerId = setInterval(() => {
            this.analyserView.draw();
            this.keyboardView.draw();
        }, 1000 / 60);
    }
}

const app = new Application();
app.start();
