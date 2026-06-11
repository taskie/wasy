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
    it("delegates to native cancelAndHoldAtTime when available", () => {
        const param = nativeParam();
        cancelAndHold(param, 1.5);
        expect(param.calls).toEqual([{ kind: "cancelAndHoldAtTime", time: 1.5 }]);
    });

    it("does not shadow-track params with native support", () => {
        const param = nativeParam(42);
        scheduleValueAtTime(param, 7, 0);
        // Untracked → falls back to param.value, not the scheduled 7.
        expect(valueAtTime(param, 1)).toBe(42);
    });

    it("anchors the fallback at the scheduled value at `time`, not param.value", () => {
        const param = fallbackParam(0);
        scheduleValueAtTime(param, 1, 0);
        scheduleLinearRamp(param, 0, 2);
        cancelAndHold(param, 0.5);
        expect(param.calls).toContainEqual({ kind: "cancelScheduledValues", time: 0.5 });
        const hold = param.calls.find((c) => c.kind === "setValueAtTime" && c.time === 0.5);
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
