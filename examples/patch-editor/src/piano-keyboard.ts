// Interactive piano keyboard canvas. Shows notes C1–B7 (MIDI 24–107).
// Click/touch triggers noteOn/noteOff callbacks; Web MIDI and programmatic
// calls can also light keys via highlight().

// Whether a semitone is a black key.
const IS_BLACK = [
    false,
    true,
    false,
    true,
    false,
    false,
    true,
    false,
    true,
    false,
    true,
    false,
] as const;

const FIRST_NOTE = 24; // C1
const LAST_NOTE = 107; // B7

// Count white keys in [FIRST_NOTE, LAST_NOTE].
let WHITE_KEY_COUNT = 0;
for (let n = FIRST_NOTE; n <= LAST_NOTE; ++n) {
    if (!IS_BLACK[n % 12]) WHITE_KEY_COUNT++;
}

export type KeyEventCallback = (noteNumber: number) => void;

export class PianoKeyboard {
    private activeNotes = new Set<number>();
    private pressedNote: number | null = null;

    private readonly W: number; // white key width
    private readonly H: number; // canvas height
    private readonly BH: number; // black key height
    private readonly BW: number; // black key width

    // Note → x offset of its white anchor (the white key it sits on or is).
    private readonly whiteX: number[];

    onNoteOn: KeyEventCallback = () => {};
    onNoteOff: KeyEventCallback = () => {};

    constructor(
        private ctx: CanvasRenderingContext2D,
        private width: number,
        private height: number,
    ) {
        this.H = height;
        this.W = width / WHITE_KEY_COUNT;
        this.BH = height * 0.62;
        this.BW = this.W * 0.6;

        // Precompute white-key x for every note.
        this.whiteX = Array.from({ length: 128 }, () => -1);
        let wi = 0;
        for (let n = FIRST_NOTE; n <= LAST_NOTE; ++n) {
            if (!IS_BLACK[n % 12]) {
                this.whiteX[n] = wi * this.W;
                wi++;
            }
        }
        // Black keys: x = preceding white key x + W - BW/2.
        for (let n = FIRST_NOTE; n <= LAST_NOTE; ++n) {
            if (IS_BLACK[n % 12]) {
                this.whiteX[n] = this.whiteX[n - 1] + this.W - this.BW / 2;
            }
        }

        ctx.canvas.addEventListener("mousedown", (e) => this.onMouseDown(e));
        ctx.canvas.addEventListener("mouseup", (e) => this.onMouseUp(e));
        ctx.canvas.addEventListener("mouseleave", () => this.onMouseLeave());
        ctx.canvas.addEventListener("mousemove", (e) => this.onMouseMove(e));
    }

    highlight(note: number, on: boolean) {
        if (on) this.activeNotes.add(note);
        else this.activeNotes.delete(note);
    }

    clearHighlights() {
        this.activeNotes.clear();
    }

    draw(highlightedDrumNote?: number) {
        const ctx = this.ctx;
        const W = this.W;
        const H = this.H;
        const BH = this.BH;
        const BW = this.BW;

        // White keys
        let wi = 0;
        for (let n = FIRST_NOTE; n <= LAST_NOTE; ++n) {
            if (IS_BLACK[n % 12]) continue;
            const x = wi * W;
            const active = this.activeNotes.has(n);
            const isHighlightedDrum = n === highlightedDrumNote;
            ctx.fillStyle = active ? "#dc322f" : isHighlightedDrum ? "#2aa198" : "#eee8d5";
            ctx.fillRect(x + 1, 0, W - 2, H - 1);
            // Octave label at C keys
            if (n % 12 === 0) {
                ctx.fillStyle = active ? "#eee8d5" : "#93a1a1";
                ctx.font = `${Math.round(W * 0.55)}px sans-serif`;
                ctx.textAlign = "center";
                ctx.fillText(`C${Math.floor(n / 12) - 1}`, x + W / 2, H - 4);
            }
            wi++;
        }

        // Black keys (drawn on top)
        for (let n = FIRST_NOTE; n <= LAST_NOTE; ++n) {
            if (!IS_BLACK[n % 12]) continue;
            const x = this.whiteX[n];
            const active = this.activeNotes.has(n);
            const isHighlightedDrum = n === highlightedDrumNote;
            ctx.fillStyle = active ? "#dc322f" : isHighlightedDrum ? "#2aa198" : "#073642";
            ctx.fillRect(x, 0, BW, BH);
        }
    }

    private hitTest(clientX: number, clientY: number): number | null {
        const rect = this.ctx.canvas.getBoundingClientRect();
        const scaleX = this.width / rect.width;
        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * (this.H / rect.height);

        // Check black keys first (they're on top).
        if (y < this.BH) {
            for (let n = FIRST_NOTE; n <= LAST_NOTE; ++n) {
                if (!IS_BLACK[n % 12]) continue;
                const bx = this.whiteX[n];
                if (x >= bx && x < bx + this.BW) return n;
            }
        }
        // White keys.
        const wi = Math.floor(x / this.W);
        let count = 0;
        for (let n = FIRST_NOTE; n <= LAST_NOTE; ++n) {
            if (IS_BLACK[n % 12]) continue;
            if (count === wi) return n;
            count++;
        }
        return null;
    }

    private onMouseDown(e: MouseEvent) {
        const note = this.hitTest(e.clientX, e.clientY);
        if (note == null) return;
        this.pressedNote = note;
        this.onNoteOn(note);
    }

    private onMouseUp(_e: MouseEvent) {
        if (this.pressedNote != null) {
            this.onNoteOff(this.pressedNote);
            this.pressedNote = null;
        }
    }

    private onMouseLeave() {
        if (this.pressedNote != null) {
            this.onNoteOff(this.pressedNote);
            this.pressedNote = null;
        }
    }

    private onMouseMove(e: MouseEvent) {
        if (this.pressedNote == null) return;
        const note = this.hitTest(e.clientX, e.clientY);
        if (note !== this.pressedNote) {
            this.onNoteOff(this.pressedNote);
            this.pressedNote = note;
            if (note != null) this.onNoteOn(note);
        }
    }
}
