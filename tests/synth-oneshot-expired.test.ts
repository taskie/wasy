import { describe, expect, it } from "vitest";
import { Instrument } from "../src/midi/instrument.js";
import { Event, NoteOnEvent } from "../src/midi/event.js";
import {
    OneShotNoisePatch,
    OneShotOscillatorPatch,
    type NoiseMonophony,
    type SimpleOscillatorMonophony,
} from "../src/synth.js";

type ParamCall =
    | { kind: "setValueAtTime"; value: number; time: number }
    | { kind: "linearRampToValueAtTime"; value: number; time: number }
    | { kind: "cancelScheduledValues"; time: number }
    | { kind: "cancelAndHoldAtTime"; time: number };

const recordingParam = (initial = 0) => {
    const calls: ParamCall[] = [];
    const param = {
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
        cancelAndHoldAtTime(time: number) {
            calls.push({ kind: "cancelAndHoldAtTime", time });
        },
        connect() {},
        disconnect() {},
    };
    return param;
};

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
        createConstantSource: () => makeNode({ offset: recordingParam(), start() {}, stop() {} }),
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
                stop(_time?: number) {},
            }),
        createBufferSource: () =>
            makeNode({
                detune: recordingParam(),
                buffer: null,
                loop: false,
                start() {},
                stop(_time?: number) {},
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

const noteOn = (note: number, velocity: number) => {
    const dv = new DataView(Uint8Array.from([note, velocity]).buffer);
    return Event.create(dv, 0, 0x99) as NoteOnEvent;
};

describe("OneShotNoisePatch.onExpired", () => {
    it("anchors the in-flight decay ramp at `time` instead of cancelling to 0", () => {
        const ctx = makeAudioContext();
        const inst = new Instrument<NoiseMonophony>(ctx, makeNode() as AudioNode);
        // Crash Cymbal 1 settings: peak 1.0, decay 1.5s, fixed freq 8kHz.
        const patch = new OneShotNoisePatch(inst, 1, 0, 1.5, 8000, makeNode() as AudioNode);

        const mono = patch.onNoteOn(noteOn(49, 100), 0);
        const gainCalls = (mono.gain.gain as unknown as { calls: ParamCall[] }).calls;
        const beforeExpire = gainCalls.length;

        // Simulate the second hit's eviction at audio time 0.1 (= within the
        // 200ms lookahead window the player would use).
        patch.onExpired(mono, 0.1);

        const newCalls = gainCalls.slice(beforeExpire);
        // Must use cancelAndHoldAtTime (or fallback) at the expire time so the
        // in-flight decay is anchored at its current value rather than snapping
        // back up to the held peak.
        const anchored = newCalls.find(
            (c) =>
                c.kind === "cancelAndHoldAtTime" || (c.kind === "setValueAtTime" && c.time === 0.1),
        );
        expect(anchored).toBeDefined();
        // Must NOT cut directly to 0 at the expire time — that would skip the
        // tiny fade and re-introduce the snap-to-peak hazard before the cut.
        const hardCut = newCalls.find(
            (c) => c.kind === "setValueAtTime" && c.value === 0 && c.time === 0.1,
        );
        expect(hardCut).toBeUndefined();
        // Must schedule a short fade to 0 just after the expire time.
        const ramp = newCalls.find(
            (c) =>
                c.kind === "linearRampToValueAtTime" &&
                c.value === 0 &&
                c.time > 0.1 &&
                c.time <= 0.1 + 0.01,
        );
        expect(ramp).toBeDefined();
    });
});

describe("OneShotOscillatorPatch.onExpired", () => {
    it("anchors the in-flight decay ramp at `time` instead of cancelling to 0", () => {
        const ctx = makeAudioContext();
        const inst = new Instrument<SimpleOscillatorMonophony>(ctx, makeNode() as AudioNode);
        // Bass Drum 1 settings: duration 0.2s, freq 150, square.
        const patch = new OneShotOscillatorPatch(inst, 0.2, 150, "square", makeNode() as AudioNode);

        const mono = patch.onNoteOn(noteOn(36, 100), 0);
        const gainCalls = (mono.gain.gain as unknown as { calls: ParamCall[] }).calls;
        const beforeExpire = gainCalls.length;

        patch.onExpired(mono, 0.1);

        const newCalls = gainCalls.slice(beforeExpire);
        const anchored = newCalls.find(
            (c) =>
                c.kind === "cancelAndHoldAtTime" || (c.kind === "setValueAtTime" && c.time === 0.1),
        );
        expect(anchored).toBeDefined();
        const hardCut = newCalls.find(
            (c) => c.kind === "setValueAtTime" && c.value === 0 && c.time === 0.1,
        );
        expect(hardCut).toBeUndefined();
        const ramp = newCalls.find(
            (c) =>
                c.kind === "linearRampToValueAtTime" &&
                c.value === 0 &&
                c.time > 0.1 &&
                c.time <= 0.1 + 0.01,
        );
        expect(ramp).toBeDefined();
    });
});
