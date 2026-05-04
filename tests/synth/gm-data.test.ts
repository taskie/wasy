import { describe, expect, it } from "vitest";
import { instrumentPatchs, percussionKeyMap } from "../../src/midi/gm.js";
import { gmDrumKit } from "../../src/synth/patches/gm-drum-kit.js";
import { gmPatches } from "../../src/synth/patches/gm.js";

describe("gmPatches", () => {
    it("has exactly 128 entries (one per GM program)", () => {
        expect(gmPatches.length).toBe(128);
    });

    it("each entry carries the canonical GM instrument name", () => {
        for (let p = 0; p < 128; ++p) {
            expect(gmPatches[p].name).toBe(instrumentPatchs[p]);
        }
    });

    it("survives JSON round-trip with name field intact", () => {
        const round = JSON.parse(JSON.stringify(gmPatches[0]));
        expect(round.name).toBe(instrumentPatchs[0]);
        expect(round.source.kind).toBe(gmPatches[0].source.kind);
    });
});

describe("gmDrumKit", () => {
    it("is named Standard Kit and carries kind=drumKit", () => {
        expect(gmDrumKit.kind).toBe("drumKit");
        expect(gmDrumKit.name).toBe("Standard Kit");
    });

    it("each defined voice carries the canonical GM percussion key name", () => {
        for (const [rawKey, voice] of Object.entries(gmDrumKit.voices)) {
            const key = Number(rawKey);
            expect(voice?.name).toBe(percussionKeyMap[key]);
        }
    });

    it("hi-hats 42/44/46 share excludeGroup 1", () => {
        expect(gmDrumKit.voices[42]?.excludeGroup).toBe(1);
        expect(gmDrumKit.voices[44]?.excludeGroup).toBe(1);
        expect(gmDrumKit.voices[46]?.excludeGroup).toBe(1);
    });

    it("non-hi-hat voices have no excludeGroup", () => {
        const nonHiHats = [35, 36, 37, 38, 39, 40, 49, 51];
        for (const n of nonHiHats) {
            expect(gmDrumKit.voices[n]?.excludeGroup).toBeUndefined();
        }
    });

    it("provides a defaultVoice for unmapped notes", () => {
        expect(gmDrumKit.defaultVoice).toBeDefined();
        expect(gmDrumKit.defaultVoice?.oneShot).toBe(true);
    });
});
