import { describe, expect, it } from "vitest";
import { parseSong } from "../src/smf.js";
import {
    buildSongInfo,
    collectNotes,
    computeDurationTicks,
    extractMetadata,
    extractTempoMap,
    extractTimeSignatureMap,
    formatTime,
    tickToBarBeat,
    tickToSeconds,
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
const text = (typeIndex: number, s: string) => {
    const bytes = [...s].map((c) => c.charCodeAt(0));
    return [0xff, typeIndex, bytes.length, ...bytes];
};

const buildSmf = () => {
    const header = [
        0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x01, 0xe0,
    ];
    const trackData = [
        0x00,
        ...text(0x03, "song"),
        0x00,
        ...text(0x02, "(c)"),
        0x00,
        ...text(0x06, "intro"),
        0x00,
        0x90,
        0x3c,
        0x40,
        0x83,
        0x60,
        0x80,
        0x3c,
        0x00,
        0x00,
        0x91,
        0x48,
        0x50,
        0x83,
        0x60,
        0x91,
        0x48,
        0x50,
        0x83,
        0x60,
        0x81,
        0x48,
        0x00,
        0x00,
        0xff,
        0x2f,
        0x00,
    ];
    const track = [0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, trackData.length, ...trackData];
    return Uint8Array.from([...header, ...track]).buffer;
};

// Hand-rolled SMF with tempo + time-signature changes:
//   delta=0    Tempo 120 BPM (FF 51 03 07 A1 20 = 500000 µs/quarter)
//   delta=0    TimeSignature 4/4 (FF 58 04 04 02 18 08)
//   delta=1920 Tempo 60 BPM   (FF 51 03 0F 42 40 = 1000000 µs/quarter)
//   delta=0    TimeSignature 3/4 (FF 58 04 03 02 18 08)
//   delta=1440 EndOfTrack
const buildTempoSmf = () => {
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
        0x00,
        0x00,
        0x01,
        0x01,
        0xe0, // resolution = 480
    ];
    const trackData = [
        0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, 0x00, 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08,
        0x8f, 0x00, 0xff, 0x51, 0x03, 0x0f, 0x42, 0x40, 0x00, 0xff, 0x58, 0x04, 0x03, 0x02, 0x18,
        0x08, 0x8b, 0x20, 0xff, 0x2f, 0x00,
    ];
    const track = [0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, trackData.length, ...trackData];
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

describe("smf-analyze.extractTempoMap / extractTimeSignatureMap", () => {
    it("returns tick-sorted plain-data lists", () => {
        const song = parseSong(buildTempoSmf());
        expect(extractTempoMap(song)).toEqual([
            { tick: 0, microsecondsPerQuarter: 500000 },
            { tick: 1920, microsecondsPerQuarter: 1000000 },
        ]);
        expect(extractTimeSignatureMap(song)).toEqual([
            { tick: 0, numerator: 4, denominator: 4 },
            { tick: 1920, numerator: 3, denominator: 4 },
        ]);
    });

    it("includes tempoMap and timeSignatureMap in SongInfo and survives structuredClone", () => {
        const song = parseSong(buildTempoSmf());
        const info = buildSongInfo(song);
        expect(info.tempoMap).toHaveLength(2);
        expect(info.timeSignatureMap).toHaveLength(2);
        expect(structuredClone(info)).toEqual(info);
    });
});

describe("smf-analyze.tickToSeconds", () => {
    it("uses the SMF default 120 BPM when the tempo map is empty", () => {
        // 120 BPM, 480 ticks/quarter → 1 quarter = 0.5s. tick 480 = 0.5s.
        expect(tickToSeconds(480, [], 480)).toBeCloseTo(0.5, 6);
    });

    it("integrates piecewise across tempo changes", () => {
        const tempoMap = extractTempoMap(parseSong(buildTempoSmf()));
        // 0..1920 (4 quarters @ 120 BPM = 0.5 s/q) = 2.0 s
        // 1920..3360 (3 quarters @ 60 BPM = 1.0 s/q) = 3.0 s → total 5.0 s
        expect(tickToSeconds(3360, tempoMap, 480)).toBeCloseTo(5.0, 6);
        // Halfway through the second segment: 1920 + 720 = 2640 → 2.0 + 1.5 = 3.5 s
        expect(tickToSeconds(2640, tempoMap, 480)).toBeCloseTo(3.5, 6);
    });
});

describe("smf-analyze.tickToBarBeat", () => {
    it("returns 1:1 at tick 0 with the default 4/4", () => {
        expect(tickToBarBeat(0, [], 480)).toEqual({ bar: 1, beat: 1 });
    });

    it("counts bars and beats in 4/4 (default)", () => {
        // 4/4 @ 480 → ticksPerBeat=480, ticksPerBar=1920
        expect(tickToBarBeat(480, [], 480)).toEqual({ bar: 1, beat: 2 });
        expect(tickToBarBeat(1920, [], 480)).toEqual({ bar: 2, beat: 1 });
        expect(tickToBarBeat(1920 * 3 + 480 * 2, [], 480)).toEqual({ bar: 4, beat: 3 });
    });

    it("starts a fresh bar at a TimeSignature change tick", () => {
        const map = extractTimeSignatureMap(parseSong(buildTempoSmf()));
        // 4/4 from 0..1920 = 1 full bar → bar 2 at tick 1920
        expect(tickToBarBeat(1920, map, 480)).toEqual({ bar: 2, beat: 1 });
        // Then 3/4: ticksPerBar=1440. tick 1920 + 480 = 2400 → bar 2 beat 2
        expect(tickToBarBeat(2400, map, 480)).toEqual({ bar: 2, beat: 2 });
        // tick 1920 + 1440 = 3360 → bar 3 beat 1
        expect(tickToBarBeat(3360, map, 480)).toEqual({ bar: 3, beat: 1 });
    });
});

describe("smf-analyze.formatTime", () => {
    it("pads to mm:ss below 1 hour and switches to h:mm:ss above", () => {
        expect(formatTime(0)).toBe("00:00");
        expect(formatTime(5)).toBe("00:05");
        expect(formatTime(65)).toBe("01:05");
        expect(formatTime(3600)).toBe("1:00:00");
        expect(formatTime(3725)).toBe("1:02:05");
    });

    it("clamps negative to zero and truncates fractions", () => {
        expect(formatTime(-1)).toBe("00:00");
        expect(formatTime(0.99)).toBe("00:00");
        expect(formatTime(1.7)).toBe("00:01");
    });
});
