import {
    SmfPlayer,
    SynthEngine,
    midi,
    smf,
    type TimedEvent,
} from "wasy";
import "./style.css";

interface SongMeta {
    format: number;
    numberOfTracks: number;
    resolution: number;
    durationTicks: number;
}

interface PianoRollNote {
    channel: number;
    noteNumber: number;
    velocity: number;
    startTick: number;
    endTick: number;
}

const computeDurationTicks = (song: smf.Song): number => {
    let max = 0;
    for (const track of song.tracks) {
        const last = track.events[track.events.length - 1];
        if (last != null && last.tick > max) max = last.tick;
    }
    return max;
};

// Pair NoteOn / NoteOff into closed [startTick, endTick] notes for piano-roll
// rendering. Events are merged across all tracks and sorted by tick so that
// SMFs which split a single channel across multiple tracks still pair correctly.
const collectNotes = (song: smf.Song): PianoRollNote[] => {
    const all: midi.Event[] = [];
    for (const track of song.tracks) {
        for (const e of track.events) all.push(e);
    }
    all.sort((a, b) => a.tick - b.tick);

    const notes: PianoRollNote[] = [];
    const active = new Map<number, { startTick: number; velocity: number }>();
    const closeNote = (channel: number, noteNumber: number, endTick: number) => {
        const key = (channel << 7) | noteNumber;
        const prev = active.get(key);
        if (prev == null) return;
        notes.push({
            channel,
            noteNumber,
            velocity: prev.velocity,
            startTick: prev.startTick,
            endTick,
        });
        active.delete(key);
    };

    for (const e of all) {
        if (e instanceof midi.NoteOnEvent) {
            // Same-pitch re-trigger before NoteOff: close the previous note.
            closeNote(e.channel, e.noteNumber, e.tick);
            const key = (e.channel << 7) | e.noteNumber;
            active.set(key, { startTick: e.tick, velocity: e.velocity });
        } else if (e instanceof midi.NoteOffEvent) {
            closeNote(e.channel, e.noteNumber, e.tick);
        }
    }
    // Close stragglers (NoteOn without matching NoteOff) at the song end.
    const lastTick = all[all.length - 1]?.tick ?? 0;
    for (const [key, prev] of active) {
        notes.push({
            channel: key >> 7,
            noteNumber: key & 0x7F,
            velocity: prev.velocity,
            startTick: prev.startTick,
            endTick: lastTick,
        });
    }
    notes.sort((a, b) => a.startTick - b.startTick);
    return notes;
};

const q = <T extends Element>(selector: string): T => {
    const el = document.querySelector<T>(selector);
    if (el == null) throw new Error(`element not found: ${selector}`);
    return el;
};

// Shared with KeyboardView so the strip color matches the piano roll.
const channelColor = (ch: number, active: boolean): string => {
    if (ch === 9) return active ? "#cdd5d6" : "#586e75";
    const hue = (ch * 360) / 16;
    const lightness = active ? 62 : 44;
    const saturation = active ? 75 : 55;
    return `hsl(${hue} ${saturation}% ${lightness}%)`;
};

// 16-row × 128-key activity grid mirroring the original simple-player. NoteOn
// flips the cell on, NoteOff flips it off — there is no decay/release shading.
class KeyboardView {
    static readonly BLACK_KEY = "010100101010";
    private map: boolean[][] = [];

    constructor(
        private ctx: CanvasRenderingContext2D,
        private width: number,
        private height: number,
    ) {
        for (let i = 0; i < 16; ++i) {
            this.map[i] = Array.from({ length: 128 }, () => false);
        }
    }

    onTimedEvent(e: TimedEvent) {
        const me = e.midiEvent;
        if (me instanceof midi.NoteOnEvent) {
            this.map[me.channel][me.noteNumber] = true;
        } else if (me instanceof midi.NoteOffEvent) {
            this.map[me.channel][me.noteNumber] = false;
        }
    }

    clear() {
        for (let i = 0; i < 16; ++i) this.map[i].fill(false);
    }

