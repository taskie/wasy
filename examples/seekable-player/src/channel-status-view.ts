import { midi, type TimedEvent, instrumentPatchs } from "wasy";
import { getCanvasPalette, channelColor } from "./palette.js";

type ColKind = "bar" | "center" | "bool" | "text";

type ColDef = {
    label: string;
    kind: ColKind;
    weight: number;
    cc: number | "pb" | "prog";
};

// Prg is first (large weight for GM name), bar/center cols use ~half the old weight.
// Sus stays narrow.
const COLS: ColDef[] = [
    { label: "Prg", kind: "text", weight: 4, cc: "prog" },
    { label: "Vol", kind: "bar", weight: 1.5, cc: 7 },
    { label: "Exp", kind: "bar", weight: 1.5, cc: 11 },
    { label: "Pan", kind: "center", weight: 1.5, cc: 10 },
    { label: "Mod", kind: "bar", weight: 1.5, cc: 1 },
    { label: "PB", kind: "center", weight: 1.5, cc: "pb" },
    { label: "Rev", kind: "bar", weight: 1.5, cc: 91 },
    { label: "Cho", kind: "bar", weight: 1.5, cc: 93 },
    { label: "Res", kind: "bar", weight: 1.5, cc: 71 },
    { label: "Brt", kind: "bar", weight: 1.5, cc: 74 },
    { label: "Sus", kind: "bool", weight: 1.0, cc: 64 },
];

const PAD_H = 8;
const CH_W = 26;
const COL_GAP = 3;
const HEADER_H = 15;
const FONT = "8px sans-serif";
const FONT_BOLD = "bold 8px sans-serif";

const TOTAL_WEIGHT = COLS.reduce((s, c) => s + c.weight, 0);

function buildLayout(canvasWidth: number): { x: number; w: number }[] {
    const available = canvasWidth - PAD_H * 2 - CH_W - COL_GAP * (COLS.length + 1);
    const unit = available / TOTAL_WEIGHT;
    const result: { x: number; w: number }[] = [];
    let cursor = PAD_H + CH_W + COL_GAP;
    for (const col of COLS) {
        const w = Math.round(col.weight * unit);
        result.push({ x: cursor, w });
        cursor += w + COL_GAP;
    }
    return result;
}

// GM default CC values
const DEFAULT_CC = new Map<number, number>([
    [7, 100],
    [11, 127],
    [10, 64],
    [1, 0],
    [64, 0],
    [91, 40],
    [93, 0],
]);

type ChState = {
    cc: Map<number, number>;
    program: number;
    pitchBend: number;
};

function makeDefaultState(): ChState[] {
    return Array.from({ length: 16 }, () => ({
        cc: new Map(DEFAULT_CC),
        program: 0,
        pitchBend: 0,
    }));
}

// Return text truncated from the end with "…" suffix until it fits maxWidth.
// Binary search: O(log n) measureText calls. Results are memoized by text+width.
const fitCache = new Map<string, string>();

function fitFromStart(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    const key = `${text}\0${maxWidth}`;
    const cached = fitCache.get(key);
    if (cached !== undefined) return cached;
    let result: string;
    if (ctx.measureText(text).width <= maxWidth) {
        result = text;
    } else {
        let lo = 0;
        let hi = text.length;
        while (lo < hi) {
            const mid = (lo + hi + 1) >>> 1;
            if (ctx.measureText(text.slice(0, mid) + "…").width <= maxWidth) lo = mid;
            else hi = mid - 1;
        }
        result = lo > 0 ? text.slice(0, lo) + "…" : "…";
    }
    fitCache.set(key, result);
    return result;
}

export class ChannelStatusView {
    private state: ChState[] = makeDefaultState();
    private layout: { x: number; w: number }[];

    constructor(
        private ctx: CanvasRenderingContext2D,
        private width: number,
        private height: number,
    ) {
        this.layout = buildLayout(width);
    }

    onTimedEvent(e: TimedEvent): void {
        const m = e.midiEvent;
        if (m instanceof midi.ControlChangeEvent) {
            this.state[m.channel].cc.set(m.controller, m.value);
        } else if (m instanceof midi.ProgramChangeEvent) {
            this.state[m.channel].program = m.program;
        } else if (m instanceof midi.PitchBendEvent) {
            this.state[m.channel].pitchBend = m.value;
        }
    }

    clear(): void {
        this.state = makeDefaultState();
    }

