import { describe, expect, it } from "vitest";
import { createPlayer } from "../src/player.js";
import {
    ChannelEvent,
    MetaEvent,
    NoteOffEvent,
    NoteOnEvent,
    TempoMetaEvent,
} from "../src/midi/event.js";

const trackChunk = (data: number[]) => [
    0x4d,
    0x54,
    0x72,
    0x6b,
    0x00,
    0x00,
    0x00,
    data.length,
    ...data,
];

// SMF Format 1, 2 tracks, resolution 480.
// Track 0 (tempo / meta): SetTempo at tick 0, EOT at 480.
// Track 1 (channel events): NoteOn ch=2 at 0, NoteOff ch=2 at 240, EOT at 480.
const buildSmf = () => {
    const header = [
        0x4d,
        0x54,
        0x68,
        0x64,
        0x00,
        0x00,
        0x00,
        0x06,
        0x00,
        0x01, // format 1
        0x00,
        0x02, // 2 tracks
        0x01,
        0xe0, // resolution 480
    ];
    // Tempo = 500000 us per beat = 120 BPM (Tempo Meta payload)
    const tempoTrack = [
        0x00,
        0xff,
        0x51,
        0x03,
        0x07,
        0xa1,
        0x20, // SetTempo 500000
        0x83,
        0x60,
        0xff,
        0x2f,
        0x00, // EOT @ tick 480
    ];
    const noteTrack = [
        0x00,
        0x92,
        0x3c,
        0x40, // NoteOn ch=2 note=60 vel=64 @ 0
        0x81,
        0x70,
        0x82,
        0x3c,
        0x00, // NoteOff ch=2 note=60 vel=0 @ 240
        0x81,
        0x70,
        0xff,
        0x2f,
        0x00, // EOT @ 480
    ];
    return Uint8Array.from([...header, ...trackChunk(tempoTrack), ...trackChunk(noteTrack)]).buffer;
};

describe("createPlayer", () => {
    it("exposes resolution and numberOfTracks", () => {
        const player = createPlayer(buildSmf());
        expect(player.resolution).toBe(480);
        expect(player.numberOfTracks).toBe(2);
        expect(player.cursors).toEqual([0, 0]);
    });

    it("read(tick) routes channel events to their channel bucket only", () => {
        const player = createPlayer(buildSmf());
        const events = player.read(0);
        const channelEvents = (bucket: number) =>
            events[bucket].filter((e): e is ChannelEvent => e instanceof ChannelEvent);
        // ch=2 bucket has the NoteOn; no other bucket has any channel event
        expect(channelEvents(2)).toHaveLength(1);
        expect(channelEvents(2)[0]).toBeInstanceOf(NoteOnEvent);
        expect(channelEvents(2)[0].channel).toBe(2);
        expect(channelEvents(0)).toHaveLength(0);
        expect(channelEvents(5)).toHaveLength(0);
    });

    it("broadcasts non-channel events (Tempo) to every channel bucket", () => {
        const player = createPlayer(buildSmf());
        const events = player.read(0);
        for (let ch = 0; ch < 16; ++ch) {
            const tempos = events[ch].filter((e) => e instanceof TempoMetaEvent);
            expect(tempos).toHaveLength(1);
        }
    });

    it("advances cursors so successive reads return only new events", () => {
        const player = createPlayer(buildSmf());
        player.read(0);
        const next = player.read(240);
        // NoteOff ch=2 fires at tick 240
        expect(next[2]).toHaveLength(1);
        expect(next[2][0]).toBeInstanceOf(NoteOffEvent);
        // No more Tempo (already consumed at tick 0)
        for (let ch = 0; ch < 16; ++ch) {
            expect(next[ch].some((e) => e instanceof TempoMetaEvent)).toBe(false);
        }
    });

    it("read past the song end consumes EOT meta events on every track", () => {
        const player = createPlayer(buildSmf());
        player.read(480);
        // both cursors should be at end of their respective tracks
        expect(player.cursors[0]).toBe(2); // tempo track had 2 events
        expect(player.cursors[1]).toBe(3); // note track had 3 events
    });

    it("does not read events whose tick exceeds the requested target", () => {
        const player = createPlayer(buildSmf());
        const early = player.read(100);
        // NoteOff at 240 must not appear yet
        const noteOffs = early.flat().filter((e) => e instanceof NoteOffEvent);
        expect(noteOffs).toHaveLength(0);
        // Tempo at 0 already consumed
        expect(early[0].some((e) => e instanceof MetaEvent)).toBe(true);
    });
});