    draw() {
        const ctx = this.ctx;
        const w = this.width / 128;
        const h = this.height / 16;
        ctx.fillStyle = "#002b36";
        ctx.fillRect(0, 0, this.width, this.height);
        for (let ch = 0; ch < 16; ++ch) {
            for (let n = 0; n < 128; ++n) {
                const on = this.map[ch][n];
                if (on) {
                    ctx.fillStyle = channelColor(ch, true);
                    ctx.fillRect(n * w, ch * h + 1, w, h - 2);
                } else if (KeyboardView.BLACK_KEY[n % 12] !== "1") {
                    // White-key idle background tint.
                    ctx.fillStyle = "#073642";
                    ctx.fillRect(n * w, ch * h + 1, w, h - 2);
                }
            }
            // Channel label on the far left.
            ctx.fillStyle = "#586e75";
            ctx.font = "9px sans-serif";
            ctx.fillText(`ch ${ch + 1}`, 2, ch * h + h - 2);
        }
    }
}

class AnalyserView {
    private array: Uint8Array<ArrayBuffer> | null = null;
    private _analyser: AnalyserNode | null = null;

    constructor(
        private ctx: CanvasRenderingContext2D,
        private width: number,
        private height: number,
    ) {}

    set analyser(node: AnalyserNode) {
        this._analyser = node;
        this.array = new Uint8Array(new ArrayBuffer(node.frequencyBinCount | 0));
    }

    draw() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        ctx.fillStyle = "#002b36";
        ctx.fillRect(0, 0, w, h);
        const analyser = this._analyser;
        const arr = this.array;
        if (analyser == null || arr == null) return;

        // Frequency-domain area fill.
        analyser.getByteFrequencyData(arr);
        ctx.beginPath();
        for (let i = 0; i < w; ++i) {
            const v = arr[((i / w) * arr.length) | 0] / 255;
            const y = h - h * v;
            if (i === 0) ctx.moveTo(0, y);
            else ctx.lineTo(i, y);
        }
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fillStyle = "#073642";
        ctx.fill();

        // Time-domain waveform line.
        analyser.getByteTimeDomainData(arr);
        ctx.beginPath();
        for (let i = 0; i < w; ++i) {
            const v = arr[((i / w) * arr.length) | 0] / 255;
            const y = h - h * v;
            if (i === 0) ctx.moveTo(0, y);
            else ctx.lineTo(i, y);
        }
        ctx.strokeStyle = "#dc322f";
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

class PianoRollView {
    static readonly BLACK_KEY = "010100101010";
    static readonly KEYBOARD_WIDTH = 36;
    static readonly NOW_RATIO = 0.25;             // now-line at 25% from left
    static readonly DEFAULT_LOW = 21;             // A0
    static readonly DEFAULT_HIGH = 108;           // C8
    static readonly VISIBLE_QUARTERS = 8;          // ~8 quarters of context

    private notes: PianoRollNote[] = [];
    private resolution = 480;
    private currentTick = 0;
    private lowPitch = PianoRollView.DEFAULT_LOW;
    private highPitch = PianoRollView.DEFAULT_HIGH;

    constructor(
        private ctx: CanvasRenderingContext2D,
        private width: number,
        private height: number,
    ) {}

    setSong(song: smf.Song) {
        this.notes = collectNotes(song);
        this.resolution = song.header.resolution;
        // Auto-fit pitch range to actual notes used, snapped to octave bounds.
        if (this.notes.length === 0) {
            this.lowPitch = PianoRollView.DEFAULT_LOW;
            this.highPitch = PianoRollView.DEFAULT_HIGH;
        } else {
            let lo = 127;
            let hi = 0;
            for (const n of this.notes) {
                if (n.noteNumber < lo) lo = n.noteNumber;
                if (n.noteNumber > hi) hi = n.noteNumber;
            }
            this.lowPitch = Math.max(0, Math.floor((lo - 2) / 12) * 12);
            this.highPitch = Math.min(127, Math.ceil((hi + 2) / 12) * 12 - 1);
        }
    }

    setCurrentTick(tick: number) {
        this.currentTick = tick;
    }

    clear() {
        this.notes = [];
        this.currentTick = 0;
    }

    private get pitchHeight() {
        return this.height / (this.highPitch - this.lowPitch + 1);
    }
    private get rollX() {
        return PianoRollView.KEYBOARD_WIDTH;
    }
    private get rollWidth() {
        return this.width - PianoRollView.KEYBOARD_WIDTH;
    }
    private get visibleTicks() {
        return this.resolution * PianoRollView.VISIBLE_QUARTERS;
    }
    private get pxPerTick() {
        return this.rollWidth / this.visibleTicks;
    }
    private get nowX() {
        return this.rollX + this.rollWidth * PianoRollView.NOW_RATIO;
    }

    private tickToX(tick: number) {
        return this.nowX + (tick - this.currentTick) * this.pxPerTick;
    }
    private pitchToY(pitch: number) {
        return (this.highPitch - pitch) * this.pitchHeight;
    }

