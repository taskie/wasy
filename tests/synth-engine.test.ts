import { describe, expect, it } from "vitest";
import { isDrumChannel, isGsReset, isXgReset, matchSysEx } from "../src/synth-engine.js";
import { Event, SystemExclusiveEvent } from "../src/midi/event.js";

describe("isDrumChannel", () => {
    it("treats channel 9 as the drum part by default (bank MSB 0)", () => {
        for (let ch = 0; ch < 16; ++ch) {
            expect(isDrumChannel(ch, 0)).toBe(ch === 9);
        }
    });

    it("forces drum mode on any channel when bank MSB = 0x78", () => {
        for (let ch = 0; ch < 16; ++ch) {
            expect(isDrumChannel(ch, 0x78)).toBe(true);
        }
    });

    it("forces melody mode (overrides ch 9 default) when bank MSB = 0x79", () => {
        for (let ch = 0; ch < 16; ++ch) {
            expect(isDrumChannel(ch, 0x79)).toBe(false);
        }
    });

    it("falls back to ch-9 default for arbitrary other bank MSB values", () => {
        for (const bank of [0x40, 0x7f, 0x01]) {
            expect(isDrumChannel(9, bank)).toBe(true);
            expect(isDrumChannel(0, bank)).toBe(false);
        }
    });
});

const dv = (...bytes: number[]) => new DataView(Uint8Array.from(bytes).buffer);

const GS_BODY = [0x41, 0x10, 0x42, 0x12, 0x40, 0x00, 0x7f, 0x00, 0x41, 0xf7];
const XG_BODY = [0x43, 0x10, 0x4c, 0x00, 0x00, 0x7e, 0x00, 0xf7];

describe("matchSysEx / GS / XG reset detection", () => {
    it("matches GS Reset from runtime MIDI (no varlen prefix)", () => {
        const event = new SystemExclusiveEvent(dv(...GS_BODY), 0, 0xf0);
        expect(isGsReset(event)).toBe(true);
        expect(isXgReset(event)).toBe(false);
    });

    it("matches GS Reset from SMF (with single-byte varlen length prefix)", () => {
        // SMF stores [varlen-length, ...body...]; for a 10-byte body the
        // varlen prefix is just 0x0A.
        const event = new SystemExclusiveEvent(dv(GS_BODY.length, ...GS_BODY), 0, 0xf0);
        expect(isGsReset(event)).toBe(true);
    });

    it("matches XG System On from runtime MIDI", () => {
        const event = new SystemExclusiveEvent(dv(...XG_BODY), 0, 0xf0);
        expect(isXgReset(event)).toBe(true);
        expect(isGsReset(event)).toBe(false);
    });

    it("matches XG System On from SMF (varlen prefix)", () => {
        const event = new SystemExclusiveEvent(dv(XG_BODY.length, ...XG_BODY), 0, 0xf0);
        expect(isXgReset(event)).toBe(true);
    });

    it("does not match unrelated SysEx (e.g. GM Reset)", () => {
        // GM Reset: F0 7E 7F 09 01 F7
        const gmReset = dv(0x7e, 0x7f, 0x09, 0x01, 0xf7);
        const event = new SystemExclusiveEvent(gmReset, 0, 0xf0);
        expect(isGsReset(event)).toBe(false);
        expect(isXgReset(event)).toBe(false);
    });

    it("does not false-positive when SysEx is shorter than the pattern", () => {
        const tiny = dv(0x41, 0x10);
        expect(matchSysEx(tiny, GS_BODY)).toBe(false);
    });

    it("integrates with Event.create() for SMF-formatted SysEx", () => {
        // Event.create dispatches by status byte; SystemExclusiveEvent
        // takes the dataView verbatim (no further parsing).
        const event = Event.create(dv(GS_BODY.length, ...GS_BODY), 0, 0xf0);
        expect(event).toBeInstanceOf(SystemExclusiveEvent);
        expect(isGsReset(event as SystemExclusiveEvent)).toBe(true);
    });
});

// --- SynthEngine.applyResetAll -------------------------------------------

import { SynthEngine } from "../src/synth-engine.js";
import { DrumKitPatch } from "../src/synth.js";

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

const makeEngineContext = () =>
    ({
        currentTime: 0,
        sampleRate: 44100,
        createStereoPanner: () => makeNode({ pan: recordingParam() }),
        createGain: () => makeNode({ gain: recordingParam() }),
        createDynamicsCompressor: () => makeNode(),
        createConvolver: () => makeNode({ buffer: null }),
        createDelay: () => makeNode({ delayTime: recordingParam() }),
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
    }) as unknown as AudioContext;

const ccEvent = (channel: number, controller: number, value: number) =>
    Event.create(dv(controller, value), 0, 0xb0 | channel);
const programChange = (channel: number, program: number) =>
    Event.create(dv(program), 0, 0xc0 | channel);

describe("SynthEngine.receiveEvent time clamping", () => {
    it("clamps event times that slipped into the past up to currentTime", () => {
        const ctx = makeEngineContext();
        const engine = new SynthEngine(ctx, makeNode() as AudioNode);
        (ctx as unknown as { currentTime: number }).currentTime = 10;
        const received: number[] = [];
        engine.instruments[0].patch = {
            receiveEvent: (_event: unknown, time: number) => {
                received.push(time);
            },
        } as (typeof engine.instruments)[0]["patch"];

        // Dispatched late (scheduled time already in the past): the whole
        // event must slip to "now" so envelope ramps keep their shape,
        // instead of Web Audio crushing them against stale endpoints.
        engine.receiveEvent(Event.create(dv(60, 100), 0, 0x90), 9.5);
        // On-time events pass through untouched.
        engine.receiveEvent(Event.create(dv(62, 100), 0, 0x90), 10.5);

        expect(received).toEqual([10, 10.5]);
    });
});

describe("SynthEngine.applyResetAll", () => {
    it("restores default programs and controllers on every part", () => {
        const engine = new SynthEngine(makeEngineContext(), makeNode() as AudioNode);

        engine.receiveEvent(programChange(0, 30), 0);
        engine.receiveEvent(ccEvent(0, 7, 50), 0);
        // Melodize the drum part (bank MSB 0x79 + program change).
        engine.receiveEvent(ccEvent(9, 0, 0x79), 0);
        engine.receiveEvent(programChange(9, 30), 0);
        expect(engine.instruments[9].patch).not.toBeInstanceOf(DrumKitPatch);
        const overriddenCh0 = engine.instruments[0].patch;

        engine.applyResetAll(1);

        expect(engine.instruments[0].volume).toBe(100);
        expect(engine.instruments[0].patch).not.toBe(overriddenCh0);
        // Bank MSB is back to 0 → channel 9 is the drum part again.
        expect(engine.instruments[9].patch).toBeInstanceOf(DrumKitPatch);
    });

    it("is triggered by GS Reset SysEx, programs included", () => {
        const engine = new SynthEngine(makeEngineContext(), makeNode() as AudioNode);

        engine.receiveEvent(ccEvent(9, 0, 0x79), 0);
        engine.receiveEvent(programChange(9, 30), 0);
        engine.receiveEvent(ccEvent(0, 7, 50), 0);
        expect(engine.instruments[9].patch).not.toBeInstanceOf(DrumKitPatch);

        engine.receiveEvent(new SystemExclusiveEvent(dv(...GS_BODY), 0, 0xf0), 1);

        expect(engine.instruments[0].volume).toBe(100);
        expect(engine.instruments[9].patch).toBeInstanceOf(DrumKitPatch);
    });
});
