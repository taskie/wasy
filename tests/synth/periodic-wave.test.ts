import { describe, expect, it } from "vitest";
import { getPulseWave, pulseWaveCoefficients } from "../../src/synth/periodic-wave.js";

describe("pulseWaveCoefficients", () => {
    it("reduces to the classic square series at duty 0.5", () => {
        const { real, imag } = pulseWaveCoefficients(0.5, 8);
        for (let n = 1; n <= 8; ++n) {
            expect(real[n]).toBeCloseTo(0, 6);
            if (n % 2 === 1) {
                expect(imag[n]).toBeCloseTo(4 / (Math.PI * n), 6);
            } else {
                expect(imag[n]).toBeCloseTo(0, 6);
            }
        }
    });

    it("gives duty d and 1−d identical magnitude spectra", () => {
        const a = pulseWaveCoefficients(0.25, 16);
        const b = pulseWaveCoefficients(0.75, 16);
        for (let n = 1; n <= 16; ++n) {
            const magA = Math.hypot(a.real[n], a.imag[n]);
            const magB = Math.hypot(b.real[n], b.imag[n]);
            expect(magA).toBeCloseTo(magB, 6);
        }
    });

    it("keeps a 1/n harmonic roll-off envelope", () => {
        const { real, imag } = pulseWaveCoefficients(0.125, 32);
        for (let n = 1; n <= 32; ++n) {
            const mag = Math.hypot(real[n], imag[n]);
            // |c_n| = (2/πn)·|2 sin(πnd)| ≤ 4/(πn), and never exceeds it.
            expect(mag).toBeLessThanOrEqual(4 / (Math.PI * n) + 1e-9);
        }
        // DC term must stay zero (index 0).
        expect(real[0]).toBe(0);
        expect(imag[0]).toBe(0);
    });
});

const makeContext = () => {
    const created: Array<{ real: Float32Array; imag: Float32Array }> = [];
    const ctx = {
        createPeriodicWave(real: Float32Array, imag: Float32Array) {
            const wave = { real, imag };
            created.push(wave);
            return wave;
        },
    };
    return { ctx: ctx as unknown as BaseAudioContext, created };
};

describe("getPulseWave", () => {
    it("caches one wave per (context, duty)", () => {
        const { ctx, created } = makeContext();
        const a = getPulseWave(ctx, 0.25);
        const b = getPulseWave(ctx, 0.25);
        const c = getPulseWave(ctx, 0.125);
        expect(a).toBe(b);
        expect(c).not.toBe(a);
        expect(created).toHaveLength(2);
    });

    it("does not share waves across contexts", () => {
        const first = makeContext();
        const second = makeContext();
        getPulseWave(first.ctx, 0.25);
        getPulseWave(second.ctx, 0.25);
        expect(first.created).toHaveLength(1);
        expect(second.created).toHaveLength(1);
    });
});
