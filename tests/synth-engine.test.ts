import { describe, expect, it } from "vitest";
import { isDrumChannel } from "../src/synth-engine.js";

describe("isDrumChannel", () => {
    it("treats channel 9 as the drum part by default (bank MSB 0)", () => {
        for (let ch = 0; ch < 16; ++ch) {
            expect(isDrumChannel(ch, 0)).toBe(ch === 9);
        }
    });

    it("forces drum mode on any channel when bank MSB = 0x78", () => {
        for (let ch = 0; ch < 16; ++ch) {
            expect(isDrumChannel(ch, 0x78)).toBe(true);
        }
    });

    it("forces melody mode (overrides ch 9 default) when bank MSB = 0x79", () => {
        for (let ch = 0; ch < 16; ++ch) {
            expect(isDrumChannel(ch, 0x79)).toBe(false);
        }
    });

    it("falls back to ch-9 default for arbitrary other bank MSB values", () => {
        for (const bank of [0x40, 0x7F, 0x01]) {
            expect(isDrumChannel(9, bank)).toBe(true);
            expect(isDrumChannel(0, bank)).toBe(false);
        }
    });
});
