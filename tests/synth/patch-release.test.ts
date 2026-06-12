import { describe, expect, it } from "vitest";
import { Instrument } from "../../src/midi/instrument.js";
import { Event, NoteOnEvent } from "../../src/midi/event.js";
import { SimpleOscillatorPatch, type SimpleOscillatorMonophony } from "../../src/synth.js";

type ParamCall =
    | { kind: "setValueAtTime"; value: number; time: number }
    | { kind: "linearRampToValueAtTime"; value: number; time: number }
    | { kind: "cancelScheduledValues"; time: number };

// No cancelAndHoldAtTime — forces the Firefox fallback path in applyRelease.
const recordingParam = (initial = 0) => {
    const calls: ParamCall[] = [];
    return {
        value: initial,
        calls,
        setValueAtTime(value: number, time: number) {
            calls.push({ kind: "setValueAtTime", value, time });
        },
        linearRampToValueAtTime(value: number, time: number) {
            calls.push({ kind: "linearRampToValueAtTime", value, time });
        },
        cancelScheduledValues(time: number) {
            calls.push({ kind: "cancelScheduledValues", time });
        },
        connect() {},
        disconnect() {},
    };
};

const makeNode = (extras: Record<string, unknown> = {}) => ({
    connect() {},
    disconnect() {},
    addEventListener() {},
    removeEventListener() {},
    ...extras,
});

const makeAudioContext = () =>
    ({
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
        createOscillator: () =>
            makeNode({
                frequency: recordingParam(),
                detune: recordingParam(),
                type: "sine",
                start() {},
                stop(_time?: number) {},
            }),
    }) as unknown as AudioContext;

const noteOn = (note: number, velocity: number) => {
    const dv = new DataView(Uint8Array.from([note, velocity]).buffer);
    return Event.create(dv, 0, 0x90) as NoteOnEvent;
};

describe("Patch.applyRelease without cancelAndHoldAtTime (Firefox fallback)", () => {
    it("anchors a mid-attack NoteOff at the envelope value at `time`, not param.value", () => {
        const ctx = makeAudioContext();
        const inst = new Instrument<SimpleOscillatorMonophony>(ctx, makeNode() as AudioNode);
        const patch = new SimpleOscillatorPatch(inst, "square", makeNode() as AudioNode);

        const mono = patch.onNoteOn(noteOn(60, 100), 0);
        const peak = (100 / 127) ** 2;
        const calls = (mono.gain.gain as unknown as { calls: ParamCall[] }).calls;
        const beforeRelease = calls.length;

        // NoteOff at 2 ms, while the 5 ms attack ramp is still rising and
        // the param's live `.value` is still 0 (the player schedules with
        // a ~200 ms lookahead, so `currentTime` lags `time`). The old
        // `setValueAtTime(param.value, time)` fallback anchored at 0 here,
        // silencing the whole note.
        patch.onNoteOff(mono, 0.002);

        const newCalls = calls.slice(beforeRelease);
        const hold = newCalls.find((c) => c.kind === "linearRampToValueAtTime" && c.time === 0.002);
        expect(hold).toBeDefined();
        expect((hold as { value: number }).value).toBeCloseTo(peak * (0.002 / 0.005));
        const ramp = newCalls.find(
            (c) => c.kind === "linearRampToValueAtTime" && c.value === 0 && c.time > 0.002,
        );
        expect(ramp).toBeDefined();
    });

    it("anchors a post-attack NoteOff at the sustained peak value", () => {
        const ctx = makeAudioContext();
        const inst = new Instrument<SimpleOscillatorMonophony>(ctx, makeNode() as AudioNode);
        const patch = new SimpleOscillatorPatch(inst, "square", makeNode() as AudioNode);

        const mono = patch.onNoteOn(noteOn(60, 100), 0);
        const peak = (100 / 127) ** 2;
        const calls = (mono.gain.gain as unknown as { calls: ParamCall[] }).calls;
        const beforeRelease = calls.length;

        patch.onNoteOff(mono, 1);

        const newCalls = calls.slice(beforeRelease);
        const hold = newCalls.find((c) => c.kind === "linearRampToValueAtTime" && c.time === 1);
        expect(hold).toBeDefined();
        expect((hold as { value: number }).value).toBeCloseTo(peak);
    });
});
