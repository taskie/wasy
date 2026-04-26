import { describe, expect, it } from "vitest";
import { EqualTemperamentTuning } from "../../src/player/tuning.js";

describe("EqualTemperamentTuning", () => {
    it("returns 440Hz for note 69 (A4) by default", () => {
        const tuning = new EqualTemperamentTuning();
        expect(tuning.frequency(69)).toBe(440);
    });

    it("doubles frequency every 12 semitones", () => {
        const tuning = new EqualTemperamentTuning();
        expect(tuning.frequency(81)).toBeCloseTo(880, 6);
        expect(tuning.frequency(57)).toBeCloseTo(220, 6);
    });

    it("respects a custom A4 reference frequency", () => {
        const tuning = new EqualTemperamentTuning(442);
        expect(tuning.frequency(69)).toBe(442);
        expect(tuning.frequency(81)).toBeCloseTo(884, 6);
    });

    it("caches results across calls", () => {
        const tuning = new EqualTemperamentTuning();
        const a = tuning.frequency(60);
        const b = tuning.frequency(60);
        expect(a).toBe(b);
    });
});