    draw() {
        const ctx = this.ctx;
        ctx.fillStyle = "#002b36";
        ctx.fillRect(0, 0, this.width, this.height);

        this.drawLanes();
        this.drawGrid();
        this.drawNotes();
        this.drawNowLine();
        this.drawKeyboard();
    }

    private drawLanes() {
        const ctx = this.ctx;
        const ph = this.pitchHeight;
        // Black-key row tinting in the roll area.
        ctx.fillStyle = "#073642";
        for (let p = this.lowPitch; p <= this.highPitch; ++p) {
            if (PianoRollView.BLACK_KEY[p % 12] === "1") {
                ctx.fillRect(this.rollX, this.pitchToY(p), this.rollWidth, ph);
            }
        }
    }

    private drawGrid() {
        const ctx = this.ctx;
        const beat = this.resolution;
        const visStart = this.currentTick - PianoRollView.NOW_RATIO * this.visibleTicks;
        const visEnd = visStart + this.visibleTicks;
        const firstBeat = Math.ceil(visStart / beat);
        const lastBeat = Math.floor(visEnd / beat);
        for (let b = firstBeat; b <= lastBeat; ++b) {
            const x = this.tickToX(b * beat);
            ctx.strokeStyle = b % 4 === 0 ? "#586e75" : "#0a4754";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.height);
            ctx.stroke();
        }
        // C-line accents (octave separators).
        ctx.strokeStyle = "#0a4754";
        for (let p = this.lowPitch; p <= this.highPitch; ++p) {
            if (p % 12 === 0) {
                const y = this.pitchToY(p) + this.pitchHeight;
                ctx.beginPath();
                ctx.moveTo(this.rollX, y);
                ctx.lineTo(this.width, y);
                ctx.stroke();
            }
        }
    }

    private drawNotes() {
        const ctx = this.ctx;
        const ph = this.pitchHeight;
        const visStart = this.currentTick - PianoRollView.NOW_RATIO * this.visibleTicks;
        const visEnd = visStart + this.visibleTicks;
        const rollX = this.rollX;
        const rollR = this.width;

        for (const note of this.notes) {
            // Notes are sorted by startTick; once startTick exceeds visEnd we're done.
            if (note.startTick > visEnd) break;
            if (note.endTick < visStart) continue;
            if (note.noteNumber < this.lowPitch || note.noteNumber > this.highPitch) continue;

            const x1 = this.tickToX(note.startTick);
            const x2 = this.tickToX(note.endTick);
            const left = Math.max(rollX, x1);
            const right = Math.min(rollR, x2);
            const w = Math.max(2, right - left);
            const y = this.pitchToY(note.noteNumber);
            const active =
                note.startTick <= this.currentTick && note.endTick >= this.currentTick;
            ctx.fillStyle = channelColor(note.channel, active);
            ctx.fillRect(left, y, w, Math.max(1, ph - 1));
            // Outline played-portion vs. unplayed-portion divider for active note.
            if (active) {
                const splitX = Math.max(rollX, Math.min(rollR, this.nowX));
                ctx.fillStyle = "rgba(255,255,255,0.18)";
                ctx.fillRect(left, y, splitX - left, Math.max(1, ph - 1));
            }
        }
    }

    private drawNowLine() {
        const ctx = this.ctx;
        ctx.strokeStyle = "#dc322f";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.nowX, 0);
        ctx.lineTo(this.nowX, this.height);
        ctx.stroke();
    }

    private drawKeyboard() {
        const ctx = this.ctx;
        const ph = this.pitchHeight;
        const kw = PianoRollView.KEYBOARD_WIDTH;
        // White-key background.
        ctx.fillStyle = "#eee8d5";
        ctx.fillRect(0, 0, kw, this.height);
        for (let p = this.lowPitch; p <= this.highPitch; ++p) {
            const y = this.pitchToY(p);
            if (PianoRollView.BLACK_KEY[p % 12] === "1") {
                ctx.fillStyle = "#002b36";
                ctx.fillRect(0, y, kw * 0.62, ph);
            }
            if (p % 12 === 0) {
                // C label + octave separator
                ctx.strokeStyle = "#586e75";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, y + ph);
                ctx.lineTo(kw, y + ph);
                ctx.stroke();
                if (ph >= 6) {
                    ctx.fillStyle = "#586e75";
                    ctx.font = "9px sans-serif";
                    const octave = (p / 12) - 1;
                    ctx.fillText(`C${octave}`, kw * 0.66, y + ph - 1);
                }
            }
        }
        ctx.strokeStyle = "#586e75";
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, kw - 1, this.height - 1);
    }
}

