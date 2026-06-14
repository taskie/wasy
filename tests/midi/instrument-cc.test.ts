import { describe, expect, it } from "vitest";
import { Instrument, type Patch } from "../../src/midi/instrument.js";
import { Event, NoteOffEvent } from "../../src/midi/event.js";

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

// Exposes the params we assert on: gains in construction order
// ([3] = modulation depth) and the single oscillator's frequency
// (the vibrato LFO).
const makeContext = () => {
    const gains: RecordingParam[] = [];
    const oscFreqs: RecordingParam[] = [];
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
        createOscillator: () => {
            const frequency = recordingParam();
            oscFreqs.push(frequency);
            return fakeNode({ frequency, type: "sine", start() {}, stop() {} });
        },
    };
    return {
        ctx: ctx as unknown as AudioContext,
        modDepth: () => gains[3],
        lfoFreq: () => oscFreqs[0],
    };
};

const dv = (...bytes: number[]) => new DataView(Uint8Array.from(bytes).buffer);
const cc = (controller: number, value: number) => Event.create(dv(controller, value), 0, 0xb0);

const lastRampValue = (param: RecordingParam): number | undefined => {
    const c = param.calls.findLast((x) => x.kind === "linearRampToValueAtTime");
    return c?.kind === "linearRampToValueAtTime" ? c.value : undefined;
};

class RecordingPatch implements Patch<unknown> {
    received: Array<{ event: Event; time: number }> = [];
    receiveEvent(event: Event, time: number) {
        this.received.push({ event, time });
    }
}

describe("Vibrato controllers (CC 76 / CC 77 / CC 1 / RPN 5)", () => {
    it("CC 76 sets the LFO rate (64 = 5 Hz, ±octave across the range)", () => {
        const { ctx, lfoFreq } = makeContext();
        const inst = new Instrument(ctx, {} as AudioNode);

        inst.receiveEvent(cc(76, 64), 1);
        expect(lastRampValue(lfoFreq())).toBeCloseTo(5);
        inst.receiveEvent(cc(76, 0), 2);
        expect(lastRampValue(lfoFreq())).toBeCloseTo(2.5);
        inst.receiveEvent(cc(76, 127), 3);
        expect(lastRampValue(lfoFreq())).toBeCloseTo(5 * 2 ** (63 / 64));
    });

    it("Mod Wheel (CC 1) maps to a fraction of the modulation depth range", () => {
        const { ctx, modDepth } = makeContext();
        const inst = new Instrument(ctx, {} as AudioNode);

        // Default modDepthRange = 50 cents; full wheel = full range.
        inst.receiveEvent(cc(1, 127), 1);
        expect(lastRampValue(modDepth())).toBeCloseTo(50);
        inst.receiveEvent(cc(1, 0), 2);
        expect(lastRampValue(modDepth())).toBeCloseTo(0);
    });

    it("CC 77 default (64) adds nothing; raising it drives vibrato on its own", () => {
        const { ctx, modDepth } = makeContext();
        const inst = new Instrument(ctx, {} as AudioNode);

        inst.receiveEvent(cc(77, 64), 1); // GM2 default — no change
        expect(lastRampValue(modDepth())).toBeCloseTo(0);
        inst.receiveEvent(cc(77, 127), 2); // ≈ full depth without the wheel
        expect(lastRampValue(modDepth())).toBeCloseTo(50 * (63 / 64));
    });

    it("RPN 5 (Modulation Depth Range) rescales the wheel's full-scale depth", () => {
        const { ctx, modDepth } = makeContext();
        const inst = new Instrument(ctx, {} as AudioNode);

        // RPN 5 = 2 semitones (MSB 2, LSB 0) → 200 cents.
        inst.receiveEvent(cc(101, 0), 0); // RPN MSB
        inst.receiveEvent(cc(100, 5), 0); // RPN LSB → RPN 5
        inst.receiveEvent(cc(6, 2), 0); // Data Entry MSB = 2 semitones
        inst.receiveEvent(cc(1, 127), 1); // full wheel

        expect(lastRampValue(modDepth())).toBeCloseTo(200);
    });
});

describe("All Notes Off (CC 123 and CC 124–127)", () => {
    const setup = () => {
        const { ctx } = makeContext();
        const inst = new Instrument<unknown>(ctx, {} as AudioNode);
        const patch = new RecordingPatch();
        inst.patch = patch;
        return { inst, patch };
    };

    it("releases every sounding note with a NoteOff (keeps the release tail)", () => {
        const { inst, patch } = setup();
        inst.registerNote(60, {}, 0);
        inst.registerNote(64, {}, 0);
        inst.registerNote(67, {}, 0);

        inst.receiveEvent(cc(123, 0), 5);

        const offs = patch.received.filter(
            (r): r is { event: NoteOffEvent; time: number } => r.event instanceof NoteOffEvent,
        );
        expect(offs.map((r) => r.event.noteNumber).toSorted((a, b) => a - b)).toEqual([60, 64, 67]);
        expect(offs.every((r) => r.time === 5)).toBe(true);
    });

    it("CC 124–127 each imply All Notes Off", () => {
        for (const mode of [124, 125, 126, 127]) {
            const { inst, patch } = setup();
            inst.registerNote(60, {}, 0);
            inst.receiveEvent(cc(mode, 0), 2);
            const offs = patch.received.filter((r) => r.event instanceof NoteOffEvent);
            expect(offs).toHaveLength(1);
        }
    });

    it("lifts the sustain pedal and releases pedal-held notes", () => {
        const { inst, patch } = setup();
        inst.registerNote(60, {}, 0);
        inst.receiveEvent(cc(64, 127), 0); // sustain on
        expect(inst.sustain).toBe(true);

        inst.receiveEvent(cc(123, 0), 3);

        expect(inst.sustain).toBe(false);
        expect(patch.received.filter((r) => r.event instanceof NoteOffEvent)).toHaveLength(1);
    });

    it("CC 122 (Local Control) is a no-op", () => {
        const { inst, patch } = setup();
        inst.registerNote(60, {}, 0);
        inst.receiveEvent(cc(122, 0), 1);
        expect(patch.received).toHaveLength(0);
    });
});
