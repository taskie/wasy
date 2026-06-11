import { describe, expect, it } from "vitest";
import { Instrument } from "../../src/midi/instrument.js";
import { Event } from "../../src/midi/event.js";

type ParamCall =
    | { kind: "setValueAtTime"; value: number; time: number }
    | { kind: "linearRampToValueAtTime"; value: number; time: number }
    | { kind: "cancelScheduledValues"; time: number };

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
type RecordingParam = ReturnType<typeof recordingParam>;

const fakeNode = (extras: Record<string, unknown> = {}) => ({
    connect() {},
    disconnect() {},
    ...extras,
});

// Collects the params of every GainNode the Instrument creates, in
// construction order: [0] channel gain, [1] reverb send, [2] chorus send,
// [3] modulation depth.
const makeContext = () => {
    const gains: RecordingParam[] = [];
    const ctx = {
        currentTime: 0,
        createStereoPanner: () => fakeNode({ pan: recordingParam() }),
        createGain: () => {
            const gain = recordingParam();
            gains.push(gain);
            return fakeNode({ gain });
        },
        createConstantSource: () => fakeNode({ offset: recordingParam(), start() {}, stop() {} }),
        createBiquadFilter: () =>
            fakeNode({ frequency: recordingParam(), Q: recordingParam(), type: "lowpass" }),
        createOscillator: () =>
            fakeNode({ frequency: recordingParam(), type: "sine", start() {}, stop() {} }),
    };
    return { ctx: ctx as unknown as AudioContext, gains };
};

const dv = (...bytes: number[]) => new DataView(Uint8Array.from(bytes).buffer);
const cc = (channel: number, controller: number, value: number) =>
    Event.create(dv(controller, value), 0, 0xb0 | channel);
const pitchBend = (channel: number, lsb: number, msb: number) =>
    Event.create(dv(lsb, msb), 0, 0xe0 | channel);

const lastRamp = (param: RecordingParam) =>
    param.calls.findLast((c) => c.kind === "linearRampToValueAtTime") as
        | { kind: "linearRampToValueAtTime"; value: number; time: number }
        | undefined;

describe("ResetAllControllers (CC 121) — RP-015 scope", () => {
    it("resets performance controllers but preserves channel setup", () => {
        const { ctx } = makeContext();
        const inst = new Instrument<unknown>(ctx, {} as AudioNode);

        inst.receiveEvent(cc(0, 0, 5), 0); // Bank MSB
        inst.receiveEvent(cc(0, 7, 50), 0); // Volume
        inst.receiveEvent(cc(0, 10, 100), 0); // Panpot
        inst.receiveEvent(cc(0, 11, 80), 0); // Expression
        inst.receiveEvent(cc(0, 1, 64), 0); // Modulation
        inst.receiveEvent(cc(0, 91, 80), 0); // Reverb send
        inst.receiveEvent(cc(0, 93, 70), 0); // Chorus send
        // RPN 0 → pitch bend range 4 semitones
        inst.receiveEvent(cc(0, 101, 0), 0);
        inst.receiveEvent(cc(0, 100, 0), 0);
        inst.receiveEvent(cc(0, 6, 4), 0);
        inst.receiveEvent(pitchBend(0, 0, 0x50), 0);
        expect(inst.pitchBend).toBe(2048);

        inst.receiveEvent(cc(0, 121, 0), 1);

        // RP-015 resets: modulation, expression, pitch bend, RPN selection.
        expect(inst.modulationValue).toBe(0);
        expect(inst.expression).toBe(127);
        expect(inst.pitchBend).toBe(0);
        // RP-015 preserves: volume, pan, bank, sends, and RPN *values*.
        expect(inst.volume).toBe(50);
        expect(inst.panpot).toBe(100);
        expect(inst.bankMSB).toBe(5);
        expect(inst.reverbSendValue).toBe(80);
        expect(inst.chorusSendValue).toBe(70);
        expect(inst.pitchBendRange).toBe(4);
    });

    it("nulls the RPN selection so a stray DataEntry no longer lands", () => {
        const { ctx } = makeContext();
        const inst = new Instrument<unknown>(ctx, {} as AudioNode);
        inst.receiveEvent(cc(0, 101, 0), 0);
        inst.receiveEvent(cc(0, 100, 0), 0);
        inst.receiveEvent(cc(0, 6, 4), 0);
        expect(inst.pitchBendRange).toBe(4);

        inst.receiveEvent(cc(0, 121, 0), 1);
        inst.receiveEvent(cc(0, 6, 12), 2); // DataEntry without a selected RPN

        expect(inst.pitchBendRange).toBe(4);
    });
});

describe("AllSoundOff (CC 120)", () => {
    it("expires notes at the event's scheduled audio time", () => {
        const { ctx } = makeContext();
        const inst = new Instrument<unknown>(ctx, {} as AudioNode);
        const expiredTimes: number[] = [];
        inst.onExpired((message) => expiredTimes.push(message.time));
        inst.registerNote(60, {}, 0);

        inst.receiveEvent(cc(0, 120, 0), 5);

        // Under the player's ~200 ms lookahead, expiring at time 0 (the
        // old default) would cut the sound early; the CC's audio time
        // must flow through to the expire notification.
        expect(expiredTimes).toEqual([5]);
    });
});

describe("GM2 volume / expression curve", () => {
    it("ramps the channel gain to (volume/127)² × (expression/127)²", () => {
        const { ctx, gains } = makeContext();
        const inst = new Instrument<unknown>(ctx, {} as AudioNode);
        const channelGain = gains[0];

        inst.receiveEvent(cc(0, 7, 100), 1);
        expect(lastRamp(channelGain)?.value).toBeCloseTo((100 / 127) ** 2);

        inst.receiveEvent(cc(0, 11, 64), 2);
        expect(lastRamp(channelGain)?.value).toBeCloseTo((100 / 127) ** 2 * (64 / 127) ** 2);
    });

    it("initializes the gain node at the GM default level (volume 100)", () => {
        const { gains, ctx } = makeContext();
        const inst = new Instrument<unknown>(ctx, {} as AudioNode);
        expect(inst.volume).toBe(100);
        expect(gains[0].value).toBeCloseTo((100 / 127) ** 2);
    });
});

describe("GM2 default sends", () => {
    it("defaults reverb send to 40 and chorus to 0", () => {
        const { ctx, gains } = makeContext();
        const inst = new Instrument<unknown>(ctx, {} as AudioNode);
        expect(inst.reverbSendValue).toBe(40);
        expect(inst.chorusSendValue).toBe(0);
        expect(gains[1].value).toBeCloseTo(40 / 127);
        expect(gains[2].value).toBe(0);
    });
});
