import { describe, expect, it } from "vitest";
import { SmfPlayer } from "../src/smf-player.js";

const fakeAudioContext = () => ({ currentTime: 0 }) as unknown as AudioContext;

describe("SmfPlayer.lookaheadSeconds", () => {
    it("defaults to 200 ms and writes through to Timer.delayInSeconds", () => {
        const player = new SmfPlayer(fakeAudioContext());
        expect(player.lookaheadSeconds).toBeCloseTo(0.2);

        player.lookaheadSeconds = 0.1;
        expect(player.lookaheadSeconds).toBeCloseTo(0.1);
        expect(player.timer.delayInSeconds).toBeCloseTo(0.1);
    });

    it("clamps to the safe range", () => {
        const player = new SmfPlayer(fakeAudioContext());
        // Below the floor, events would be scheduled in the past under
        // setInterval jitter (25 ms wake-ups).
        player.lookaheadSeconds = 0.001;
        expect(player.lookaheadSeconds).toBeCloseTo(0.05);
        player.lookaheadSeconds = 5;
        expect(player.lookaheadSeconds).toBeCloseTo(1.0);
    });
});

describe("SmfPlayer.audibleTick", () => {
    it("trails the scheduling frontier by the lookahead and catches up with audio time", () => {
        const ctx = { currentTime: 0 } as unknown as AudioContext & { currentTime: number };
        const player = new SmfPlayer(ctx);
        // Default: resolution 480, 120 BPM → 960 ticks/second.
        player.timer.tick = 1000;
        player.timer.currentTime = 10;
        ctx.currentTime = 10;

        // At the instant the frontier was advanced, the audible position
        // lags by lookahead × ticksPerSecond (= 0.2 s × 960 = 192 ticks).
        expect(player.audibleTick).toBeCloseTo(1000 - 192);
        // As the audio clock advances, the audible position catches up…
        ctx.currentTime = 10.2;
        expect(player.audibleTick).toBeCloseTo(1000);
        // …but never overtakes the frontier.
        ctx.currentTime = 10.5;
        expect(player.audibleTick).toBeCloseTo(1000);
    });

    it("clamps at 0 around song start and freezes at the frontier while paused", () => {
        const ctx = { currentTime: 0 } as unknown as AudioContext & { currentTime: number };
        const player = new SmfPlayer(ctx);
        player.timer.tick = 50;
        player.timer.currentTime = 0;
        // Audible position would be negative during the first lookahead
        // window — nothing has reached the speakers yet.
        expect(player.audibleTick).toBe(0);

        player.paused = true;
        player.timer.tick = 500;
        ctx.currentTime = 100; // real time keeps flowing while paused
        expect(player.audibleTick).toBe(500);
    });
});

describe("SmfPlayer.unload", () => {
    it("resets the timer tempo to the SMF default (120 BPM)", () => {
        const player = new SmfPlayer(fakeAudioContext());
        // Simulate a previous song that ended on a slow tempo event.
        player.timer.beatsPerMinute = 60;

        player.unload();

        // A new file with no tempo event must play at the SMF default,
        // not at the previous song's last tempo.
        expect(player.timer.beatsPerMinute).toBeCloseTo(120);
        expect(player.timer.tick).toBe(0);
    });
});
