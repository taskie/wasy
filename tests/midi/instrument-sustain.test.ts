import { describe, expect, it } from "vitest";
import { Instrument, type Patch } from "../../src/midi/instrument.js";
import {
    Event,
    NoteOffEvent,
    NoteOnEvent,
} from "../../src/midi/event.js";

const fakeParam = () => ({
    value: 0,
    cancelScheduledValues() {},
    setValueAtTime() {},
    linearRampToValueAtTime() {},
});
const fakeNode = (extras: Record<string, unknown> = {}) => ({
    connect() {},
    disconnect() {},
    ...extras,
});
const fakeAudioContext = (): AudioContext => ({
    currentTime: 0,
    createStereoPanner: () => fakeNode({ pan: fakeParam() }),
    createGain: () => fakeNode({ gain: fakeParam() }),
}) as unknown as AudioContext;

const dv = (...bytes: number[]) => new DataView(Uint8Array.from(bytes).buffer);
const noteOn = (channel: number, note: number, vel: number) =>
    Event.create(dv(note, vel), 0, 0x90 | channel) as NoteOnEvent;
const noteOff = (channel: number, note: number) =>
    Event.create(dv(note, 0x40), 0, 0x80 | channel) as NoteOffEvent;
const cc = (channel: number, controller: number, value: number) =>
    Event.create(dv(controller, value), 0, 0xB0 | channel);

class RecordingPatch implements Patch<unknown> {
    received: Array<{ event: Event; time: number }> = [];
    receiveEvent(event: Event, time: number) {
        this.received.push({ event, time });
    }
}

const makeInstrument = () => {
    const inst = new Instrument<unknown>(fakeAudioContext(), {} as AudioNode);
    const patch = new RecordingPatch();
    inst.patch = patch;
    return { inst, patch };
};

describe("Instrument sustain pedal (CC 64)", () => {
    it("defaults to sustain off and forwards NoteOn / NoteOff immediately", () => {
        const { inst, patch } = makeInstrument();
        expect(inst.sustain).toBe(false);
        inst.receiveEvent(noteOn(0, 60, 100), 0);
        inst.receiveEvent(noteOff(0, 60), 1);
        expect(patch.received).toHaveLength(2);
        expect(patch.received[0].event).toBeInstanceOf(NoteOnEvent);
        expect(patch.received[1].event).toBeInstanceOf(NoteOffEvent);
    });

    it("CC 64 ≥ 64 enters sustain, < 64 exits sustain", () => {
        const { inst } = makeInstrument();
        inst.receiveEvent(cc(0, 64, 64), 0);
        expect(inst.sustain).toBe(true);
        inst.receiveEvent(cc(0, 64, 63), 1);
        expect(inst.sustain).toBe(false);
    });

    it("defers NoteOff while sustain is held", () => {
        const { inst, patch } = makeInstrument();
        inst.receiveEvent(cc(0, 64, 127), 0);
        inst.receiveEvent(noteOn(0, 60, 100), 1);
        inst.receiveEvent(noteOff(0, 60), 2);
        // Patch saw the NoteOn but not the NoteOff yet.
        expect(patch.received).toHaveLength(1);
        expect(patch.received[0].event).toBeInstanceOf(NoteOnEvent);
    });

    it("dispatches deferred NoteOffs at the pedal-release time when the pedal lifts", () => {
        const { inst, patch } = makeInstrument();
        inst.receiveEvent(cc(0, 64, 127), 0);
        inst.receiveEvent(noteOn(0, 60, 100), 1);
        inst.receiveEvent(noteOn(0, 64, 100), 1);
        inst.receiveEvent(noteOff(0, 60), 2);
        inst.receiveEvent(noteOff(0, 64), 3);
        // Pedal up at time 5
        inst.receiveEvent(cc(0, 64, 0), 5);
        const offs = patch.received
            .filter((r): r is { event: NoteOffEvent; time: number } => r.event instanceof NoteOffEvent)
            .map((r) => ({ note: r.event.noteNumber, time: r.time }));
        expect(offs).toEqual([
            { note: 60, time: 5 },
            { note: 64, time: 5 },
        ]);
    });

    it("re-pressing a sustained note cancels its deferred NoteOff", () => {
        const { inst, patch } = makeInstrument();
        inst.receiveEvent(cc(0, 64, 127), 0);
        inst.receiveEvent(noteOn(0, 60, 100), 1);
        inst.receiveEvent(noteOff(0, 60), 2);
        // Re-attack supersedes the pending release.
        inst.receiveEvent(noteOn(0, 60, 110), 3);
        inst.receiveEvent(cc(0, 64, 0), 4);
        const offs = patch.received.filter((r) => r.event instanceof NoteOffEvent);
        expect(offs).toHaveLength(0);
        const ons = patch.received.filter((r) => r.event instanceof NoteOnEvent);
        expect(ons).toHaveLength(2);
    });

    it("AllSoundOff (CC 120) clears deferred NoteOffs without dispatching", () => {
        const { inst, patch } = makeInstrument();
        inst.receiveEvent(cc(0, 64, 127), 0);
        inst.receiveEvent(noteOn(0, 60, 100), 1);
        inst.receiveEvent(noteOff(0, 60), 2);
        inst.receiveEvent(cc(0, 120, 0), 3);
        inst.receiveEvent(cc(0, 64, 0), 4);
        const offs = patch.received.filter((r) => r.event instanceof NoteOffEvent);
        expect(offs).toHaveLength(0);
    });

    it("ResetAllControl (CC 121) clears sustain state and pending NoteOffs", () => {
        const { inst, patch } = makeInstrument();
        inst.receiveEvent(cc(0, 64, 127), 0);
        inst.receiveEvent(noteOn(0, 60, 100), 1);
        inst.receiveEvent(noteOff(0, 60), 2);
        inst.receiveEvent(cc(0, 121, 0), 3);
        expect(inst.sustain).toBe(false);
        // Pedal already off after reset; no deferred NoteOff should remain.
        inst.receiveEvent(cc(0, 64, 0), 4);
        const offs = patch.received.filter((r) => r.event instanceof NoteOffEvent);
        expect(offs).toHaveLength(0);
    });
});
