import { describe, expect, it, vi } from "vitest";
import { Event, NoteOnEvent } from "../../src/midi/event.js";
import { Instrument } from "../../src/midi/instrument.js";
import {
    compileDrumKit,
    type DrumKitDefinition,
    type Monophony,
} from "../../src/synth.js";
import { gmDrumKit } from "../../src/synth/patches/gm-drum-kit.js";

const recordingParam = (initial = 0) => ({
    value: initial,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    cancelScheduledValues() {},
    cancelAndHoldAtTime() {},
    connect() {},
    disconnect() {},
});

const makeNode = (extras: Record<string, unknown> = {}) => ({
    connect() {},
    disconnect() {},
    addEventListener() {},
    removeEventListener() {},
    ...extras,
});

const makeAudioContext = () => {
    const ctx = {
        currentTime: 0,
        sampleRate: 44100,
        createStereoPanner: () => makeNode({ pan: recordingParam() }),
        createGain: () => makeNode({ gain: recordingParam() }),
        createConstantSource: () =>
            makeNode({ offset: recordingParam(), start() {}, stop() {} }),
        createBiquadFilter: () =>
            makeNode({
                frequency: recordingParam(),
                Q: recordingParam(),
                detune: recordingParam(),
                type: "bandpass",
            }),
        createOscillator: () =>
            makeNode({
                frequency: recordingParam(),
                detune: recordingParam(),
                type: "sine",
                start() {},
                stop() {},
            }),
        createBufferSource: () =>
            makeNode({
                detune: recordingParam(),
                buffer: null,
                loop: false,
                start() {},
                stop() {},
            }),
        createBuffer: (channels: number, length: number, sampleRate: number) => ({
            length,
            sampleRate,
            numberOfChannels: channels,
            getChannelData: () => new Float32Array(length),
        }),
    };
    return ctx as unknown as AudioContext;
};

const makeInstrument = () => {
    const inst = new Instrument<Monophony>(makeAudioContext(), makeNode() as AudioNode);
    return inst;
};

const noteOn = (channel: number, note: number, velocity = 100) => {
    const dv = new DataView(Uint8Array.from([note, velocity]).buffer);
    return Event.create(dv, 0, 0x90 | channel) as NoteOnEvent;
};

const shortNoise = {
    source: { kind: "noise" as const },
    envelope: { type: "ramp" as const, begin: 1, end: 0, duration: 0.1 },
    oneShot: true,
};

describe("DrumKitPatch.excludeGroups", () => {
    it("attacking a voice expires the other group members but not itself", () => {
        const inst = makeInstrument();
        const def: DrumKitDefinition = {
            kind: "drumKit",
            voices: {
                10: { ...shortNoise, excludeGroup: 1 },
                11: { ...shortNoise, excludeGroup: 1 },
                12: { ...shortNoise, excludeGroup: 1 },
                20: { ...shortNoise, excludeGroup: 2 },
                30: { ...shortNoise },
            },
        };
        const kit = compileDrumKit(inst, def);
        inst.patch = kit;

        const expireSpy = vi.spyOn(inst, "expireNote");

        kit.onNoteOn(noteOn(9, 10), 1);

        const expiredNotes = expireSpy.mock.calls.map(([n]) => n).toSorted((a, b) => a - b);
        expect(expiredNotes).toEqual([11, 12]);
    });

    it("voices outside any group never trigger expireNote", () => {
        const inst = makeInstrument();
        const def: DrumKitDefinition = {
            kind: "drumKit",
            voices: {
                30: { ...shortNoise },
                31: { ...shortNoise },
            },
        };
        const kit = compileDrumKit(inst, def);
        inst.patch = kit;

        const expireSpy = vi.spyOn(inst, "expireNote");
        kit.onNoteOn(noteOn(9, 30), 1);
        expect(expireSpy).not.toHaveBeenCalled();
    });

    it("preserves the original 42/44/46 hi-hat exclusivity via gmDrumKit", () => {
        const inst = makeInstrument();
        const kit = compileDrumKit(inst, gmDrumKit);
        inst.patch = kit;

        const expireSpy = vi.spyOn(inst, "expireNote");

        // Closed hi-hat (42) should expire pedal (44) and open (46).
        kit.onNoteOn(noteOn(9, 42), 1);
        const closedExpiredOthers = expireSpy.mock.calls.map(([n]) => n).toSorted((a, b) => a - b);
        expect(closedExpiredOthers).toEqual([44, 46]);
        expireSpy.mockClear();

        // A non-hi-hat drum (e.g. snare 38) must not expire any hi-hat.
        kit.onNoteOn(noteOn(9, 38), 2);
        expect(expireSpy).not.toHaveBeenCalled();
    });
});