class Application {
    private audioContext!: AudioContext;
    private synth!: SynthEngine;
    // One SmfPlayer reused across file loads via `load()`. The TimedEvent
    // listener is wired once and survives every load.
    private player!: SmfPlayer;

    private meta: SongMeta | null = null;

    private seekBar!: HTMLInputElement;
    private seekReadout!: HTMLOutputElement;
    private playButton!: HTMLButtonElement;
    private pauseButton!: HTMLButtonElement;
    private stopButton!: HTMLButtonElement;
    private fileButton!: HTMLInputElement;
    private metaFormat!: HTMLElement;
    private metaTracks!: HTMLElement;
    private metaResolution!: HTMLElement;
    private metaDuration!: HTMLElement;

    private pianoRollView!: PianoRollView;
    private keyboardView!: KeyboardView;
    private analyserView!: AnalyserView;
    private analyser!: AnalyserNode;
    private isUserSeeking = false;
    private hasBuffer = false;

    start() {
        this.audioContext = new AudioContext();

        // Analyser tap: SynthEngine → AnalyserNode → destination. AnalyserNode
        // is a passthrough, so audio is unaffected; we just get FFT/wave data
        // for the visualizer.
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.smoothingTimeConstant = 0;
        this.analyser.connect(this.audioContext.destination);

        // The split: SynthEngine handles audio synthesis, SmfPlayer handles
        // SMF parsing + scheduling. The bridge below is the only coupling
        // between them — everything else is independent.
        this.synth = new SynthEngine(this.audioContext, this.analyser);
        this.player = new SmfPlayer(this.audioContext);
        this.player.onTimedEvent((e) => this.onTimedEvent(e));

        this.seekBar = q<HTMLInputElement>("#seekBar");
        this.seekReadout = q<HTMLOutputElement>("#seekReadout");
        this.playButton = q<HTMLButtonElement>("#playButton");
        this.pauseButton = q<HTMLButtonElement>("#pauseButton");
        this.stopButton = q<HTMLButtonElement>("#stopButton");
        this.fileButton = q<HTMLInputElement>("#fileButton");
        this.metaFormat = q<HTMLElement>("#metaFormat");
        this.metaTracks = q<HTMLElement>("#metaTracks");
        this.metaResolution = q<HTMLElement>("#metaResolution");
        this.metaDuration = q<HTMLElement>("#metaDuration");

        const pianoRollCanvas = q<HTMLCanvasElement>("#pianoRollCanvas");
        this.pianoRollView = new PianoRollView(
            pianoRollCanvas.getContext("2d")!,
            pianoRollCanvas.width,
            pianoRollCanvas.height,
        );
        pianoRollCanvas.ondragover = (e) => e.preventDefault();
        pianoRollCanvas.addEventListener("drop", (e) => this.onDrop(e));

        const keyboardCanvas = q<HTMLCanvasElement>("#keyboardCanvas");
        this.keyboardView = new KeyboardView(
            keyboardCanvas.getContext("2d")!,
            keyboardCanvas.width,
            keyboardCanvas.height,
        );

        const analyserCanvas = q<HTMLCanvasElement>("#analyserCanvas");
        this.analyserView = new AnalyserView(
            analyserCanvas.getContext("2d")!,
            analyserCanvas.width,
            analyserCanvas.height,
        );
        this.analyserView.analyser = this.analyser;

        this.fileButton.addEventListener("change", (e) => this.onFileChange(e));
        this.playButton.addEventListener("click", () => this.onPlay());
        this.pauseButton.addEventListener("click", () => this.onPause());
        this.stopButton.addEventListener("click", () => this.onStop());
        this.seekBar.addEventListener("input", () => this.onSeekInput());
        this.seekBar.addEventListener("change", () => this.onSeekCommit());

        this.refreshButtons();
        this.tick();
    }

    private onTimedEvent(e: TimedEvent) {
        // The crucial line: SmfPlayer hands us a TimedEvent, we hand the
        // MIDI event to the synth at the audio time the player computed.
        // wasy.Wasy contains exactly this same line internally.
        const time = e.timeStamp.accurateTime(e.midiEvent.tick);
        this.synth.receiveEvent(e.midiEvent, time);
        this.keyboardView.onTimedEvent(e);
    }

