import { getCanvasPalette } from "./palette.js";

export class AnalyserView {
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
        const p = getCanvasPalette();
        ctx.fillStyle = p.bg;
        ctx.fillRect(0, 0, this.width, this.height);
        const analyser = this._analyser;
        const arr = this.array;
        if (analyser == null || arr == null) return;

        // Frequency-domain area fill (closed path so we can fill the area
        // under the curve).
        analyser.getByteFrequencyData(arr);
        this.plotPath(arr, true);
        ctx.fillStyle = p.bgAlt;
        ctx.fill();

        // Time-domain waveform line (open path, just stroked).
        analyser.getByteTimeDomainData(arr);
        this.plotPath(arr, false);
        ctx.strokeStyle = p.accent;
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // `closeToBottom = true` produces a closed path for area fill;
    // `false` leaves the path open for stroking as a line.
    private plotPath(arr: Uint8Array, closeToBottom: boolean) {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        ctx.beginPath();
        for (let i = 0; i < w; ++i) {
            const v = arr[((i / w) * arr.length) | 0] / 255;
            const y = h - h * v;
            if (i === 0) ctx.moveTo(0, y);
            else ctx.lineTo(i, y);
        }
        if (closeToBottom) {
            ctx.lineTo(w, h);
            ctx.lineTo(0, h);
            ctx.closePath();
        }
    }
}
