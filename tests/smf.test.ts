import { describe, expect, it } from "vitest";
import * as xiff from "../src/xiff.js";
import { parseSong } from "../src/smf.js";
import { ControlChangeEvent, MetaEvent, NoteOffEvent, NoteOnEvent } from "../src/midi/event.js";

const buildSmf = () => {
    // MThd: format 0, 1 track, resolution 480 (0x01E0)
    const header = [
        0x4d,
        0x54,
        0x68,
        0x64, // "MThd"
        0x00,
        0x00,
        0x00,
        0x06, // length = 6
        0x00,
        0x00, // format = 0
        0x00,
        0x01, // numTracks = 1
        0x01,
        0xe0, // resolution = 480
    ];
    // Track data:
    // delta=0, NoteOn ch0 note=60 vel=64
    // delta=480 (VLQ 0x83 0x60), NoteOff ch0 note=60 vel=0
    // delta=0, MetaEvent FF 2F 00 (End of Track)
    const trackData = [
        0x00, 0x90, 0x3c, 0x40, 0x83, 0x60, 0x80, 0x3c, 0x00, 0x00, 0xff, 0x2f, 0x00,
    ];
    const track = [
        0x4d,
        0x54,
        0x72,
        0x6b, // "MTrk"
        0x00,
        0x00,
        0x00,
        trackData.length, // length
        ...trackData,
    ];
    return Uint8Array.from([...header, ...track]).buffer;
};

describe("xiff.parseChunks with SMF config", () => {
    it("parses MThd and MTrk chunks", () => {
        const chunks = xiff.parseChunks(buildSmf(), xiff.configs.smf);
        expect(chunks).toHaveLength(2);
        expect(chunks[0].name).toBe("MThd");
        expect(chunks[1].name).toBe("MTrk");
        expect(chunks[0].dataView.byteLength).toBe(6);
    });
});

const buildSmfWithChannelMode = () => {
    // MThd: format 0, 1 track, resolution 480
    const header = [
        0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01, 0xe0,
    ];
    // Track:
    //   delta=0, CC ch0 #0x7C (Omni Off) value=0
    //   delta=0, running status, CC #0x7E (Mono On) value=4
    //   delta=0, EOT
    const trackData = [0x00, 0xb0, 0x7c, 0x00, 0x00, 0x7e, 0x04, 0x00, 0xff, 0x2f, 0x00];
    const track = [0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, trackData.length, ...trackData];
    return Uint8Array.from([...header, ...track]).buffer;
};

describe("smf.parseSong (Channel Mode CCs)", () => {
    it("consumes 2 data bytes for CC 0x7C and 0x7E", () => {
        const song = parseSong(buildSmfWithChannelMode());
        const events = song.tracks[0].events;
        expect(events).toHaveLength(3);
        expect(events[0]).toBeInstanceOf(ControlChangeEvent);
        expect((events[0] as ControlChangeEvent).controller).toBe(0x7c);
        expect(events[1]).toBeInstanceOf(ControlChangeEvent);
        expect((events[1] as ControlChangeEvent).controller).toBe(0x7e);
        expect((events[1] as ControlChangeEvent).value).toBe(4);
        expect(events[2]).toBeInstanceOf(MetaEvent);
    });
});

describe("smf.parseSong", () => {
    it("loads header fields", () => {
        const song = parseSong(buildSmf());
        expect(song.header.format).toBe(0);
        expect(song.header.numberOfTracks).toBe(1);
        expect(song.header.resolution).toBe(480);
    });

    it("loads one track with three events", () => {
        const song = parseSong(buildSmf());
        expect(song.tracks).toHaveLength(1);
        const events = song.tracks[0].events;
        expect(events).toHaveLength(3);
        expect(events[0]).toBeInstanceOf(NoteOnEvent);
        expect(events[1]).toBeInstanceOf(NoteOffEvent);
        expect(events[2]).toBeInstanceOf(MetaEvent);
    });

    it("computes cumulative ticks from delta-time VLQs", () => {
        const song = parseSong(buildSmf());
        const events = song.tracks[0].events;
        expect(events[0].tick).toBe(0);
        expect(events[1].tick).toBe(480);
        expect(events[2].tick).toBe(480);
    });

    it("decodes a NoteOn velocity > 0 followed by an explicit NoteOff", () => {
        const song = parseSong(buildSmf());
        const [on, off] = song.tracks[0].events as [NoteOnEvent, NoteOffEvent, ...unknown[]];
        expect(on.noteNumber).toBe(60);
        expect(on.velocity).toBe(64);
        expect(off.noteNumber).toBe(60);
        expect(off.velocity).toBe(0);
    });
});