    private async onFileChange(e: Event) {
        const files = (e.target as HTMLInputElement).files;
        if (files == null || files.length === 0) return;
        await this.loadFile(files[0]);
    }

    private async onDrop(e: DragEvent) {
        e.preventDefault();
        const files = e.dataTransfer?.files;
        if (files == null || files.length === 0) return;
        await this.loadFile(files[0]);
    }

    private async loadFile(file: File) {
        const buffer = await file.arrayBuffer();
        // Main-thread parse: drives both metadata display and the piano roll
        // (notes are pre-extracted with absolute ticks). SmfPlayer.load() then
        // re-parses inside the worker for playback — the two parses are
        // independent.
        const song = smf.parseSong(buffer);
        this.meta = {
            format: song.header.format,
            numberOfTracks: song.header.numberOfTracks,
            resolution: song.header.resolution,
            durationTicks: computeDurationTicks(song),
        };
        this.refreshMeta();
        this.pianoRollView.setSong(song);
        this.keyboardView.clear();

        this.synth.pause();
        this.player.load(buffer);
        this.hasBuffer = true;

        if (this.audioContext.state === "suspended") {
            void this.audioContext.resume();
        }
        this.player.play();
        this.refreshButtons();
    }

    private refreshMeta() {
        if (this.meta == null) return;
        this.metaFormat.textContent = String(this.meta.format);
        this.metaTracks.textContent = String(this.meta.numberOfTracks);
        this.metaResolution.textContent = String(this.meta.resolution);
        this.metaDuration.textContent = `${this.meta.durationTicks} tick`;
        this.seekBar.max = String(this.meta.durationTicks);
        this.seekBar.value = "0";
        this.seekBar.disabled = false;
    }

    private onPlay() {
        if (!this.hasBuffer) return;
        if (this.player.paused) {
            this.player.resume();
        } else {
            this.player.play();
        }
        this.refreshButtons();
    }

    private onPause() {
        if (!this.hasBuffer) return;
        this.player.pause();
        this.synth.pause();
        this.keyboardView.clear();
        this.refreshButtons();
    }

    private onStop() {
        if (!this.hasBuffer) return;
        this.player.pause();
        this.synth.pause();
        // SmfPlayer.seek auto-resumes if not paused; pause again to leave it stopped.
        this.player.seek(0);
        this.player.pause();
        this.synth.pause();
        this.keyboardView.clear();
        this.seekBar.value = "0";
        this.refreshButtons();
    }

    private onSeekInput() {
        this.isUserSeeking = true;
        this.updateReadout(Number(this.seekBar.value));
    }

    private onSeekCommit() {
        if (!this.hasBuffer) {
            this.isUserSeeking = false;
            return;
        }
        const tick = Number(this.seekBar.value);
        // Mirror wasy.Wasy.seek: kill in-flight notes on the synth before
        // jumping. SmfPlayer.seek replays state events (ProgramChange /
        // ControlChange / Tempo / SysEx) up to the target tick so the
        // synth state matches what it would have been at `tick`.
        this.synth.pause();
        this.player.seek(tick);
        this.keyboardView.clear();
        this.isUserSeeking = false;
        this.refreshButtons();
    }

    private updateReadout(tick: number) {
        const total = this.meta?.durationTicks ?? 0;
        this.seekReadout.value = `${tick} / ${total} tick`;
    }

    private refreshButtons() {
        const hasBuffer = this.hasBuffer;
        const paused = this.player.paused;
        this.playButton.disabled = !hasBuffer || !paused;
        this.pauseButton.disabled = !hasBuffer || paused;
        this.stopButton.disabled = !hasBuffer;
    }

    private tick() {
        const currentTick = this.hasBuffer
            ? Math.min(
                Math.max(0, this.player.timer.tick),
                this.meta?.durationTicks ?? 0,
            )
            : 0;
        if (this.hasBuffer && !this.isUserSeeking) {
            const t = Math.round(currentTick);
            this.seekBar.value = String(t);
            this.updateReadout(t);
        }
        // While the user drags the seek bar, render the slider's tick instead
        // of timer.tick so the roll previews the seek target.
        const previewTick = this.isUserSeeking
            ? Number(this.seekBar.value)
            : currentTick;
        this.pianoRollView.setCurrentTick(previewTick);
        this.pianoRollView.draw();
        this.keyboardView.draw();
        this.analyserView.draw();
        requestAnimationFrame(() => this.tick());
    }
}

const app = new Application();
document.addEventListener("DOMContentLoaded", () => {
    app.start();
});
