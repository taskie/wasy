import { describe, expect, it } from "vitest";
import { parseSong } from "../src/smf.js";
import {
    buildSongInfo,
    collectNotes,
    computeDurationTicks,
    extractMetadata,
} from "../src/smf-analyze.js";

// Hand-rolled SMF: format 0, 1 track at resolution 480.
// Events on the single track:
//   delta=0   SequenceTrackName (FF 03 04 "song")
//   delta=0   CopyrightNotice   (FF 02 04 "(c)")
//   delta=0   Marker            (FF 06 06 "intro")
//   delta=0   ch0 NoteOn note=60 vel=64
//   delta=480 ch0 NoteOff note=60 vel=0      → ends at tick 480
//   delta=0   ch1 NoteOn note=72 vel=80
//   delta=480 ch1 NoteOn note=72 vel=80      → re-trigger; closes the prior note at tick 960
//   delta=480 ch1 NoteOff note=72 vel=0      → ends at tick 1440
//   delta=0   EndOfTrack
const buildSmf = () => {
    const text = (typeIndex: number, s: string) => {
        const bytes = [...s].map((c) => c.charCodeAt(0));
        return [0xff, typeIndex, bytes.length, ...bytes];
    };
    const header = [
        0x4d, 0x54, 0x68, 0x64,
        0x00, 0x00, 0x00, 0x06,
        0x00, 0x00,
        0x00, 0x01,
        0x01, 0xe0,
    ];
    const trackData = [
        0x00, ...text(0x03, "song"),
        0x00, ...text(0x02, "(c)"),
        0x00, ...text(0x06, "intro"),
        0x00, 0x90, 0x3c, 0x40,
        0x83, 0x60, 0x80, 0x3c, 0x00,
        0x00, 0x91, 0x48, 0x50,
        0x83, 0x60, 0x91, 0x48, 0x50,
        0x83, 0x60, 0x81, 0x48, 0x00,
        0x00, 0xff, 0x2f, 0x00,
    ];
    const track = [
        0x4d, 0x54, 0x72, 0x6b,
        0x00, 0x00, 0x00, trackData.length,
        ...trackData,
    ];
    return Uint8Array.from([...header, ...track]).buffer;
};

describe("smf-analyze.collectNotes", () => {
    it("pairs NoteOn / NoteOff into closed intervals", () => {
        const song = parseSong(buildSmf());
        const notes = collectNotes(song);
        expect(notes).toHaveLength(3);
        expect(notes[0]).toMatchObject({
            channel: 0,
            noteNumber: 60,
            velocity: 64,
            startTick: 0,
            endTick: 480,
        });
    });

    it("closes the previous note at the new NoteOn tick when a same-pitch re-trigger arrives", () => {
        const song = parseSong(buildSmf());
        const notes = collectNotes(song);
        const ch1 = notes.filter((n) => n.channel === 1 && n.noteNumber === 72);
        expect(ch1).toEqual([
            { channel: 1, noteNumber: 72, velocity: 80, startTick: 480, endTick: 960 },
            { channel: 1, noteNumber: 72, velocity: 80, startTick: 960, endTick: 1440 },
        ]);
    });
});

describe("smf-analyze.extractMetadata", () => {
    it("treats track 0's first SequenceTrackName as the song title", () => {
        const song = parseSong(buildSmf());
        const meta = extractMetadata(song);
        expect(meta.title).toBe("song");
        expect(meta.copyright).toEqual(["(c)"]);
        expect(meta.markers).toEqual([{ tick: 0, text: "intro" }]);
    });
});

describe("smf-analyze.computeDurationTicks", () => {
    it("returns the last event tick across all tracks", () => {
        const song = parseSong(buildSmf());
        // Last event is EndOfTrack at tick 1440 (480+480+480).
        expect(computeDurationTicks(song)).toBe(1440);
    });
});

describe("smf-analyze.buildSongInfo", () => {
    it("bundles header + analysis into a single plain object", () => {
        const song = parseSong(buildSmf());
        const info = buildSongInfo(song);
        expect(info.format).toBe(0);
        expect(info.numberOfTracks).toBe(1);
        expect(info.resolution).toBe(480);
        expect(info.durationTicks).toBe(1440);
        expect(info.notes).toHaveLength(3);
        expect(info.metadata.title).toBe("song");
    });

    it("structured-clones cleanly (no class instances)", () => {
        const song = parseSong(buildSmf());
        const info = buildSongInfo(song);
        // structuredClone is the same algorithm postMessage uses; if SongInfo
        // contains class instances (e.g. midi.Event), this round-trip would
        // strip the prototype chain and a downstream `instanceof` check would
        // fail. Plain-data SongInfo survives intact.
        const cloned = structuredClone(info);
        expect(cloned).toEqual(info);
    });
});
