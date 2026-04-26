import { describe, expect, it } from "vitest";
import { Timer, TimeStamp } from "../../src/player/timer.js";

const fakeContext = (initial = 0): AudioContext & { currentTime: number } => {
    const ctx = { currentTime: initial };
    return ctx as unknown as AudioContext & { currentTime: number };
};

describe("Timer", () => {
    it("derives ticksPerSecond from resolution and secondsPerBeat", () => {
        const timer = new Timer(fakeContext());
        // default beatsPerMinute = 120, resolution = 480
        // secondsPerBeat = 0.5, ticksPerSecond = 480 / 0.5 = 960
        expect(timer.beatsPerMinute).toBe(120);
        expect(timer.ticksPerSecond).toBe(960);
    });

    it("setting beatsPerMinute updates secondsPerBeat", () => {
        const timer = new Timer(fakeContext());
        timer.beatsPerMinute = 60;
        expect(timer.secondsPerBeat).toBe(1);
        expect(timer.ticksPerSecond).toBe(480);
    });

    it("timing() advances tick by ticksPerSecond × actual elapsed audio time", () => {
        const ctx = fakeContext();
        const timer = new Timer(ctx);
        timer.currentTime = 0;
        timer.tick = 0;

        // Simulate 50ms of audio time elapsing (more than the 25ms scheduler interval)
        ctx.currentTime = 0.05;
        timer.timing();
        expect(timer.tick).toBeCloseTo(960 * 0.05, 6); // 48 ticks
        expect(timer.oldTick).toBe(0);
        expect(timer.currentTime).toBe(0.05);

        // Another 200ms (a long stall) — tick advance should reflect it
        ctx.currentTime = 0.25;
        timer.timing();
        expect(timer.tick).toBeCloseTo(960 * 0.25, 6); // 240 ticks
        expect(timer.oldTick).toBeCloseTo(48, 6);
    });

    it("createTimeStamp captures the current anchor", () => {
        const ctx = fakeContext(1.5);
        const timer = new Timer(ctx);
        timer.currentTime = 1.5;
        timer.tick = 100;
        timer.oldTick = 80;
        const ts = timer.createTimeStamp();
        expect(ts).toBeInstanceOf(TimeStamp);
        expect(ts.currentTime).toBe(1.5);
        expect(ts.tick).toBe(100);
        expect(ts.oldTick).toBe(80);
        expect(ts.delayInSeconds).toBe(0.2);
        expect(ts.ticksPerSecond).toBe(960);
    });

    it("TimeStamp.accurateTime maps a tick to audio time using oldTick anchor + lookahead", () => {
        const ts = new TimeStamp();
        ts.tick = 100;
        ts.oldTick = 80;
        ts.currentTime = 2.0;
        ts.delayInSeconds = 0.2;
        ts.ticksPerSecond = 960;
        // tick 80 → 2.0 + 0.2 + 0 = 2.2
        expect(ts.accurateTime(80)).toBeCloseTo(2.2, 6);
        // tick 100 → 2.0 + 0.2 + 20/960 ≈ 2.220833
        expect(ts.accurateTime(100)).toBeCloseTo(2.0 + 0.2 + 20 / 960, 6);
    });
});
