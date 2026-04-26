import { describe, expect, it } from "vitest";
import {
    ChannelPressureEvent,
    ControlChangeEvent,
    Event,
    MetaEvent,
    NoteOffEvent,
    NoteOnEvent,
    PitchBendEvent,
    PolyphonicKeyPressureEvent,
    ProgramChangeEvent,
    SystemExclusiveEvent,
    TempoMetaEvent,
} from "../../src/midi/event.js";

const dv = (...bytes: number[]) => new DataView(Uint8Array.from(bytes).buffer);

describe("Event.create", () => {
    it("dispatches NoteOn", () => {
        const event = Event.create(dv(0x3c, 0x40), 0, 0x90);
        expect(event).toBeInstanceOf(NoteOnEvent);
        expect((event as NoteOnEvent).noteNumber).toBe(0x3c);
        expect((event as NoteOnEvent).velocity).toBe(0x40);
        expect((event as NoteOnEvent).channel).toBe(0);
    });

    it("dispatches NoteOff", () => {
        const event = Event.create(dv(0x3c, 0x40), 0, 0x81);
        expect(event).toBeInstanceOf(NoteOffEvent);
        expect((event as NoteOffEvent).channel).toBe(1);
    });

    it("converts NoteOn velocity=0 on channel 0 into NoteOff with status 0x80", () => {
        const event = Event.create(dv(0x3c, 0x00), 0, 0x90);
        expect(event).toBeInstanceOf(NoteOffEvent);
        expect(event.status).toBe(0x80);
    });

    it("preserves NoteOn when velocity > 0", () => {
        const event = Event.create(dv(0x3c, 0x01), 0, 0x95);
        expect(event).toBeInstanceOf(NoteOnEvent);
    });

    it("does NOT convert NoteOn velocity=0 on non-zero channels (current behavior)", () => {
        // Bug: the velocity-0 → NoteOff coercion in Event.create checks
        // status === 0x90 instead of (status & 0xF0) === 0x90, so it only
        // fires on channel 0. Tracked in TODO.md.
        const event = Event.create(dv(0x3c, 0x00), 0, 0x95);
        expect(event).toBeInstanceOf(NoteOnEvent);
    });

    it("dispatches PolyphonicKeyPressure", () => {
        const event = Event.create(dv(0x3c, 0x40), 0, 0xa2);
        expect(event).toBeInstanceOf(PolyphonicKeyPressureEvent);
    });

    it("dispatches ControlChange", () => {
        const event = Event.create(dv(0x07, 0x64), 0, 0xb3);
        expect(event).toBeInstanceOf(ControlChangeEvent);
        expect((event as ControlChangeEvent).controller).toBe(0x07);
        expect((event as ControlChangeEvent).value).toBe(0x64);
    });

    it("dispatches ProgramChange", () => {
        const event = Event.create(dv(0x10), 0, 0xc4);
        expect(event).toBeInstanceOf(ProgramChangeEvent);
        expect((event as ProgramChangeEvent).program).toBe(0x10);
    });

    it("dispatches ChannelPressure", () => {
        const event = Event.create(dv(0x40), 0, 0xd5);
        expect(event).toBeInstanceOf(ChannelPressureEvent);
    });

    it("dispatches PitchBend with center 0x2000 mapped to 0", () => {
        const event = Event.create(dv(0x00, 0x40), 0, 0xe0);
        expect(event).toBeInstanceOf(PitchBendEvent);
        expect((event as PitchBendEvent).value).toBe(0);
    });

    it("dispatches PitchBend with maximum value", () => {
        const event = Event.create(dv(0x7f, 0x7f), 0, 0xe0);
        expect((event as PitchBendEvent).value).toBe(8191);
    });

    it("dispatches SystemExclusive", () => {
        const event = Event.create(dv(0x7e, 0x7f, 0x09, 0x01, 0xf7), 0, 0xf0);
        expect(event).toBeInstanceOf(SystemExclusiveEvent);
        expect(event.statusType).toBe(0xf0);
    });
});

describe("MetaEvent.create", () => {
    it("returns a generic MetaEvent for unknown type", () => {
        const event = Event.create(dv(0x03, 0x02, 0x41, 0x42), 0, 0xff);
        expect(event).toBeInstanceOf(MetaEvent);
        expect(event).not.toBeInstanceOf(TempoMetaEvent);
        expect((event as MetaEvent).typeIndex).toBe(0x03);
    });

    it("returns a TempoMetaEvent for type 0x51", () => {
        // 0x51 typeIndex, 0x03 length VLQ, then 24-bit big-endian µs/quarter
        // 500000 µs/quarter = 120 BPM
        const event = Event.create(dv(0x51, 0x03, 0x07, 0xa1, 0x20), 0, 0xff);
        expect(event).toBeInstanceOf(TempoMetaEvent);
        const tempo = event as TempoMetaEvent;
        expect(tempo.rawTempo).toBe(500000);
        expect(tempo.beatsPerMinute).toBeCloseTo(120, 4);
    });
});

describe("Event channel accessor", () => {
    it("masks the low nibble of status", () => {
        for (let ch = 0; ch < 16; ++ch) {
            const event = Event.create(dv(0x3c, 0x40), 0, 0x90 | ch);
            expect((event as NoteOnEvent).channel).toBe(ch);
        }
    });
});
