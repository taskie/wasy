import { describe, expect, it } from "vitest";
import { isDrumChannel, isGsReset, isXgReset, matchSysEx } from "../src/synth-engine.js";
import { Event, SystemExclusiveEvent } from "../src/midi/event.js";

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
        for (const bank of [0x40, 0x7f, 0x01]) {
            expect(isDrumChannel(9, bank)).toBe(true);
            expect(isDrumChannel(0, bank)).toBe(false);
        }
    });
});

const dv = (...bytes: number[]) => new DataView(Uint8Array.from(bytes).buffer);

const GS_BODY = [0x41, 0x10, 0x42, 0x12, 0x40, 0x00, 0x7f, 0x00, 0x41, 0xf7];
const XG_BODY = [0x43, 0x10, 0x4c, 0x00, 0x00, 0x7e, 0x00, 0xf7];

describe("matchSysEx / GS / XG reset detection", () => {
    it("matches GS Reset from runtime MIDI (no varlen prefix)", () => {
        const event = new SystemExclusiveEvent(dv(...GS_BODY), 0, 0xf0);
        expect(isGsReset(event)).toBe(true);
        expect(isXgReset(event)).toBe(false);
    });

    it("matches GS Reset from SMF (with single-byte varlen length prefix)", () => {
        // SMF stores [varlen-length, ...body...]; for a 10-byte body the
        // varlen prefix is just 0x0A.
        const event = new SystemExclusiveEvent(dv(GS_BODY.length, ...GS_BODY), 0, 0xf0);
        expect(isGsReset(event)).toBe(true);
    });

    it("matches XG System On from runtime MIDI", () => {
        const event = new SystemExclusiveEvent(dv(...XG_BODY), 0, 0xf0);
        expect(isXgReset(event)).toBe(true);
        expect(isGsReset(event)).toBe(false);
    });

    it("matches XG System On from SMF (varlen prefix)", () => {
        const event = new SystemExclusiveEvent(dv(XG_BODY.length, ...XG_BODY), 0, 0xf0);
        expect(isXgReset(event)).toBe(true);
    });

    it("does not match unrelated SysEx (e.g. GM Reset)", () => {
        // GM Reset: F0 7E 7F 09 01 F7
        const gmReset = dv(0x7e, 0x7f, 0x09, 0x01, 0xf7);
        const event = new SystemExclusiveEvent(gmReset, 0, 0xf0);
        expect(isGsReset(event)).toBe(false);
        expect(isXgReset(event)).toBe(false);
    });

    it("does not false-positive when SysEx is shorter than the pattern", () => {
        const tiny = dv(0x41, 0x10);
        expect(matchSysEx(tiny, GS_BODY)).toBe(false);
    });

    it("integrates with Event.create() for SMF-formatted SysEx", () => {
        // Event.create dispatches by status byte; SystemExclusiveEvent
        // takes the dataView verbatim (no further parsing).
        const event = Event.create(dv(GS_BODY.length, ...GS_BODY), 0, 0xf0);
        expect(event).toBeInstanceOf(SystemExclusiveEvent);
        expect(isGsReset(event as SystemExclusiveEvent)).toBe(true);
    });
});
