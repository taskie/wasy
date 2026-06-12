import { describe, expect, it } from "vitest";
import {
    cancelAndHold,
    cancelScheduled,
    scheduleLinearRamp,
    scheduleValueAtTime,
    valueAtTime,
} from "../../src/synth/audio-param.js";

type ParamCall =
    | { kind: "setValueAtTime"; value: number; time: number }
    | { kind: "linearRampToValueAtTime"; value: number; time: number }
    | { kind: "cancelScheduledValues"; time: number }
    | { kind: "cancelAndHoldAtTime"; time: number };

// Param without native cancelAndHoldAtTime — exercises the shadow-tracking
// fallback path (Firefox).
const fallbackParam = (initial = 0) => {
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
    };
    return param as unknown as AudioParam & { calls: ParamCall[] };
};

const nativeParam = (initial = 0) => {
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
    };
    return param as unknown as AudioParam & { calls: ParamCall[] };
};

describe("valueAtTime", () => {
    it("falls back to param.value when nothing is tracked", () => {
        const param = fallbackParam(0.42);
        expect(valueAtTime(param, 1)).toBe(0.42);
    });

    it("falls back to param.value before the first tracked event", () => {
        const param = fallbackParam(0.42);
        scheduleValueAtTime(param, 1, 1);
        expect(valueAtTime(param, 0.5)).toBe(0.42);
    });

    it("interpolates linearly inside a ramp segment", () => {
        const param = fallbackParam();
        scheduleValueAtTime(param, 1, 0);
        scheduleLinearRamp(param, 0, 2);
        expect(valueAtTime(param, 0.5)).toBeCloseTo(0.75);
        expect(valueAtTime(param, 2)).toBeCloseTo(0);
    });

    it("holds step values between setValueAtTime events and after the last one", () => {
        const param = fallbackParam();
        scheduleValueAtTime(param, 1, 0);
        scheduleValueAtTime(param, 3, 1);
        expect(valueAtTime(param, 0.5)).toBe(1);
        expect(valueAtTime(param, 1)).toBe(3);
        expect(valueAtTime(param, 2)).toBe(3);
    });

    it("keeps enough history for a release landing mid-attack", () => {
        const param = fallbackParam(0);
        // AHDSFR-like schedule: attack anchor + ramp, hold anchor, decay
        // ramp, long fade ramp — five inserts before any query.
        scheduleValueAtTime(param, 0, 1.0);
        scheduleLinearRamp(param, 1, 1.005);
        scheduleValueAtTime(param, 1, 1.105);
        scheduleLinearRamp(param, 0.5, 1.305);
        scheduleLinearRamp(param, 0, 9.305);
        // A NoteOff scheduled mid-attack queries a time *earlier* than the
        // already-inserted decay / fade events. Pruning must not have
        // dropped the attack segment, or this would fall back to the stale
        // `param.value` (0) and silence the note.
        expect(valueAtTime(param, 1.002)).toBeCloseTo(0.4);
    });

    it("survives pruning of stale events on long-lived params", () => {
        const param = fallbackParam();
        scheduleValueAtTime(param, 0, 0);
        scheduleLinearRamp(param, 1, 1);
        scheduleValueAtTime(param, 1, 2);
        scheduleLinearRamp(param, 0, 3);
        // The segment in flight must still interpolate after older events
        // were dropped.
        expect(valueAtTime(param, 2.5)).toBeCloseTo(0.5);
    });
});

describe("cancelAndHold", () => {
    it("never uses native cancelAndHoldAtTime, even when available", () => {
        // The native method inserts a hold event only when it truncates a
        // spanning event. Releasing a *sustained* note (all envelope events
        // already in the past) would insert nothing, and the following
        // release ramp would anchor at the attack end — audibly starting
        // the release a full lookahead early on Chrome / Safari.
        const param = nativeParam();
        cancelAndHold(param, 1.5);
        expect(param.calls.find((c) => c.kind === "cancelAndHoldAtTime")).toBeUndefined();
        expect(param.calls).toContainEqual({ kind: "cancelScheduledValues", time: 1.5 });
        expect(param.calls).toContainEqual({
            kind: "linearRampToValueAtTime",
            value: 0,
            time: 1.5,
        });
    });

    it("shadow-tracks every param, native support or not", () => {
        const param = nativeParam(42);
        scheduleValueAtTime(param, 7, 0);
        expect(valueAtTime(param, 1)).toBe(7);
    });

    it("anchors a held-note release at the hold time, not at the attack end", () => {
        const param = nativeParam(0);
        // Sustained note: attack finishes long before the NoteOff; nothing
        // is scheduled after the hold time.
        scheduleValueAtTime(param, 0, 1.0);
        scheduleLinearRamp(param, 1, 1.005);

        cancelAndHold(param, 3.0);

        const hold = param.calls.find(
            (c) => c.kind === "linearRampToValueAtTime" && c.time === 3.0,
        );
        expect(hold).toBeDefined();
        expect((hold as { value: number }).value).toBeCloseTo(1);
        // A release ramp scheduled next now starts from (3.0, 1) instead of
        // sloping down from the attack end at 1.005.
        expect(valueAtTime(param, 3.0)).toBeCloseTo(1);
    });

    it("reconstructs an in-flight decay instead of snapping back to its peak", () => {
        const param = nativeParam(0);
        // Long decay (e.g. a crash cymbal): peak at 0, ramping to 0 at 2.0.
        scheduleValueAtTime(param, 1, 0);
        scheduleLinearRamp(param, 0, 2.0);

        // Expired mid-decay (next hit scheduled at 1.0, a lookahead ahead
        // of "now"). cancelScheduledValues removes the whole in-flight
        // ramp, so the anchor must be a ramp to (1.0, 0.5) that re-traces
        // the original line — a setValueAtTime anchor would leave the
        // param at the full peak for the entire lookahead window.
        cancelAndHold(param, 1.0);

        const anchor = param.calls.find(
            (c) => c.kind === "linearRampToValueAtTime" && c.time === 1.0,
        );
        expect(anchor).toBeDefined();
        expect((anchor as { value: number }).value).toBeCloseTo(0.5);
        // The shadow list still interpolates the reconstructed segment.
        expect(valueAtTime(param, 0.5)).toBeCloseTo(0.75);
        expect(valueAtTime(param, 1.0)).toBeCloseTo(0.5);
    });

    it("anchors the fallback at the scheduled value at `time`, not param.value", () => {
        const param = fallbackParam(0);
        scheduleValueAtTime(param, 1, 0);
        scheduleLinearRamp(param, 0, 2);
        cancelAndHold(param, 0.5);
        expect(param.calls).toContainEqual({ kind: "cancelScheduledValues", time: 0.5 });
        const hold = param.calls.find(
            (c) => c.kind === "linearRampToValueAtTime" && c.time === 0.5,
        );
        expect(hold).toBeDefined();
        expect((hold as { value: number }).value).toBeCloseTo(0.75);
        // The held value persists in the shadow list for later queries.
        expect(valueAtTime(param, 1.5)).toBeCloseTo(0.75);
    });
});

describe("cancelScheduled", () => {
    it("removes events at or after `time`, including an in-flight ramp", () => {
        const param = fallbackParam();
        scheduleValueAtTime(param, 1, 0);
        scheduleLinearRamp(param, 0, 2);
        cancelScheduled(param, 1);
        // The ramp (event time 2 >= 1) is gone; the set at 0 remains.
        expect(valueAtTime(param, 1.5)).toBe(1);
        expect(param.calls).toContainEqual({ kind: "cancelScheduledValues", time: 1 });
    });
});
