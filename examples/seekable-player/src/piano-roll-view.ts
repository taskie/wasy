import type { Note, TimeSignatureChange } from "wasy";
import { BLACK_KEY, getCanvasPalette, channelColor } from "./palette.js";

export class PianoRollView {
    static readonly KEYBOARD_WIDTH = 36;
    static readonly NOW_RATIO = 0.25; // now-line at 25% from left
    static readonly DEFAULT_LOW = 21; // A0
    static readonly DEFAULT_HIGH = 108; // C8
    static readonly VISIBLE_QUARTERS = 8; // ~8 quarters of context

    private notes: Note[] = [];
    private resolution = 480;
    private timeSignatureMap: TimeSignatureChange[] = [];
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

    setTimeSignatureMap(map: TimeSignatureChange[]) {
        this.timeSignatureMap = map;
    }

    setCurrentTick(tick: number) {
        this.currentTick = tick;
    }

    clear() {
        this.notes = [];
        this.timeSignatureMap = [];
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
        const p = getCanvasPalette();
        ctx.fillStyle = p.bg;
        ctx.fillRect(0, 0, this.width, this.height);

        this.drawLanes(p);
        this.drawGrid(p);
        this.drawNotes(p);
        this.drawNowLine(p);
        this.drawKeyboard(p);
    }

    private drawLanes(p: ReturnType<typeof getCanvasPalette>) {
        const ctx = this.ctx;
        const ph = this.pitchHeight;
        // Black-key row tinting in the roll area.
        ctx.fillStyle = p.bgAlt;
        for (let pitch = this.lowPitch; pitch <= this.highPitch; ++pitch) {
            if (BLACK_KEY[pitch % 12] === "1") {
                ctx.fillRect(this.rollX, this.pitchToY(pitch), this.rollWidth, ph);
            }
        }
    }

    private drawGrid(p: ReturnType<typeof getCanvasPalette>) {
        const ctx = this.ctx;
        const visStart = this.currentTick - PianoRollView.NOW_RATIO * this.visibleTicks;
        const visEnd = visStart + this.visibleTicks;
        ctx.strokeStyle = p.gridLine;
        ctx.lineWidth = 1;
        // Walk the time-signature map as a sequence of [start, end) segments.
        // Each segment carries its own (numerator, denominator), which sets
        // ticksPerBeat = resolution * 4 / denominator and ticksPerBar
        // = ticksPerBeat * numerator. Beat lines start from the segment's
        // own startTick (a TS change always begins a fresh bar at its tick),
        // so the index `i` in `i % numerator === 0` marks bar lines locally.
        // Default segment (no TS events) is 4/4 from tick 0 onward.
        const drawSegment = (
            segStart: number,
            segEnd: number,
            numerator: number,
            denominator: number,
        ) => {
            const ticksPerBeat = (this.resolution * 4) / denominator;
            const localStart = Math.max(visStart, segStart) - segStart;
            const localEnd = Math.min(visEnd, segEnd) - segStart;
            if (localStart >= localEnd) return;
            const firstBeat = Math.ceil(localStart / ticksPerBeat);
            const lastBeat = Math.floor(localEnd / ticksPerBeat);
            for (let i = firstBeat; i <= lastBeat; ++i) {
                const x = this.tickToX(segStart + i * ticksPerBeat);
                ctx.globalAlpha = i % numerator === 0 ? 1 : 0.35;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, this.height);
                ctx.stroke();
            }
        };
        let cursor = 0;
        let numerator = 4;
        let denominator = 4;
        for (const change of this.timeSignatureMap) {
            if (change.tick > cursor) {
                drawSegment(cursor, change.tick, numerator, denominator);
            }
            cursor = change.tick;
            numerator = change.numerator;
            denominator = change.denominator;
        }
        drawSegment(cursor, Number.POSITIVE_INFINITY, numerator, denominator);
        ctx.globalAlpha = 0.35;
        // C-line accents (octave separators).
        for (let pitch = this.lowPitch; pitch <= this.highPitch; ++pitch) {
            if (pitch % 12 === 0) {
                const y = this.pitchToY(pitch) + this.pitchHeight;
                ctx.beginPath();
                ctx.moveTo(this.rollX, y);
                ctx.lineTo(this.width, y);
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
    }

    private drawNotes(p: ReturnType<typeof getCanvasPalette>) {
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
            const active = note.startTick <= this.currentTick && note.endTick >= this.currentTick;
            ctx.fillStyle = channelColor(note.channel, active);
            ctx.fillRect(left, y, w, Math.max(1, ph - 1));
            // Outline played-portion vs. unplayed-portion divider for active note.
            if (active) {
                const splitX = Math.max(rollX, Math.min(rollR, this.nowX));
                ctx.fillStyle = p.noteOverlay;
                ctx.globalAlpha = 0.18;
                ctx.fillRect(left, y, splitX - left, Math.max(1, ph - 1));
                ctx.globalAlpha = 1;
            }
        }
    }

    private drawNowLine(p: ReturnType<typeof getCanvasPalette>) {
        const ctx = this.ctx;
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.nowX, 0);
        ctx.lineTo(this.nowX, this.height);
        ctx.stroke();
    }

    private drawKeyboard(p: ReturnType<typeof getCanvasPalette>) {
        const ctx = this.ctx;
        const ph = this.pitchHeight;
        const kw = PianoRollView.KEYBOARD_WIDTH;
        // White-key background.
        ctx.fillStyle = p.keyWhite;
        ctx.fillRect(0, 0, kw, this.height);
        for (let pitch = this.lowPitch; pitch <= this.highPitch; ++pitch) {
            const y = this.pitchToY(pitch);
            if (BLACK_KEY[pitch % 12] === "1") {
                ctx.fillStyle = p.keyBlack;
                ctx.fillRect(0, y, kw * 0.62, ph);
            }
            if (pitch % 12 === 0) {
                // C label + octave separator
                ctx.strokeStyle = p.label;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, y + ph);
                ctx.lineTo(kw, y + ph);
                ctx.stroke();
                if (ph >= 6) {
                    ctx.fillStyle = p.label;
                    ctx.font = "9px sans-serif";
                    const octave = pitch / 12 - 1;
                    ctx.fillText(`C${octave}`, kw * 0.66, y + ph - 1);
                }
            }
        }
        ctx.strokeStyle = p.label;
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, kw - 1, this.height - 1);
    }
}
