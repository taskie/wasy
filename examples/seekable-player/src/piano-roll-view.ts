import type { Note } from "wasy";
import { BLACK_KEY, SOLARIZED, channelColor } from "./palette.js";

export class PianoRollView {
    static readonly KEYBOARD_WIDTH = 36;
    static readonly NOW_RATIO = 0.25;             // now-line at 25% from left
    static readonly DEFAULT_LOW = 21;             // A0
    static readonly DEFAULT_HIGH = 108;           // C8
    static readonly VISIBLE_QUARTERS = 8;          // ~8 quarters of context

    private notes: Note[] = [];
    private resolution = 480;
    private currentTick = 0;
    private lowPitch = PianoRollView.DEFAULT_LOW;
    private highPitch = PianoRollView.DEFAULT_HIGH;

    constructor(
        private ctx: CanvasRenderingContext2D,
        private width: number,
        private height: number,
    ) {}

    // `notes` and `resolution` are now sourced from `SmfPlayer.songInfo`
    // (computed in the player worker) rather than re-parsing the SMF on
    // the main thread.
    setNotes(notes: Note[], resolution: number) {
        this.notes = notes;
        this.resolution = resolution;
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
        ctx.fillStyle = SOLARIZED.base03;
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
        ctx.fillStyle = SOLARIZED.base02;
        for (let p = this.lowPitch; p <= this.highPitch; ++p) {
            if (BLACK_KEY[p % 12] === "1") {
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
        ctx.strokeStyle = SOLARIZED.base01;
        ctx.lineWidth = 1;
        for (let b = firstBeat; b <= lastBeat; ++b) {
            const x = this.tickToX(b * beat);
            // Every 4th beat is the strong (measure) line; the others are dimmed.
            ctx.globalAlpha = b % 4 === 0 ? 1 : 0.35;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.height);
            ctx.stroke();
        }
        ctx.globalAlpha = 0.35;
        // C-line accents (octave separators).
        for (let p = this.lowPitch; p <= this.highPitch; ++p) {
            if (p % 12 === 0) {
                const y = this.pitchToY(p) + this.pitchHeight;
                ctx.beginPath();
                ctx.moveTo(this.rollX, y);
                ctx.lineTo(this.width, y);
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
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
                ctx.fillStyle = SOLARIZED.base2;
                ctx.globalAlpha = 0.18;
                ctx.fillRect(left, y, splitX - left, Math.max(1, ph - 1));
                ctx.globalAlpha = 1;
            }
        }
    }

    private drawNowLine() {
        const ctx = this.ctx;
        ctx.strokeStyle = SOLARIZED.red;
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
        ctx.fillStyle = SOLARIZED.base2;
        ctx.fillRect(0, 0, kw, this.height);
        for (let p = this.lowPitch; p <= this.highPitch; ++p) {
            const y = this.pitchToY(p);
            if (BLACK_KEY[p % 12] === "1") {
                ctx.fillStyle = SOLARIZED.base03;
                ctx.fillRect(0, y, kw * 0.62, ph);
            }
            if (p % 12 === 0) {
                // C label + octave separator
                ctx.strokeStyle = SOLARIZED.base01;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, y + ph);
                ctx.lineTo(kw, y + ph);
                ctx.stroke();
                if (ph >= 6) {
                    ctx.fillStyle = SOLARIZED.base01;
                    ctx.font = "9px sans-serif";
                    const octave = (p / 12) - 1;
                    ctx.fillText(`C${octave}`, kw * 0.66, y + ph - 1);
                }
            }
        }
        ctx.strokeStyle = SOLARIZED.base01;
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, kw - 1, this.height - 1);
    }
}
