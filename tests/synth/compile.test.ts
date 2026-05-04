import { describe, expect, it } from "vitest";
import { Instrument } from "../../src/midi/instrument.js";
import {
    GainedNoisePatch,
    GainedOscillatorPatch,
    NoisePatch,
    OneShotNoisePatch,
    OneShotOscillatorPatch,
    SimpleOscillatorPatch,
    compileTone,
    compileDrumKit,
    type DrumKitDefinition,
    type Monophony,
    type ToneDefinition,
} from "../../src/synth.js";
import { Patch } from "../../src/synth/patch.js";

const makeNode = (extras: Record<string, unknown> = {}) => ({
    connect() {},
    disconnect() {},
    addEventListener() {},
    removeEventListener() {},
    ...extras,
});

const recordingParam = (initial = 0) => ({
    value: initial,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    cancelScheduledValues() {},
    cancelAndHoldAtTime() {},
    connect() {},
    disconnect() {},
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

const makeInstrument = () =>
    new Instrument<Monophony>(makeAudioContext(), makeNode() as AudioNode);

describe("compileTone", () => {
    it("oscillator + adsr → SimpleOscillatorPatch with attack/release overrides", () => {
        const inst = makeInstrument();
        const def: ToneDefinition = {
            name: "Test",
            source: { kind: "oscillator", oscillatorType: "square" },
            envelope: { type: "adsr", attack: 0.01, release: 0.2 },
        };
        const patch = compileTone(inst, def) as SimpleOscillatorPatch;
        expect(patch).toBeInstanceOf(SimpleOscillatorPatch);
        expect(patch.attackTime).toBe(0.01);
        expect(patch.releaseTime).toBe(0.2);
        // decay / sustain unspecified → keep base defaults from synth/patch.ts.
        expect(patch.decayTime).toBe(0);
        expect(patch.sustainLevel).toBe(1);
    });

    it("oscillator + adsr with decay/sustain overrides those fields too", () => {
        const inst = makeInstrument();
        const def: ToneDefinition = {
            source: { kind: "oscillator", oscillatorType: "sawtooth" },
            envelope: { type: "adsr", attack: 0.005, decay: 0.1, sustain: 0.5, release: 0.05 },
        };
        const patch = compileTone(inst, def);
        expect(patch.decayTime).toBe(0.1);
        expect(patch.sustainLevel).toBe(0.5);
    });

    it("oscillator + ramp + !oneShot → GainedOscillatorPatch", () => {
        const inst = makeInstrument();
        const def: ToneDefinition = {
            source: { kind: "oscillator", oscillatorType: "triangle" },
            envelope: { type: "ramp", begin: 1.2, end: 0.1, duration: 0.7 },
        };
        const patch = compileTone(inst, def) as GainedOscillatorPatch;
        // OneShotOscillatorPatch extends GainedOscillatorPatch, so check the
        // exact constructor isn't the OneShot subclass.
        expect(patch).toBeInstanceOf(GainedOscillatorPatch);
        expect(patch).not.toBeInstanceOf(OneShotOscillatorPatch);
        expect(patch.valueAtBegin).toBe(1.2);
        expect(patch.valueAtEnd).toBe(0.1);
        expect(patch.duration).toBe(0.7);
    });

    it("oscillator + ramp + oneShot + fixed pitch → OneShotOscillatorPatch", () => {
        const inst = makeInstrument();
        const def: ToneDefinition = {
            source: { kind: "oscillator", oscillatorType: "square", pitch: { fixed: 150 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.2 },
            oneShot: true,
        };
        const patch = compileTone(inst, def) as OneShotOscillatorPatch;
        expect(patch).toBeInstanceOf(OneShotOscillatorPatch);
        expect(patch.fixedFrequency).toBe(150);
        expect(patch.duration).toBe(0.2);
    });

    it("noise + adsr → NoisePatch (e.g. program 0x7E Applause)", () => {
        const inst = makeInstrument();
        const def: ToneDefinition = {
            source: { kind: "noise" },
            envelope: { type: "adsr", attack: 0.005, release: 0.05 },
        };
        const patch = compileTone(inst, def) as NoisePatch;
        expect(patch).toBeInstanceOf(NoisePatch);
        expect(patch).not.toBeInstanceOf(GainedNoisePatch);
        expect(patch.attackTime).toBe(0.005);
        expect(patch.releaseTime).toBe(0.05);
    });

    it("noise + ramp + !oneShot → GainedNoisePatch (e.g. program 0x77 Helicopter)", () => {
        const inst = makeInstrument();
        const def: ToneDefinition = {
            source: { kind: "noise" },
            envelope: { type: "ramp", begin: 0, end: 1, duration: 1 },
        };
        const patch = compileTone(inst, def) as GainedNoisePatch;
        expect(patch).toBeInstanceOf(GainedNoisePatch);
        expect(patch).not.toBeInstanceOf(OneShotNoisePatch);
        expect(patch.valueAtBegin).toBe(0);
        expect(patch.valueAtEnd).toBe(1);
        expect(patch.duration).toBe(1);
    });

    it("noise + ramp + oneShot + fixed filterFrequency → OneShotNoisePatch", () => {
        const inst = makeInstrument();
        const def: ToneDefinition = {
            source: { kind: "noise", filterFrequency: { fixed: 8000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 1.5 },
            oneShot: true,
        };
        const patch = compileTone(inst, def) as OneShotNoisePatch;
        expect(patch).toBeInstanceOf(OneShotNoisePatch);
        expect(patch.fixedFrequency).toBe(8000);
        expect(patch.duration).toBe(1.5);
    });

    it("ADSR + oneShot is rejected", () => {
        const inst = makeInstrument();
        const def: ToneDefinition = {
            source: { kind: "oscillator", oscillatorType: "sine" },
            envelope: { type: "adsr", attack: 0.005, release: 0.05 },
            oneShot: true,
        };
        expect(() => compileTone(inst, def)).toThrow();
    });

    it("name field doesn't affect compilation", () => {
        const inst = makeInstrument();
        const without: ToneDefinition = {
            source: { kind: "oscillator", oscillatorType: "square" },
            envelope: { type: "adsr", attack: 0.01, release: 0.2 },
        };
        const withName: ToneDefinition = { ...without, name: "Whatever" };
        const a = compileTone(inst, without);
        const b = compileTone(inst, withName);
        expect(a.constructor).toBe(b.constructor);
        expect(a.attackTime).toBe(b.attackTime);
        expect(a.releaseTime).toBe(b.releaseTime);
    });

    it("survives JSON round-trip and produces equivalent patches", () => {
        const inst = makeInstrument();
        const def: ToneDefinition = {
            name: "Bright Piano",
            source: { kind: "oscillator", oscillatorType: "triangle" },
            envelope: { type: "ramp", begin: 1.2, end: 0.1, duration: 0.7 },
        };
        const round = JSON.parse(JSON.stringify(def)) as ToneDefinition;
        expect(round.name).toBe("Bright Piano");
        const patch = compileTone(inst, round) as GainedOscillatorPatch;
        expect(patch).toBeInstanceOf(GainedOscillatorPatch);
        expect(patch.valueAtBegin).toBe(1.2);
        expect(patch.valueAtEnd).toBe(0.1);
        expect(patch.duration).toBe(0.7);
    });
});

describe("compileDrumKit", () => {
    it("normalizes string voice keys (JSON round-trip safe)", () => {
        const inst = makeInstrument();
        const raw: DrumKitDefinition = {
            kind: "drumKit",
            voices: {
                42: {
                    source: { kind: "noise", filterFrequency: { fixed: 6000 } },
                    envelope: { type: "ramp", begin: 1, end: 0, duration: 0.1 },
                    oneShot: true,
                },
            },
        };
        const stringified = JSON.parse(JSON.stringify(raw)) as DrumKitDefinition;
        const kit = compileDrumKit(inst, stringified);
        // After JSON round-trip, voice keys are strings; compile must
        // re-key them as numbers so `patchMap[42]` resolves.
        expect(kit.patchMap[42]).toBeInstanceOf(OneShotNoisePatch);
    });

    it("applies busGain from definition", () => {
        const inst = makeInstrument();
        const kit = compileDrumKit(inst, {
            kind: "drumKit",
            busGain: 1.5,
            voices: {},
        });
        expect(kit.gain.gain.value).toBe(1.5);
    });

    it("falls back to busGain default 2 when omitted (matches prior behavior)", () => {
        const inst = makeInstrument();
        const kit = compileDrumKit(inst, { kind: "drumKit", voices: {} });
        expect(kit.gain.gain.value).toBe(2);
    });

    it("returns the expected concrete Patch type for each routing", () => {
        const inst = makeInstrument();
        const kit = compileDrumKit(inst, {
            kind: "drumKit",
            voices: {
                10: {
                    source: { kind: "noise" },
                    envelope: { type: "ramp", begin: 1, end: 0, duration: 0.1 },
                    oneShot: true,
                    routing: "left",
                },
                20: {
                    source: { kind: "noise" },
                    envelope: { type: "ramp", begin: 1, end: 0, duration: 0.1 },
                    oneShot: true,
                    routing: "right",
                },
                30: {
                    source: { kind: "noise" },
                    envelope: { type: "ramp", begin: 1, end: 0, duration: 0.1 },
                    oneShot: true,
                    routing: "center",
                },
            },
        });
        expect(kit.patchMap[10]).toBeInstanceOf(Patch);
        expect(kit.patchMap[20]).toBeInstanceOf(Patch);
        expect(kit.patchMap[30]).toBeInstanceOf(Patch);
    });

    it("uses defaultVoice as patchMap[0] when provided", () => {
        const inst = makeInstrument();
        const kit = compileDrumKit(inst, {
            kind: "drumKit",
            voices: {},
            defaultVoice: {
                source: { kind: "oscillator", oscillatorType: "sine", pitch: { fixed: 440 } },
                envelope: { type: "ramp", begin: 1, end: 0, duration: 0.1 },
                oneShot: true,
            },
        });
        expect(kit.patchMap[0]).toBeInstanceOf(OneShotOscillatorPatch);
    });
});
