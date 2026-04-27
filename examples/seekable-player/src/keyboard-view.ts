import { midi, type TimedEvent } from "wasy";
import { BLACK_KEY, SOLARIZED, channelColor } from "./palette.js";

// 16-row × 128-key activity grid mirroring the original simple-player. NoteOn
// flips the cell on, NoteOff flips it off — there is no decay/release shading.
export class KeyboardView {
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
        ctx.fillStyle = SOLARIZED.base03;
        ctx.fillRect(0, 0, this.width, this.height);
        for (let ch = 0; ch < 16; ++ch) {
            for (let n = 0; n < 128; ++n) {
                const on = this.map[ch][n];
                if (on) {
                    ctx.fillStyle = channelColor(ch, true);
                    ctx.fillRect(n * w, ch * h + 1, w, h - 2);
                } else if (BLACK_KEY[n % 12] !== "1") {
                    // White-key idle background tint.
                    ctx.fillStyle = SOLARIZED.base02;
                    ctx.fillRect(n * w, ch * h + 1, w, h - 2);
                }
            }
            // Channel label on the far left.
            ctx.fillStyle = SOLARIZED.base01;
            ctx.font = "9px sans-serif";
            ctx.fillText(`ch ${ch + 1}`, 2, ch * h + h - 2);
        }
    }
}
