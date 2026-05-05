import { midi, type TimedEvent } from "wasy";
import { BLACK_KEY, getCanvasPalette, channelColor } from "./palette.js";

// Top offset matches HEADER_H in channel-status-view so rows align when side-by-side.
const TOP_OFFSET = 15;

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
        const p = getCanvasPalette();
        const noteW = this.width / 128;
        const rowH = (this.height - TOP_OFFSET) / 16;

        ctx.fillStyle = p.bg;
        ctx.fillRect(0, 0, this.width, this.height);

        // Header — matches Channel Status style
        ctx.fillStyle = p.bgAlt;
        ctx.fillRect(0, 0, this.width, TOP_OFFSET);
        ctx.font = "bold 8px sans-serif";
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillStyle = p.label;
        for (let n = 0; n < 128; n += 12) {
            const octave = Math.floor(n / 12) - 1;
            ctx.fillText(`C${octave}`, n * noteW + 1, TOP_OFFSET / 2);
        }
        ctx.strokeStyle = p.gridLine;
        ctx.lineWidth = 0.5;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(0, TOP_OFFSET);
        ctx.lineTo(this.width, TOP_OFFSET);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Channel rows
        for (let ch = 0; ch < 16; ++ch) {
            const rowY = TOP_OFFSET + ch * rowH;
            for (let n = 0; n < 128; ++n) {
                const on = this.map[ch][n];
                if (on) {
                    ctx.fillStyle = channelColor(ch, true);
                    ctx.fillRect(n * noteW, rowY + 1, noteW, rowH - 2);
                } else if (BLACK_KEY[n % 12] !== "1") {
                    ctx.fillStyle = p.bgAlt;
                    ctx.fillRect(n * noteW, rowY + 1, noteW, rowH - 2);
                }
            }
            // Channel label on the far left.
            ctx.fillStyle = p.label;
            ctx.font = "9px sans-serif";
            ctx.textBaseline = "alphabetic";
            ctx.textAlign = "left";
            ctx.fillText(`ch ${ch + 1}`, 2, rowY + rowH - 2);
        }
    }
}