    draw(): void {
        const ctx = this.ctx;
        const p = getCanvasPalette();
        const rowH = (this.height - HEADER_H) / 16;
        const barH = Math.max(3, Math.round(rowH - 4));

        ctx.fillStyle = p.bg;
        ctx.fillRect(0, 0, this.width, this.height);

        // Header
        ctx.fillStyle = p.bgAlt;
        ctx.fillRect(0, 0, this.width, HEADER_H);
        ctx.font = FONT_BOLD;
        ctx.textBaseline = "middle";
        ctx.textAlign = "center";
        ctx.fillStyle = p.label;
        for (let i = 0; i < COLS.length; i++) {
            const { x, w } = this.layout[i];
            ctx.fillText(COLS[i].label, x + w / 2, HEADER_H / 2);
        }

        // Channel rows
        for (let ch = 0; ch < 16; ch++) {
            const rowY = HEADER_H + ch * rowH;
            const barY = rowY + (rowH - barH) / 2;
            const state = this.state[ch];
            const color = channelColor(ch, true);

            // Alternating row tint
            if (ch % 2 === 1) {
                ctx.fillStyle = p.bgAlt;
                ctx.globalAlpha = 0.35;
                ctx.fillRect(0, rowY, this.width, rowH);
                ctx.globalAlpha = 1;
            }

            // Channel number
            ctx.font = FONT;
            ctx.textBaseline = "middle";
            ctx.textAlign = "right";
            ctx.fillStyle = color;
            ctx.fillText(String(ch + 1), PAD_H + CH_W - 2, rowY + rowH / 2);

            for (let i = 0; i < COLS.length; i++) {
                const col = COLS[i];
                const { x, w } = this.layout[i];

                if (col.kind === "text") {
                    // GM instrument name (or "Drums" for ch 10)
                    ctx.font = FONT_BOLD;
                    ctx.textBaseline = "middle";
                    ctx.textAlign = "left";
                    ctx.fillStyle = color;
                    const num = String(state.program + 1).padStart(3, "0");
                    const label =
                        ch === 9
                            ? `${num}: Drums`
                            : `${num}: ${instrumentPatchs[state.program] ?? "?"}`;
                    ctx.fillText(fitFromStart(ctx, label, w - 2), x + 1, rowY + rowH / 2);
                    continue;
                }

                // Bar cell background
                ctx.fillStyle = p.bgAlt;
                ctx.globalAlpha = 0.5;
                ctx.fillRect(x, barY, w, barH);
                ctx.globalAlpha = 1;
                ctx.fillStyle = color;

                if (col.kind === "bar") {
                    const val =
                        state.cc.get(col.cc as number) ?? DEFAULT_CC.get(col.cc as number) ?? 0;
                    const bw = Math.round((val / 127) * w);
                    if (bw > 0) ctx.fillRect(x, barY, bw, barH);
                } else if (col.kind === "center") {
                    const cx = x + w / 2;
                    if (col.cc === "pb") {
                        const val = state.pitchBend;
                        const bw = Math.round((Math.abs(val) / 8192) * (w / 2));
                        if (bw > 0) ctx.fillRect(val >= 0 ? cx : cx - bw, barY, bw, barH);
                    } else {
                        const val = state.cc.get(col.cc as number) ?? 64;
                        const offset = Math.round(((val - 64) / 63) * (w / 2));
                        if (offset !== 0)
                            ctx.fillRect(
                                offset > 0 ? cx : cx + offset,
                                barY,
                                Math.abs(offset),
                                barH,
                            );
                    }
                    // Center tick
                    ctx.fillStyle = p.gridLine;
                    ctx.globalAlpha = 0.6;
                    ctx.fillRect(cx - 0.5, barY, 1, barH);
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = color;
                } else if (col.kind === "bool") {
                    const val = state.cc.get(col.cc as number) ?? 0;
                    if (val >= 64) ctx.fillRect(x, barY, w, barH);
                }
            }
        }

        // Row divider lines
        ctx.strokeStyle = p.gridLine;
        ctx.lineWidth = 0.5;
        ctx.globalAlpha = 0.25;
        for (let ch = 1; ch < 16; ch++) {
            const y = HEADER_H + ch * rowH;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.width, y);
            ctx.stroke();
        }
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(0, HEADER_H);
        ctx.lineTo(this.width, HEADER_H);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
}
