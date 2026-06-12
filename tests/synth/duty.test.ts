import { describe, expect, it } from "vitest";
import { Instrument } from "../../src/midi/instrument.js";
import { Event, NoteOnEvent } from "../../src/midi/event.js";
import {
    compileTone,
    GainedOscillatorPatch,
    OneShotOscillatorPatch,
    SimpleOscillatorPatch,
    type SimpleOscillatorMonophony,
    type ToneDefinition,
} from "../../src/synth.js";

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

type RecordingOscillator = ReturnType<typeof makeNode> & {
    type: string;
    periodicWaves: unknown[];
};

const makeContext = () => {
    const oscillators: RecordingOscillator[] = [];
    const periodicWaves: Array<{ real: Float32Array; imag: Float32Array }> = [];
    const ctx = {
        currentTime: 0,
        sampleRate: 44100,
        createStereoPanner: () => makeNode({ pan: recordingParam() }),
        createGain: () => makeNode({ gain: recordingParam() }),
        createConstantSource: () => makeNode({ offset: recordingParam(), start() {}, stop() {} }),
        createBiquadFilter: () =>
            makeNode({
                frequency: recordingParam(),
                Q: recordingParam(),
                detune: recordingParam(),
                type: "lowpass",
            }),
        createOscillator: () => {
            const oscillator = makeNode({
                frequency: recordingParam(),
                detune: recordingParam(),
                type: "sine",
                periodicWaves: [] as unknown[],
                setPeriodicWave(wave: unknown) {
                    (oscillator as RecordingOscillator).periodicWaves.push(wave);
                },
                start() {},
                stop() {},
            }) as RecordingOscillator;
            oscillators.push(oscillator);
            return oscillator;
        },
        createPeriodicWave(real: Float32Array, imag: Float32Array) {
            const wave = { real, imag };
            periodicWaves.push(wave);
            return wave;
        },
    };
    return { ctx: ctx as unknown as AudioContext, oscillators, periodicWaves };
};

const noteOn = (note: number, velocity: number) => {
    const dv = new DataView(Uint8Array.from([note, velocity]).buffer);
    return Event.create(dv, 0, 0x90) as NoteOnEvent;
};

const adsrDef = (duty?: number): ToneDefinition => ({
    source: { kind: "oscillator", oscillatorType: "square", duty },
    envelope: { type: "adsr", attack: 0.005, release: 0.05 },
});

describe("OscillatorSource.duty", () => {
    it("flows from compileTone into all oscillator patch classes", () => {
        const { ctx } = makeContext();
        const inst = new Instrument<SimpleOscillatorMonophony>(ctx, makeNode() as AudioNode);

        const simple = compileTone(inst, adsrDef(0.25));
        expect(simple).toBeInstanceOf(SimpleOscillatorPatch);
        expect((simple as SimpleOscillatorPatch).duty).toBe(0.25);

        const gained = compileTone(inst, {
            source: { kind: "oscillator", oscillatorType: "square", duty: 0.125 },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.3 },
        });
        expect(gained).toBeInstanceOf(GainedOscillatorPatch);
        expect((gained as GainedOscillatorPatch).duty).toBe(0.125);

        const oneShot = compileTone(inst, {
            source: { kind: "oscillator", oscillatorType: "square", duty: 0.125 },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.3 },
            oneShot: true,
        });
        expect(oneShot).toBeInstanceOf(OneShotOscillatorPatch);
        expect((oneShot as OneShotOscillatorPatch).duty).toBe(0.125);
    });

    it("plays a PeriodicWave pulse instead of the built-in square when duty is set", () => {
        const { ctx, oscillators, periodicWaves } = makeContext();
        const inst = new Instrument<SimpleOscillatorMonophony>(ctx, makeNode() as AudioNode);
        const patch = compileTone(inst, adsrDef(0.25)) as SimpleOscillatorPatch;

        patch.onNoteOn(noteOn(60, 100), 0);

        // `oscillators` also contains the Instrument's vibrato LFO; the
        // note's oscillator is the most recently created one.
        const oscillator = oscillators.at(-1)!;
        expect(oscillator.periodicWaves).toHaveLength(1);
        expect(oscillator.periodicWaves[0]).toBe(periodicWaves[0]);
        // The built-in type must be left alone — setting it would override
        // the custom wave.
        expect(oscillator.type).toBe("sine");
    });

    it("reuses the cached wave across notes and keeps plain squares native", () => {
        const { ctx, oscillators, periodicWaves } = makeContext();
        const inst = new Instrument<SimpleOscillatorMonophony>(ctx, makeNode() as AudioNode);

        const pulse = compileTone(inst, adsrDef(0.25)) as SimpleOscillatorPatch;
        pulse.onNoteOn(noteOn(60, 100), 0);
        pulse.onNoteOn(noteOn(64, 100), 1);
        expect(periodicWaves).toHaveLength(1); // cached per (ctx, duty)

        const plain = compileTone(inst, adsrDef(undefined)) as SimpleOscillatorPatch;
        plain.onNoteOn(noteOn(67, 100), 2);
        const oscillator = oscillators.at(-1)!;
        expect(oscillator.periodicWaves).toHaveLength(0);
        expect(oscillator.type).toBe("square");
    });
});
